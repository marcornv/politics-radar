"""AI providers that can write the plain-language summaries, and how to call each one."""

import json
import os
import re
from typing import Any, Literal, get_args

import anthropic
import httpx

from .config import chave

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


RECUSA = "O modelo não gerou resumo para esta proposição."


async def gerar_json(p: Provedor, system: str, user: str, schema: dict) -> tuple[Any, str]:
    """Asks provider `p` for JSON following `schema`. Returns (data, model that answered)."""
    if p == "anthropic":
        return await _via_anthropic(system, user, schema)
    return await _via_openai(p, system, user, schema)


async def _via_anthropic(system: str, user: str, schema: dict) -> tuple[Any, str]:
    api_key = chave("ANTHROPIC_API_KEY")
    client = anthropic.AsyncAnthropic(api_key=api_key) if api_key else anthropic.AsyncAnthropic()
    try:
        res = await client.beta.messages.create(
            model=modelo_de("anthropic"),
            max_tokens=4000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
            system=system,
            messages=[{"role": "user", "content": user}],
        )
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
    texto = next((b.text for b in res.content if b.type == "text"), None)
    return ler_json(texto), res.model


def _base_de(p: Provedor, url: str | None = None) -> str:
    if p == "compativel":
        return (url or chave("COMPATIVEL_URL") or "").rstrip("/")
    return BASE[p]


def _cabecalhos(chave_api: str | None) -> dict[str, str]:
    return {"Content-Type": "application/json", **({"Authorization": f"Bearer {chave_api}"} if chave_api else {})}


async def _via_openai(p: Provedor, system: str, user: str, schema: dict) -> tuple[Any, str]:
    """OpenAI, Groq and anything that speaks the OpenAI Chat Completions API (Ollama, LM Studio, OpenRouter)."""
    modelo = modelo_de(p)
    # Local models can be slow on modest hardware.
    timeout = 120 if p == "compativel" else 60

    async def pedir(cliente: httpx.AsyncClient, formato: dict, sistema: str) -> httpx.Response:
        corpo = {
            "model": modelo,
            "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": user}],
            "response_format": formato,
            # Reasoning models spend part of the budget thinking; local servers only know the older name.
            **({"max_tokens": 4000} if p == "compativel" else {"max_completion_tokens": 8000}),
        }
        try:
            return await cliente.post(f"{_base_de(p)}/chat/completions", json=corpo, headers=_cabecalhos(chave(CHAVE_DO_PROVEDOR[p])))
        except (httpx.HTTPError, httpx.InvalidURL) as e:
            raise ErroIA("outro", f"Não deu para falar com a {NOME_PROVEDOR[p]} agora.") from e

    async with httpx.AsyncClient(timeout=timeout) as cliente:
        r = await pedir(cliente, {"type": "json_schema", "json_schema": {"name": "resumo", "strict": True, "schema": schema}}, system)
        # Models without structured outputs reject json_schema; fall back to plain JSON mode with the schema in the prompt.
        if r.status_code == 400:
            r = await pedir(
                cliente,
                {"type": "json_object"},
                f"{system}\n\nResponda apenas com um objeto JSON que siga este JSON Schema:\n{json.dumps(schema, ensure_ascii=False)}",
            )

    if r.status_code in (401, 403):
        raise ErroIA("chave", "Chave recusada.", r.status_code)
    if r.status_code == 429:
        raise ErroIA("limite", "Limite de uso atingido.", 429)
    if not r.is_success:
        raise ErroIA("outro", f"A {NOME_PROVEDOR[p]} respondeu com erro {r.status_code}.", r.status_code)

    j = r.json()
    msg = ((j.get("choices") or [{}])[0] or {}).get("message") or {}
    if msg.get("refusal"):
        raise ErroIA("outro", RECUSA)
    return ler_json(msg.get("content")), j.get("model") or modelo


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
