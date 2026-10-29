"""AI providers that can write the plain-language summaries, and how to call each one."""

import json
import logging
import os
import re
import time
from collections.abc import AsyncIterator
from typing import Any, Literal, get_args

import anthropic
import httpx

from .config import chave

log = logging.getLogger("radar_ia")

Provedor = Literal["anthropic", "openai", "groq", "compativel"]
PROVEDORES: tuple[Provedor, ...] = get_args(Provedor)

# All provider names are feminine in Portuguese ("a OpenAI", "a Groq"), so one contraction fits all.
NOME_PROVEDOR: dict[Provedor, str] = {
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "groq": "Groq",
    "compativel": "API compatível",
}

CHAVE_DO_PROVEDOR: dict[Provedor, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "groq": "GROQ_API_KEY",
    "compativel": "COMPATIVEL_API_KEY",
}

BASE = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
}

Teste = Literal["valida", "recusada", "indisponivel"]


def eh_provedor(v: object) -> bool:
    return v in PROVEDORES


def modelo_de(p: Provedor) -> str:
    if p == "anthropic":
        return os.environ.get("CLAUDE_MODEL") or "claude-opus-5-5"
    if p == "openai":
        return os.environ.get("OPENAI_MODEL") or "gpt-6-luna"
    if p == "groq":
        return os.environ.get("GROQ_MODEL") or "openai/gpt-oss-120b"
    return chave("COMPATIVEL_MODELO") or ""


