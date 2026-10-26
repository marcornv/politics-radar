import asyncio
import json

import httpx
import pytest

from radar_ia import agenda, config
from radar_ia.agenda import AgendaItem, agenda_status, cosine, document_text, rank_items, truncate
from radar_ia.provedores import ErroIA


@pytest.fixture
def chaves(tmp_path, monkeypatch):
    """Empty chaves.json, clean environment and a cache under tmp; returns a writer for the file."""
    arquivo = tmp_path / "chaves.json"
    monkeypatch.setattr(config, "ARQUIVO", arquivo)
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache" / "resumos")
    for v in ["IA_CONTEXTO", "EMBEDDING_URL", "EMBEDDING_MODEL"]:
        monkeypatch.delenv(v, raising=False)
    return lambda **dados: arquivo.write_text(json.dumps(dados))


# Two-dimensional "embeddings": health points one way, roads the other, everything else in between.
def _vetor(texto: str) -> list[float]:
    if "medicina" in texto or "saúde" in texto:
        return [1.0, 0.1]
    if "rodovia" in texto:
        return [0.0, 1.0]
    return [0.5, 0.5]


@pytest.fixture
def ollama(monkeypatch):
    """Fakes embed; returns the list of batches sent, to count what reached the model."""
    lotes = []

    async def falso(client, textos):
        lotes.append(textos)
        return [_vetor(t) for t in textos]

    monkeypatch.setattr(agenda, "embed", falso)
    return lotes


ITENS = [
    AgendaItem(key="c:1", title="PL 1/2026", summary="Denomina rodovia federal."),
    AgendaItem(key="c:2", title="PL 2/2026", summary="Muda o internato do curso de medicina."),
    AgendaItem(key="c:3", title="PL 3/2026", summary="Cria o programa Leitura nas Escolas."),
    AgendaItem(key="c:4", title="REQ 4/2026", summary=None),
]


def test_truncate():
    assert truncate("curto", 10) == "curto"
    assert truncate("uma frase com várias palavras", 15) == "uma frase com…"
    assert len(truncate("x" * 50, 10)) == 10


def test_document_text_respeita_o_limite():
    texto = document_text(AgendaItem(key="c:1", title="PL 1/2026", summary="palavra " * 1000))
    assert len(texto) <= agenda.MAX_DOCUMENT_CHARS and texto.startswith("PL 1/2026: palavra")


def test_cosine():
    assert cosine([1, 0], [1, 0]) == pytest.approx(1)
    assert cosine([1, 0], [0, 1]) == pytest.approx(0)
    assert cosine([0, 0], [1, 0]) == 0


def test_rank_items_ordena_e_pula_itens_sem_ementa(chaves, ollama):
    chaves(IA_CONTEXTO="Sou estudante de medicina.")
    r = asyncio.run(rank_items(ITENS, limit=2))
    assert [i.key for i in r.items] == ["c:2", "c:3"]
    assert r.model == "qwen3-embedding:0.6b"
    # One batch for the profile, one for the three bills with an ementa.
    assert [len(l) for l in ollama] == [1, 3]


def test_rank_items_sem_perfil(chaves, ollama):
    chaves()
    with pytest.raises(ErroIA):
        asyncio.run(rank_items(ITENS))
    assert ollama == []


def test_rank_items_por_tema(chaves, ollama):
    # A topic wins over the profile, and works even without one.
    chaves(IA_CONTEXTO="Sou motorista e passo o dia na rodovia.")
    r = asyncio.run(rank_items(ITENS, topic="saúde e medicina"))
    assert r.items[0].key == "c:2"
    assert ollama[0] == [agenda.query_text("saúde e medicina", agenda.TOPIC_INSTRUCTION)]

    chaves()
    assert asyncio.run(rank_items(ITENS, topic="rodovia")).items[0].key == "c:1"
    # Blank is the same as no topic.
    with pytest.raises(ErroIA):
        asyncio.run(rank_items(ITENS, topic="   "))


def test_embeddings_dos_itens_ficam_em_cache(chaves, ollama):
    chaves(IA_CONTEXTO="Sou estudante de medicina.")
    asyncio.run(rank_items(ITENS))
    # A new profile only embeds the profile: the bills were already embedded.
    chaves(IA_CONTEXTO="Sou motorista e passo o dia na rodovia.")
    r = asyncio.run(rank_items(ITENS))
    assert r.items[0].key == "c:1"
    assert [len(l) for l in ollama] == [1, 3, 1]

    # An edited ementa is embedded again.
    editado = [*ITENS[:2], AgendaItem(key="c:3", title="PL 3/2026", summary="Cria o programa Leitura nos Hospitais.")]
    asyncio.run(rank_items(editado))
    assert [len(l) for l in ollama] == [1, 3, 1, 1, 1]


def _tags(models: list[str]):
    return httpx.MockTransport(lambda req: httpx.Response(200, json={"models": [{"name": m} for m in models]}))


@pytest.mark.parametrize(
    ("models", "available"),
    [(["qwen3-embedding:0.6b", "gemma4:e2b"], True), (["llama3.1:8b"], False)],
)
def test_agenda_status(chaves, monkeypatch, models, available):
    chaves()
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=_tags(models), **kw))
    s = asyncio.run(agenda_status())
    assert s.available is available and s.model == "qwen3-embedding:0.6b"
    assert available or "ollama pull qwen3-embedding:0.6b" in s.reason


def test_agenda_status_usa_o_modelo_do_ambiente(chaves, monkeypatch):
    chaves()
    monkeypatch.setenv("EMBEDDING_MODEL", "qwen3-embedding:4b")
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=_tags(["qwen3-embedding:0.6b"]), **kw))
    s = asyncio.run(agenda_status())
    assert s.model == "qwen3-embedding:4b" and not s.available


def test_agenda_status_sem_ollama(chaves):
    chaves(EMBEDDING_URL="http://127.0.0.1:9")
    s = asyncio.run(agenda_status())
    assert not s.available and "não está respondendo" in s.reason
