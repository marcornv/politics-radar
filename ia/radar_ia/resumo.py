"""Plain-language summary of a bill: prompt, schema, validation and cache."""

import asyncio
import hashlib
import json
import logging
import time
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable, Literal

from pydantic import BaseModel

from . import config
from .provedores import ErroIA, gerar_json, modelo_de, provedor_ativo

log = logging.getLogger("radar_ia")


class Tramitacao(BaseModel):
    data: str
    orgao: str = ""
    descricao: str = ""
    despacho: str | None = None


class Proposicao(BaseModel):
    """The fields of `ProposicaoDetalhe` (src/lib/types.ts) the prompt uses; anything else sent is ignored."""

    id: str
    casa: Literal["camara", "senado"]
    sigla: str
    tipo: str
    ementa: str
    ementaDetalhada: str | None = None
    keywords: str | None = None
    autoria: str | None = None
    orgao: str = ""
    situacao: str = ""
    regime: str | None = None
    relator: str | None = None
    tramitacoes: list[Tramitacao] = []


class Resumo(BaseModel):
    sintese: str
    """One or two sentences, plain language."""
    mudancas: list[str]
    """What changes in practice, as short bullet points."""
    afetados: str
    """Who is affected."""
    proximoPasso: str
    """Where it stands and what comes next."""
    modelo: str
    geradoEm: str


SYSTEM = """Você explica proposições do Congresso brasileiro para um cidadão bem informado, mas que não é jurista.
Escreva em português do Brasil, linguagem simples e direta, sem juridiquês e sem opinião política.
Baseie-se apenas nos dados fornecidos. Se a ementa for vaga, diga o que dá para afirmar e não invente efeitos."""

# Written by hand rather than generated from `Resumo`: strict structured outputs need exactly this shape.
SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["sintese", "mudancas", "afetados", "proximoPasso"],
    "properties": {
        "sintese": {"type": "string", "description": "Uma ou duas frases dizendo o que a proposta faz."},
        "mudancas": {
            "type": "array",
            "items": {"type": "string"},
            "description": "De 2 a 4 itens curtos com o que muda na prática.",
        },
        "afetados": {"type": "string", "description": "Quem é afetado, em uma frase."},
        "proximoPasso": {
            "type": "string",
            "description": "Em que fase está e qual o próximo passo provável, em uma frase.",
        },
    },
}


def contexto(p: Proposicao) -> str:
    ultimas = "\n".join(
        f"- {t.data[:10]} [{t.orgao}] {t.descricao}{f': {t.despacho}' if t.despacho else ''}" for t in p.tramitacoes[:6]
    )
    linhas = [
        f"Casa: {'Câmara dos Deputados' if p.casa == 'camara' else 'Senado Federal'}",
        f"Proposição: {p.sigla} ({p.tipo})",
        p.autoria and f"Autoria: {p.autoria}",
        f"Ementa: {p.ementa}",
        p.ementaDetalhada and f"Ementa detalhada: {p.ementaDetalhada}",
        p.keywords and f"Indexação: {p.keywords}",
        f"Situação atual: {p.situacao} (órgão: {p.orgao})",
        p.regime and f"Regime: {p.regime}",
        p.relator and f"Relator: {p.relator}",
        ultimas and f"Últimas movimentações:\n{ultimas}",
    ]
    return "\n".join(l for l in linhas if l)


def _texto(v: object) -> bool:
    return isinstance(v, str) and v.strip() != ""


def validar(d: Any) -> dict[str, Any]:
    """Providers without strict structured outputs can drift from the schema; reject anything the card can't show."""
    if (
        isinstance(d, dict)
        and _texto(d.get("sintese"))
        and _texto(d.get("afetados"))
        and _texto(d.get("proximoPasso"))
        and isinstance(d.get("mudancas"), list)
        and all(_texto(m) for m in d["mudancas"])
    ):
        return {k: d[k] for k in ("sintese", "mudancas", "afetados", "proximoPasso")}
    raise ErroIA("outro", "A IA devolveu um resumo incompleto. Tente de novo ou use outro modelo.")


# ------------------------------------------------------------------ cache

TTL = 7 * 24 * 3600
_em_andamento: dict[str, asyncio.Task] = {}


def _arquivo(chave: str):
    return config.CACHE_DIR / f"{hashlib.sha1(chave.encode()).hexdigest()}.json"


def _ler_cache(chave: str) -> dict | None:
    try:
        return json.loads(_arquivo(chave).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _gravar_cache(chave: str, valor: dict) -> None:
    try:
        config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _arquivo(chave).write_text(json.dumps({"at": time.time(), "value": valor}, ensure_ascii=False), encoding="utf-8")
    except OSError:
        log.warning("não deu para gravar o cache de %s", chave)


async def _cacheado(chave: str, carregar: Callable[[], Awaitable[dict]]) -> dict:
    """Disk cache with a TTL. Concurrent callers share one generation; on failure a stale value is served."""
    antigo = _ler_cache(chave)
    if antigo and time.time() - antigo["at"] < TTL:
        log.info("cache hit %s", chave)
        return antigo["value"]
    if chave not in _em_andamento:
        _em_andamento[chave] = asyncio.create_task(carregar())
        _em_andamento[chave].add_done_callback(lambda _: _em_andamento.pop(chave, None))
    try:
        valor = await asyncio.shield(_em_andamento[chave])
    except Exception:
        if antigo:
            log.warning("falha ao gerar %s; usando o resumo antigo", chave)
            return antigo["value"]
        raise
    _gravar_cache(chave, valor)
    return valor


async def resumir(p: Proposicao) -> Resumo:
    """Generated once per provider and model and cached for a week."""
    provedor = provedor_ativo()
    if not provedor:
        raise ErroIA("outro", "Nenhuma IA configurada.")

    async def gerar() -> dict:
        inicio = time.perf_counter()
        log.info("gerando resumo de %s %s com %s (%s)", p.casa, p.sigla, provedor, modelo_de(provedor))
        dados, modelo = await gerar_json(provedor, SYSTEM, f"Resuma esta proposição:\n\n{contexto(p)}", SCHEMA)
        log.info("resumo de %s gerado por %s em %.1fs", p.sigla, modelo, time.perf_counter() - inicio)
        return {**validar(dados), "modelo": modelo, "geradoEm": datetime.now(UTC).isoformat()}

    chave = f"resumo:{provedor}:{modelo_de(provedor)}:{p.casa}:{p.id}:{p.situacao}"
    return Resumo(**await _cacheado(chave, gerar))
