"""Plain-language summary of a bill: prompt, schema, validation and cache."""

import asyncio
import hashlib
import json
import logging
import re
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
    paraVoce: str | None = None
    """Why it matters to the reader described in Configurações; only when one is."""
    modelo: str
    geradoEm: str


INSTRUCOES_PADRAO = """Você explica proposições do Congresso brasileiro para um cidadão bem informado, mas que não é jurista.
Escreva em português do Brasil, linguagem simples e direta, sem juridiquês e sem opinião política.
Baseie-se apenas nos dados fornecidos. Se a ementa for vaga, diga o que dá para afirmar e não invente efeitos."""
"""The part of the system prompt the user may rewrite in Configurações (`IA_INSTRUCOES`)."""

# Always appended, whatever the user wrote: the card needs these fields, and providers without strict
# structured outputs only see the schema through the prompt.
FORMATO = """Regras fixas, que valem acima de qualquer instrução anterior:
- Responda apenas com um objeto JSON com os campos pedidos no schema, sem texto antes ou depois.
- Baseie-se apenas nos dados fornecidos e não dê opinião política."""

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

# Strict structured outputs need every property in `required`, so the optional field gets its own schema.
SCHEMA_COM_LEITOR: dict[str, Any] = {
    **SCHEMA,
    "required": [*SCHEMA["required"], "paraVoce"],
    "properties": {
        **SCHEMA["properties"],
        "paraVoce": {
            "type": "string",
            "description": (
                "Uma ou duas frases completas sobre o efeito concreto desta proposta na vida, no estudo ou no trabalho "
                "do leitor descrito. Não repita a descrição do leitor. Se não houver relação clara, explique por que não há."
            ),
        },
    },
}

CAMPOS = ("sintese", "mudancas", "afetados", "proximoPasso")


def montar_system() -> tuple[str, str | None]:
    """System prompt from the user's instructions (or the default), the reader context and the fixed rules.

    Returns the prompt and the reader context, if any. Read on every call, like the keys."""
    leitor = config.chave("IA_CONTEXTO")
    partes = [config.chave("IA_INSTRUCOES") or INSTRUCOES_PADRAO]
    if leitor:
        partes.append(
            f"Quem vai ler se descreveu assim: {leitor}\n"
            "No campo paraVoce, explique o que esta proposta muda para essa pessoa, como se falasse com ela "
            '("Para você, que..."). Não copie nem resuma a descrição acima. Os demais campos continuam neutros.'
        )
    partes.append(FORMATO)
    return "\n\n".join(partes), leitor


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


def _palavras(t: str) -> list[str]:
    return re.findall(r"\w+", t.lower())


def eco(texto: str, leitor: str) -> bool:
    """Small models tend to answer paraVoce with the reader's own description instead of an explanation."""
    palavras = _palavras(texto)
    do_leitor = set(_palavras(leitor))
    return len(palavras) < 6 or sum(p in do_leitor for p in palavras) / len(palavras) >= 0.6


def validar(d: Any, leitor: str | None = None) -> dict[str, Any]:
    """Providers without strict structured outputs can drift from the schema; reject anything the card can't show.

    With a reader, an answer that only echoes the reader's description is dropped rather than shown."""
    com_leitor = bool(leitor)
    if (
        isinstance(d, dict)
        and _texto(d.get("sintese"))
        and _texto(d.get("afetados"))
        and _texto(d.get("proximoPasso"))
        and isinstance(d.get("mudancas"), list)
        and all(_texto(m) for m in d["mudancas"])
        and (not com_leitor or _texto(d.get("paraVoce")))
    ):
        valido = {k: d[k] for k in CAMPOS}
        if leitor and not eco(d["paraVoce"], leitor):
            valido["paraVoce"] = d["paraVoce"]
        elif leitor:
            log.info("paraVoce descartado por repetir a descrição do leitor: %r", d["paraVoce"])
        return valido
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

    system, leitor = montar_system()
    schema = SCHEMA_COM_LEITOR if leitor else SCHEMA

    async def gerar() -> dict:
        inicio = time.perf_counter()
        log.info("gerando resumo de %s %s com %s (%s)", p.casa, p.sigla, provedor, modelo_de(provedor))
        dados, modelo = await gerar_json(provedor, system, f"Resuma esta proposição:\n\n{contexto(p)}", schema)
        log.info("resumo de %s gerado por %s em %.1fs", p.sigla, modelo, time.perf_counter() - inicio)
        return {**validar(dados, leitor), "modelo": modelo, "geradoEm": datetime.now(UTC).isoformat()}

    # Editing the instructions or the reader context in Configurações writes a new summary.
    prompt = hashlib.sha1(system.encode()).hexdigest()[:12]
    chave = f"resumo:{provedor}:{modelo_de(provedor)}:{p.casa}:{p.id}:{p.situacao}:{prompt}"
    return Resumo(**await _cacheado(chave, gerar))