def login_claude() -> bool:
    """Claude Code / `ant` login on this machine, used when no Anthropic key is set."""
    return bool(os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_PROFILE"))


def configurado(p: Provedor) -> bool:
    if p == "anthropic":
        return bool(chave("ANTHROPIC_API_KEY")) or login_claude()
    if p == "compativel":
        return bool(chave("COMPATIVEL_URL") and chave("COMPATIVEL_MODELO"))
    return bool(chave(CHAVE_DO_PROVEDOR[p]))


def provedores_configurados() -> list[Provedor]:
    return [p for p in PROVEDORES if configurado(p)]


def provedor_ativo() -> Provedor | None:
    """The provider chosen in Configurações, or the first configured one if that choice is gone."""
    escolhido = chave("IA_PROVEDOR")
    if eh_provedor(escolhido) and configurado(escolhido):  # type: ignore[arg-type]
        return escolhido  # type: ignore[return-value]
    configurados = provedores_configurados()
    return configurados[0] if configurados else None


class ErroIA(Exception):
    """Provider failure in a shape the API can explain, whatever SDK or endpoint produced it."""

    def __init__(self, tipo: Literal["chave", "limite", "outro"], msg: str, status: int | None = None):
        super().__init__(msg)
        self.tipo = tipo
        self.msg = msg
        self.status = status


def ler_json(bruto: str | None) -> Any:
    """Parses the model's JSON, tolerating text around it (local models often add a preamble or a <think> block)."""
    texto = re.sub(r"```(?:json)?", "", re.sub(r"<think>[\s\S]*?</think>", "", bruto or "")).strip()
    if texto:
        try:
            return json.loads(texto)
        except ValueError:
            i, f = texto.find("{"), texto.rfind("}")
            if i >= 0 and f > i:
                try:
                    return json.loads(texto[i : f + 1])
                except ValueError:
                    pass
    raise ErroIA("outro", "A IA devolveu uma resposta fora do formato esperado.")


def mensagem(e: ErroIA, p: Provedor) -> str:
    """What the page shows for a failure of provider `p`."""
    if e.tipo == "chave":
        return f"A chave da {NOME_PROVEDOR[p]} foi recusada. Troque-a em Configurações."
    if e.tipo == "limite":
        return f"Limite de uso da {NOME_PROVEDOR[p]} atingido. Tente em alguns minutos."
    return e.msg


RECUSA = "O modelo não gerou resumo para esta proposição."
PENSOU_DEMAIS = (
    "O modelo gastou todo o limite de tokens pensando e não chegou a escrever o resumo. "
    "Em Configurações, diminua ou desligue o raciocínio da API compatível."
)
CORTADA = "A resposta do modelo foi cortada no limite de tokens antes de terminar o resumo."

# `reasoning_effort` values a compatible server may accept; empty means not sending it (server default).
RACIOCINIOS = ("none", "low", "medium", "high")


Evento = dict[str, Any]
"""One step of a streamed answer: {"tipo": "pensando"}, {"tipo": "texto", "delta": str} or, last, {"tipo": "fim", "dados", "modelo"}."""

# While a model reasons nothing else is sent, so repeat "pensando" now and then to keep the connection busy.
PULSO = 5.0


async def gerar_json(p: Provedor, system: str, user: str, schema: dict) -> tuple[Any, str]:
    """Asks provider `p` for JSON following `schema`. Returns (data, model that answered)."""
    async for e in gerar_json_stream(p, system, user, schema):
        if e["tipo"] == "fim":
            return e["dados"], e["modelo"]
    raise ErroIA("outro", "A IA não terminou a resposta.")


def gerar_json_stream(p: Provedor, system: str, user: str, schema: dict) -> AsyncIterator[Evento]:
    """`gerar_json` as it is written, so the page can show progress; the last event carries the parsed JSON."""
    return _via_anthropic(system, user, schema) if p == "anthropic" else _via_openai(p, system, user, schema)


def _ler_resposta(texto: str, fim: str | None, pensou: bool) -> Any:
    """`ler_json`, explaining the failure when the answer stopped at the token limit."""
    try:
        return ler_json(texto)
    except ErroIA:
        if fim != "length":
            raise
        # Thinking comes apart from the answer; an empty answer after it means the model never got there.
        raise ErroIA("outro", PENSOU_DEMAIS if pensou and not texto.strip() else CORTADA) from None


class _Pulso:
    """Says "pensando" on the first reasoning token and then at most every PULSO seconds."""

    def __init__(self) -> None:
        self.pensou = False
        self._ultimo = 0.0

    def agora(self) -> bool:
        self.pensou = True
        if time.monotonic() - self._ultimo < PULSO:
            return False
        self._ultimo = time.monotonic()
        return True


async def _via_anthropic(system: str, user: str, schema: dict) -> AsyncIterator[Evento]:
    api_key = chave("ANTHROPIC_API_KEY")
    client = anthropic.AsyncAnthropic(api_key=api_key) if api_key else anthropic.AsyncAnthropic()
    texto: list[str] = []
    pulso = _Pulso()
    try:
        async with client.beta.messages.stream(
            model=modelo_de("anthropic"),
            max_tokens=4000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            async for ev in stream:
                if ev.type == "text":
                    texto.append(ev.text)
                    yield {"tipo": "texto", "delta": ev.text}
                elif ev.type == "thinking" and pulso.agora():
                    yield {"tipo": "pensando"}
            res = await stream.get_final_message()
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
        raise ErroIA("chave", "Chave recusada.", e.status_code) from e
    except anthropic.RateLimitError as e:
        raise ErroIA("limite", "Limite de uso atingido.", 429) from e
    except anthropic.APIStatusError as e:
        raise ErroIA("outro", f"A Anthropic respondeu com erro {e.status_code}.", e.status_code) from e
    except anthropic.APIConnectionError as e:
        raise ErroIA("outro", "Não deu para falar com a Anthropic agora.") from e
    if res.stop_reason == "refusal":
        raise ErroIA("outro", RECUSA)
    fim = "length" if res.stop_reason == "max_tokens" else res.stop_reason
    yield {"tipo": "fim", "dados": _ler_resposta("".join(texto), fim, pulso.pensou), "modelo": res.model}


def _base_de(p: Provedor, url: str | None = None) -> str:
    if p == "compativel":
        return (url or chave("COMPATIVEL_URL") or "").rstrip("/")
    return BASE[p]


def _cabecalhos(chave_api: str | None) -> dict[str, str]:
    return {"Content-Type": "application/json", **({"Authorization": f"Bearer {chave_api}"} if chave_api else {})}


async def _via_openai(p: Provedor, system: str, user: str, schema: dict) -> AsyncIterator[Evento]:
    """OpenAI, Groq and anything that speaks the OpenAI Chat Completions API (Ollama, LM Studio, OpenRouter)."""
    modelo = modelo_de(p)
    # Local models can be slow on modest hardware. Streaming, this is the wait between tokens, not for the whole answer.
    timeout = 120 if p == "compativel" else 60
    # Thinking models on Ollama can fill the whole context reasoning; "none" turns that off.
    raciocinio = chave("COMPATIVEL_RACIOCINIO") if p == "compativel" else None
    extra = {"reasoning_effort": raciocinio} if raciocinio in RACIOCINIOS else {}
    sem_conexao = f"Não deu para falar com a {NOME_PROVEDOR[p]} agora."

    async def pedir(cliente: httpx.AsyncClient, formato: dict, sistema: str) -> httpx.Response:
        corpo = {
            "model": modelo,
            "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": user}],
            "response_format": formato,
            # Reasoning models spend part of the budget thinking; local servers only know the older name.
            **({"max_tokens": 8000} if p == "compativel" else {"max_completion_tokens": 8000}),
            "stream": True,
            **extra,
        }
        try:
            req = cliente.build_request(
                "POST", f"{_base_de(p)}/chat/completions", json=corpo, headers=_cabecalhos(chave(CHAVE_DO_PROVEDOR[p]))
            )
            return await cliente.send(req, stream=True)
        except (httpx.HTTPError, httpx.InvalidURL) as e:
            raise ErroIA("outro", sem_conexao) from e

    texto: list[str] = []
    fim: str | None = None
    pulso = _Pulso()
    com_schema = f"{system}\n\nResponda apenas com um objeto JSON que siga este JSON Schema:\n{json.dumps(schema, ensure_ascii=False)}"
    async with httpx.AsyncClient(timeout=timeout) as cliente:
        # A local server enforces the schema on the output but never shows it to the model; thinking models
        # then spend their whole budget guessing the fields, so compatible servers also get it in the prompt.
        estruturado = {"type": "json_schema", "json_schema": {"name": "resumo", "strict": True, "schema": schema}}
        r = await pedir(cliente, estruturado, com_schema if p == "compativel" else system)
        # A model that can't think rejects any effort but "none" (Ollama: "does not support thinking");
        # there is no reasoning to limit then, so ask again without it.
        if r.status_code == 400 and extra and re.search(r"think|reason", (await r.aread()).decode(errors="replace"), re.I):
            log.info("%s não pensa; pedindo de novo sem reasoning_effort", modelo)
            await r.aclose()
            extra.clear()
            r = await pedir(cliente, estruturado, com_schema)
        # Models without structured outputs reject json_schema; fall back to plain JSON mode with the schema in the prompt.
        if r.status_code == 400:
            await r.aclose()
            r = await pedir(cliente, {"type": "json_object"}, com_schema)
        try:
            if r.status_code in (401, 403):
                raise ErroIA("chave", "Chave recusada.", r.status_code)
            if r.status_code == 429:
                raise ErroIA("limite", "Limite de uso atingido.", 429)
            if not r.is_success:
                raise ErroIA("outro", f"A {NOME_PROVEDOR[p]} respondeu com erro {r.status_code}.", r.status_code)
            # Server-sent events: one `data: {chunk}` line per delta, then `data: [DONE]`.
            async for linha in r.aiter_lines():
                if not linha.startswith("data:"):
                    continue
                dado = linha[5:].strip()
                if dado == "[DONE]":
                    break
                try:
                    j = json.loads(dado)
                except ValueError:
                    continue
                if j.get("error"):
                    raise ErroIA("outro", f"A {NOME_PROVEDOR[p]} interrompeu a resposta com um erro.")
                modelo = j.get("model") or modelo
                escolha = (j.get("choices") or [{}])[0] or {}
                delta = escolha.get("delta") or {}
                if delta.get("refusal"):
                    raise ErroIA("outro", RECUSA)
                if (delta.get("reasoning") or delta.get("reasoning_content")) and pulso.agora():
                    yield {"tipo": "pensando"}
                if delta.get("content"):
                    texto.append(delta["content"])
                    yield {"tipo": "texto", "delta": delta["content"]}
                fim = escolha.get("finish_reason") or fim
        except httpx.HTTPError as e:
            raise ErroIA("outro", sem_conexao) from e
        finally:
            await r.aclose()

    yield {"tipo": "fim", "dados": _ler_resposta("".join(texto), fim, pulso.pensou), "modelo": modelo}


async def testar_conexao(p: Provedor, chave_api: str | None = None, url: str | None = None) -> Teste:
    """Checks credentials without spending tokens: lists models."""
    if p == "anthropic":
        try:
            client = anthropic.AsyncAnthropic(api_key=chave_api, max_retries=0, timeout=15)
            await client.models.list(limit=1)
            return "valida"
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
            return "recusada"
        except Exception:
            return "indisponivel"
    try:
        async with httpx.AsyncClient(timeout=15) as cliente:
            r = await cliente.get(f"{_base_de(p, url)}/models", headers=_cabecalhos(chave_api))
    except (httpx.HTTPError, httpx.InvalidURL):
        return "indisponivel"
    if r.status_code in (401, 403):
        return "recusada"
    return "valida" if r.is_success else "indisponivel"
