import asyncio
import json

import pytest

from radar_ia import config, provedores
from radar_ia.provedores import ErroIA, ler_json, provedor_ativo
from radar_ia import resumo
from radar_ia.resumo import FORMATO, INSTRUCOES_PADRAO, Proposicao, Tramitacao, contexto, eco, montar_system, validar

VARIAVEIS = [
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "COMPATIVEL_URL", "COMPATIVEL_MODELO",
    "IA_PROVEDOR", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE", "IA_CONTEXTO", "IA_INSTRUCOES",
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
