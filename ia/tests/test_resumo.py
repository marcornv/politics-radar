import asyncio
import json

import pytest

from radar_ia import config, provedores
from radar_ia.provedores import ErroIA, ler_json, provedor_ativo
from radar_ia import resumo
from radar_ia.resumo import FORMATO, INSTRUCOES_PADRAO, Proposicao, Tramitacao, contexto, eco, montar_system, validar

VARIAVEIS = [
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "COMPATIVEL_URL", "COMPATIVEL_MODELO",
    "IA_PROVEDOR", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE", "IA_CONTEXTO", "IA_INSTRUCOES", "COMPATIVEL_RACIOCINIO",
]


@pytest.fixture
def chaves(tmp_path, monkeypatch):
    """Points the service at an empty chaves.json and a clean environment; returns a writer for the file."""
    arquivo = tmp_path / "chaves.json"
    monkeypatch.setattr(config, "ARQUIVO", arquivo)
    for v in VARIAVEIS:
        monkeypatch.delenv(v, raising=False)
    return lambda **dados: arquivo.write_text(json.dumps(dados))


def test_ler_json_tolera_texto_em_volta():
    assert ler_json('{"a": 1}') == {"a": 1}
    assert ler_json('<think>hmm {x}</think>\n```json\n{"a": 1}\n```') == {"a": 1}
    assert ler_json('Claro! Aqui está: {"a": 1} Espero ter ajudado.') == {"a": 1}
    with pytest.raises(ErroIA):
        ler_json("sem json")
    with pytest.raises(ErroIA):
        ler_json(None)


def test_validar():
    ok = {"sintese": "s", "mudancas": ["a", "b"], "afetados": "x", "proximoPasso": "p", "extra": 1}
    assert validar(ok) == {"sintese": "s", "mudancas": ["a", "b"], "afetados": "x", "proximoPasso": "p"}
    for ruim in [None, [], {**ok, "sintese": " "}, {**ok, "mudancas": "a"}, {**ok, "mudancas": ["a", 2]}]:
        with pytest.raises(ErroIA):
            validar(ruim)


def test_validar_com_leitor():
    leitor = "Sou um jovem de 27 anos programador de IA que estou procurando emprego fora do país."
    explicacao = "Como você busca emprego no exterior, a mudança no MEI só importa se você for prestar serviço como MEI."
    ok = {"sintese": "s", "mudancas": ["a"], "afetados": "x", "proximoPasso": "p", "paraVoce": explicacao}
    assert validar(ok)["sintese"] == "s" and "paraVoce" not in validar(ok)
    assert validar(ok, leitor)["paraVoce"] == explicacao
    with pytest.raises(ErroIA):
        validar({**ok, "paraVoce": " "}, leitor)
    # Answers seen from small models: the reader's description handed back instead of an explanation.
    for repetido in ["Jovem de 27 anos programador de IA", "Jovem de 27 anos programador de IA buscando emprego internacional"]:
        assert eco(repetido, leitor)
        assert "paraVoce" not in validar({**ok, "paraVoce": repetido}, leitor)
    assert not eco(explicacao, leitor)


def test_montar_system(chaves):
    chaves()
    system, leitor = montar_system()
    assert leitor is None
    assert system == f"{INSTRUCOES_PADRAO}\n\n{FORMATO}"

    chaves(IA_INSTRUCOES="Seja breve.", IA_CONTEXTO="sou estudante de medicina")
    system, leitor = montar_system()
    assert leitor == "sou estudante de medicina"
    assert system.startswith("Seja breve.") and INSTRUCOES_PADRAO not in system
    assert "Quem vai ler se descreveu assim: sou estudante de medicina" in system
    # The fixed rules always come last, so custom instructions can't override the output format.
    assert system.endswith(FORMATO)

    # The reader can ask for a summary without "Sobre você" even with one saved.
    system, leitor = montar_system(com_leitor=False)
    assert leitor is None and "Quem vai ler" not in system and system.startswith("Seja breve.")


