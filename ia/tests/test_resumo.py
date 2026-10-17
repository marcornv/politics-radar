import json

import pytest

from radar_ia import config, provedores
from radar_ia.provedores import ErroIA, ler_json, provedor_ativo
from radar_ia.resumo import Proposicao, Tramitacao, contexto, validar

VARIAVEIS = [
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "COMPATIVEL_URL", "COMPATIVEL_MODELO",
    "IA_PROVEDOR", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE",
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
