"""Ranks upcoming agenda items by how much they matter to the reader described in Configurações.

Embeds the reader's profile and each bill's ementa with an Ollama embedding model (qwen3-embedding:0.6b by
default, `EMBEDDING_MODEL` to change it) and orders the bills by cosine similarity. Instead of the profile, the reader can type a topic ("saúde", "planos de saúde e SUS")
to see the agenda from another angle without changing "Sobre você".

A bill's embedding doesn't depend on the reader, so it is computed once and cached; ranking for a new or
edited profile only embeds the profile. Ranking runs only when the reader asks for it on the page.
"""

import hashlib
import logging
import math
import time
from datetime import UTC, datetime

import httpx
from pydantic import BaseModel

from . import config
from .cache import read, write
from .provedores import ErroIA

log = logging.getLogger("radar_ia")

# qwen3-embedding expects an instruction on the query side only; documents go in as plain text.
PROFILE_INSTRUCTION = "Dado o perfil de um leitor, encontre projetos de lei que afetam os estudos, o trabalho ou o dia a dia dessa pessoa"
TOPIC_INSTRUCTION = "Dado um tema, encontre projetos de lei que tratam desse tema"
MAX_TOPIC_CHARS = 300
# Ementas are short, but a few run long; past this the extra text barely moves the vector and costs time.
MAX_DOCUMENT_CHARS = 2000
BATCH = 16
# Keyed by the ementa's hash, so a cached vector can only go stale if the model changes (it's in the key too).
EMBEDDING_TTL = 90 * 24 * 3600


class AgendaItem(BaseModel):
    key: str
    """Stable id of the bill (e.g. "camara:2345678"), so its embedding is reused across days and sessions."""
    title: str
    summary: str | None = None
    """The ementa; items without one are skipped, since a title alone says too little."""


class RankedItem(BaseModel):
    key: str
    score: float
    """Cosine similarity to the profile. Only meaningful to order this list, not as an absolute measure."""


class AgendaRanking(BaseModel):
    model: str
    items: list[RankedItem]
    """Most related first."""
    rankedAt: str


class AgendaStatus(BaseModel):
    model: str
    available: bool
    reason: str | None = None


def embedding_url() -> str:
    return (config.chave("EMBEDDING_URL") or "http://127.0.0.1:11434").rstrip("/")


def embedding_model() -> str:
    return config.chave("EMBEDDING_MODEL") or "qwen3-embedding:0.6b"


def reader_profile() -> str | None:
    return config.chave("IA_CONTEXTO")


def _cache_dir():
    return config.CACHE_DIR.parent / "pauta"


def _hash(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()[:12]


def truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    return (cut.rsplit(" ", 1)[0] if " " in cut else cut) + "…"


def document_text(item: AgendaItem) -> str:
    return truncate(f"{item.title}: {item.summary}", MAX_DOCUMENT_CHARS)


def query_text(text: str, instruction: str = PROFILE_INSTRUCTION) -> str:
    return f"Instruct: {instruction}\nQuery: {text}"


def _ollama_error(r: httpx.Response) -> ErroIA:
    try:
        detail = r.json().get("error", "")
    except ValueError:
        detail = r.text
    if r.status_code == 404 or "not found" in detail:
        model = embedding_model()
        return ErroIA("outro", f"O modelo {model} não está instalado no Ollama. Rode ollama pull {model}.", r.status_code)
    return ErroIA("outro", f"O Ollama recusou o pedido: {detail or r.status_code}", r.status_code)


async def embed(client: httpx.AsyncClient, texts: list[str]) -> list[list[float]]:
    try:
        r = await client.post(f"{embedding_url()}/api/embed", json={"model": embedding_model(), "input": texts})
    except (httpx.HTTPError, httpx.InvalidURL) as e:
        raise ErroIA("outro", f"O Ollama não está respondendo em {embedding_url()}.") from e
    if r.status_code != 200:
        raise _ollama_error(r)
    try:
        vectors = r.json()["embeddings"]
    except (ValueError, KeyError) as e:
        raise ErroIA("outro", "O Ollama devolveu uma resposta inesperada.") from e
    if len(vectors) != len(texts):
        raise ErroIA("outro", "O Ollama devolveu um número errado de vetores.")
    return vectors


def _item_cache_key(item: AgendaItem) -> str:
    return f"embedding:{embedding_model()}:{item.key}:{_hash(document_text(item))}"


async def embed_items(client: httpx.AsyncClient, items: list[AgendaItem]) -> list[list[float]]:
    """Cached vectors first; the missing ones go to Ollama in batches."""
    vectors: dict[str, list[float]] = {}
    missing: list[AgendaItem] = []
    for item in items:
        hit = read(_item_cache_key(item), _cache_dir())
        if hit and time.time() - hit["at"] < EMBEDDING_TTL:
            vectors[item.key] = hit["value"]["vector"]
        else:
            missing.append(item)
    for start in range(0, len(missing), BATCH):
        batch = missing[start : start + BATCH]
        for item, vector in zip(batch, await embed(client, [document_text(i) for i in batch])):
            write(_item_cache_key(item), _cache_dir(), {"vector": vector})
            vectors[item.key] = vector
    if missing:
        log.info("pauta: %d de %d itens novos embutidos", len(missing), len(items))
    return [vectors[i.key] for i in items]


def cosine(a: list[float], b: list[float]) -> float:
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return sum(x * y for x, y in zip(a, b)) / norm if norm else 0.0


async def rank_items(items: list[AgendaItem], limit: int = 5, topic: str | None = None) -> AgendaRanking:
    """By `topic` when given, otherwise by the reader's profile."""
    topic = (topic or "").strip()
    if topic:
        query = query_text(truncate(topic, MAX_TOPIC_CHARS), TOPIC_INSTRUCTION)
    elif profile := reader_profile():
        query = query_text(profile)
    else:
        raise ErroIA("outro", 'Preencha "Sobre você" em Configurações, ou digite um tema, para ordenar a pauta.')
    usable = list({i.key: i for i in items if i.summary and i.summary.strip()}.values())
    now = datetime.now(UTC).isoformat()
    if not usable:
        return AgendaRanking(model=embedding_model(), items=[], rankedAt=now)

    start = time.perf_counter()
    async with httpx.AsyncClient(timeout=300) as client:
        (query_vector,) = await embed(client, [query])
        documents = await embed_items(client, usable)
    ranked = sorted(
        (RankedItem(key=i.key, score=cosine(query_vector, d)) for i, d in zip(usable, documents)), key=lambda r: -r.score
    )
    log.info("pauta: %d itens ordenados por %s em %.1fs", len(ranked), embedding_model(), time.perf_counter() - start)
    return AgendaRanking(model=embedding_model(), items=ranked[:limit], rankedAt=now)


async def agenda_status() -> AgendaStatus:
    """Whether Ollama answers and has the embedding model, without running it."""
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            tags = (await client.get(f"{embedding_url()}/api/tags")).json().get("models", [])
    except (httpx.HTTPError, httpx.InvalidURL, ValueError):
        return AgendaStatus(model=embedding_model(), available=False, reason=f"O Ollama não está respondendo em {embedding_url()}.")
    model = embedding_model()
    names = {m.get("name") for m in tags}
    if model not in names and f"{model}:latest" not in names:
        return AgendaStatus(model=model, available=False, reason=f"Falta baixar o modelo: rode ollama pull {model}.")
    return AgendaStatus(model=model, available=True)