def test_prompt_entra_na_chave_do_cache(chaves, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")
    chamadas = []

    async def falso(provedor, system, user, schema):
        chamadas.append(schema)
        dados = {"sintese": "s", "mudancas": ["a"], "afetados": "x", "proximoPasso": "p"}
        return ({**dados, "paraVoce": "Para você, que estuda medicina, isso muda o fim do curso."} if "paraVoce" in schema["properties"] else dados), "m"

    monkeypatch.setattr(resumo, "gerar_json", falso)
    p = Proposicao(id="1", casa="camara", sigla="PL 1/2026", tipo="PL", ementa="X.")

    chaves(GROQ_API_KEY="gsk_x")
    assert asyncio.run(resumo.resumir(p)).paraVoce is None
    asyncio.run(resumo.resumir(p))
    assert len(chamadas) == 1

    chaves(GROQ_API_KEY="gsk_x", IA_CONTEXTO="sou estudante de medicina")
    assert asyncio.run(resumo.resumir(p)).paraVoce.startswith("Para você")
    assert len(chamadas) == 2 and "paraVoce" in chamadas[1]["required"]

    # Without "Sobre você" it's the first summary again, already cached: no new call, no paraVoce.
    assert asyncio.run(resumo.resumir(p, com_leitor=False)).paraVoce is None
    assert len(chamadas) == 2


def test_contexto_omite_campos_vazios():
    p = Proposicao(
        id="1", casa="senado", sigla="PL 1/2026", tipo="Projeto de Lei", ementa="Dispõe sobre X.",
        situacao="Em análise", orgao="CCJ",
        tramitacoes=[Tramitacao(data="2026-10-01T10:00", orgao="CCJ", descricao="Recebido", despacho="ao relator")],
    )
    texto = contexto(p)
    assert texto.startswith("Casa: Senado Federal\nProposição: PL 1/2026 (Projeto de Lei)\nEmenta: Dispõe sobre X.")
    assert "Autoria" not in texto and "Relator" not in texto
    assert texto.endswith("Últimas movimentações:\n- 2026-10-01 [CCJ] Recebido: ao relator")


def test_provedor_ativo(chaves, monkeypatch):
    chaves()
    assert provedor_ativo() is None

    monkeypatch.setenv("GROQ_API_KEY", "gsk_env")
    assert provedor_ativo() == "groq"

    # A key saved by the screen counts too, and the order breaks ties.
    chaves(OPENAI_API_KEY="sk-app")
    assert provedor_ativo() == "openai"

    chaves(OPENAI_API_KEY="sk-app", IA_PROVEDOR="groq")
    assert provedor_ativo() == "groq"

    # A choice that is no longer configured falls back to the first one that is.
    chaves(OPENAI_API_KEY="sk-app", IA_PROVEDOR="compativel")
    assert provedor_ativo() == "openai"


def test_arquivo_tem_prioridade_sobre_env(chaves, monkeypatch):
    monkeypatch.setenv("COMPATIVEL_MODELO", "do-env")
    chaves(COMPATIVEL_MODELO="do-app")
    assert provedores.modelo_de("compativel") == "do-app"
    chaves(COMPATIVEL_MODELO="  ")
    assert provedores.modelo_de("compativel") == "do-env"


CLIENTE_REAL = provedores.httpx.AsyncClient


def _servidor_compativel(monkeypatch, resposta: str) -> list[dict]:
    """Answers every chat completion with the server-sent events in `resposta`; returns the request bodies sent."""
    corpos: list[dict] = []

    def responder(req):
        corpos.append(json.loads(req.content))
        return provedores.httpx.Response(200, text=resposta, headers={"Content-Type": "text/event-stream"})

    monkeypatch.setattr(
        provedores.httpx, "AsyncClient", lambda **kw: CLIENTE_REAL(transport=provedores.httpx.MockTransport(responder), **kw)
    )
    return corpos


def _resposta(content: str, finish: str = "stop", reasoning: str | None = None) -> str:
    """A streamed chat completion: optional reasoning, the content in two deltas, then the finish reason."""
    meio = len(content) // 2
    deltas = [{"reasoning": reasoning}] if reasoning else []
    deltas += [{"content": c} for c in (content[:meio], content[meio:]) if c]
    pedacos = [{"model": "m", "choices": [{"delta": d, "finish_reason": None}]} for d in deltas]
    pedacos.append({"model": "m", "choices": [{"delta": {}, "finish_reason": finish}]})
    return "".join(f"data: {json.dumps(p)}\n\n" for p in pedacos) + "data: [DONE]\n\n"


def test_raciocinio_vai_so_quando_escolhido(chaves, monkeypatch):
    corpos = _servidor_compativel(monkeypatch, _resposta('{"a": 1}'))
    chaves(COMPATIVEL_URL="http://x/v1", COMPATIVEL_MODELO="m")
    asyncio.run(provedores.gerar_json("compativel", "s", "u", {}))
    chaves(COMPATIVEL_URL="http://x/v1", COMPATIVEL_MODELO="m", COMPATIVEL_RACIOCINIO="none")
    asyncio.run(provedores.gerar_json("compativel", "s", "u", {}))
    chaves(COMPATIVEL_URL="http://x/v1", COMPATIVEL_MODELO="m", COMPATIVEL_RACIOCINIO="qualquer")
    asyncio.run(provedores.gerar_json("compativel", "s", "u", {}))
    assert [c.get("reasoning_effort") for c in corpos] == [None, "none", None]


def test_modelo_que_nao_pensa_ignora_o_raciocinio(chaves, monkeypatch):
    corpos: list[dict] = []

    def responder(req):
        corpos.append(json.loads(req.content))
        if "reasoning_effort" in corpos[-1]:
            return provedores.httpx.Response(400, json={"error": {"message": '"m" does not support thinking'}})
        return provedores.httpx.Response(200, text=_resposta('{"a": 1}'))

    monkeypatch.setattr(
        provedores.httpx, "AsyncClient", lambda **kw: CLIENTE_REAL(transport=provedores.httpx.MockTransport(responder), **kw)
    )
    chaves(COMPATIVEL_URL="http://x/v1", COMPATIVEL_MODELO="m", COMPATIVEL_RACIOCINIO="low")
    assert asyncio.run(provedores.gerar_json("compativel", "s", "u", {})) == ({"a": 1}, "m")
    # Second request: same structured output, only the effort dropped.
    assert len(corpos) == 2 and corpos[1]["response_format"]["type"] == "json_schema" and "reasoning_effort" not in corpos[1]


def test_schema_vai_no_prompt_so_da_api_compativel(chaves, monkeypatch):
    corpos = _servidor_compativel(monkeypatch, _resposta('{"a": 1}'))
    schema = {"type": "object", "properties": {"sintese": {"type": "string"}}}
    chaves(COMPATIVEL_URL="http://x/v1", COMPATIVEL_MODELO="m", OPENAI_API_KEY="sk-x")
    asyncio.run(provedores.gerar_json("compativel", "Sistema.", "u", schema))
    asyncio.run(provedores.gerar_json("openai", "Sistema.", "u", schema))
    compativel, openai = (c["messages"][0]["content"] for c in corpos)
    assert compativel.startswith("Sistema.") and '"sintese"' in compativel
    assert openai == "Sistema."


def test_erro_explica_limite_de_tokens(chaves, monkeypatch):
    chaves(COMPATIVEL_URL="http://x/v1", COMPATIVEL_MODELO="m")
    casos = [
        (_resposta("", "length", reasoning="Vamos pensar..."), provedores.PENSOU_DEMAIS),
        (_resposta('{"sintese": "cort', "length"), provedores.CORTADA),
        (_resposta("sem json"), "A IA devolveu uma resposta fora do formato esperado."),
    ]
    for resposta, esperado in casos:
        _servidor_compativel(monkeypatch, resposta)
        with pytest.raises(ErroIA) as e:
            asyncio.run(provedores.gerar_json("compativel", "s", "u", {}))
        assert e.value.msg == esperado


RESUMO_OK = {"sintese": "Eleva o teto do MEI.", "mudancas": ["Teto sobe"], "afetados": "MEIs.", "proximoPasso": "Relator na CAE."}
PL = Proposicao(id="1", casa="senado", sigla="PLP 186/2026", tipo="PLP", ementa="X.")


def _eventos(com_leitor: bool = False) -> list[dict]:
    async def juntar():
        return [e async for e in resumo.resumir_stream(PL, com_leitor)]

    return asyncio.run(juntar())


def test_stream_mostra_o_progresso_e_termina_validado(chaves, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")
    chaves(COMPATIVEL_URL="http://x/v1", COMPATIVEL_MODELO="m")
    corpos = _servidor_compativel(monkeypatch, _resposta(json.dumps({**RESUMO_OK, "extra": 1}), reasoning="hmm"))

    eventos = _eventos()
    assert [e["tipo"] for e in eventos] == ["pensando", "texto", "texto", "pronto"]
    assert "".join(e["delta"] for e in eventos if e["tipo"] == "texto") == json.dumps({**RESUMO_OK, "extra": 1})
    final = eventos[-1]["resumo"]
    assert {k: final[k] for k in RESUMO_OK} == RESUMO_OK and "extra" not in final and final["modelo"] == "m"
    assert corpos[0]["stream"] is True and corpos[0]["max_tokens"] == 8000

    # Second time it comes from the cache, without calling the model.
    assert [e["tipo"] for e in _eventos()] == ["pronto"] and len(corpos) == 1


def test_stream_explica_falha_e_usa_resumo_antigo(chaves, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")
    chaves(COMPATIVEL_URL="http://x/v1", COMPATIVEL_MODELO="m")
    _servidor_compativel(monkeypatch, _resposta("", "length", reasoning="Vamos pensar..."))
    assert _eventos()[-1] == {"tipo": "erro", "erro": provedores.PENSOU_DEMAIS}

    # A summary older than the cache TTL is still better than an error.
    _servidor_compativel(monkeypatch, _resposta(json.dumps(RESUMO_OK)))
    _eventos()
    monkeypatch.setattr(resumo.cache, "WEEK", -1)
    _servidor_compativel(monkeypatch, _resposta("sem json"))
    final = _eventos()[-1]
    assert final["tipo"] == "pronto" and final["resumo"]["sintese"] == RESUMO_OK["sintese"]
