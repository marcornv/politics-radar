import logging

from fastapi import FastAPI
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .provedores import (
    NOME_PROVEDOR,
    ErroIA,
    Provedor,
    Teste,
    configurado,
    login_claude,
    modelo_de,
    provedor_ativo,
    provedores_configurados,
    testar_conexao,
)
from .agenda import AgendaItem, AgendaRanking, AgendaStatus, agenda_status, rank_items, reader_profile
from .resumo import INSTRUCOES_PADRAO, Proposicao, Resumo, resumir

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("radar_ia")

app = FastAPI(title="Radar Legislativo: IA")
# No auth here, and every summary spends the user's AI credits. Binding to 127.0.0.1 keeps the network out;
# checking Host also stops DNS rebinding, where a website the user visits resolves its own name to this machine.
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]"])


class OpcaoProvedor(BaseModel):
    id: Provedor
    nome: str
    modelo: str


class Status(BaseModel):
    ativo: Provedor | None
    configurados: list[OpcaoProvedor]
    compativel: bool
    loginClaude: bool
    instrucoesPadrao: str
    leitor: bool
    """Whether "Sobre você" is filled in."""
    agenda: AgendaStatus


@app.get("/status")
async def status() -> Status:
    return Status(
        ativo=provedor_ativo(),
        configurados=[OpcaoProvedor(id=p, nome=NOME_PROVEDOR[p], modelo=modelo_de(p)) for p in provedores_configurados()],
        compativel=configurado("compativel"),
        loginClaude=login_claude(),
        instrucoesPadrao=INSTRUCOES_PADRAO,
        leitor=bool(reader_profile()),
        agenda=await agenda_status(),
    )


@app.post("/resumo", response_model=Resumo)
async def resumo(p: Proposicao):
    ativo = provedor_ativo()
    if not ativo:
        return JSONResponse({"erro": "Resumo por IA desativado: configure uma IA em Configurações.", "tipo": "outro"}, 503)
    nome = NOME_PROVEDOR[ativo]
    try:
        return await resumir(p)
    except ErroIA as e:
        log.warning("resumo de %s falhou (%s): %s", p.sigla, e.tipo, e.msg)
        if e.tipo == "chave":
            erro = f"A chave da {nome} foi recusada. Troque-a em Configurações."
        elif e.tipo == "limite":
            erro = f"Limite de uso da {nome} atingido. Tente em alguns minutos."
        else:
            erro = e.msg
        return JSONResponse({"erro": erro, "tipo": e.tipo}, 502)
    except Exception:
        log.exception("erro inesperado no resumo de %s", p.sigla)
        return JSONResponse({"erro": "Não foi possível gerar o resumo agora.", "tipo": "outro"}, 502)


class RankRequest(BaseModel):
    items: list[AgendaItem]
    limit: int = Field(5, ge=1, le=50)
    topic: str | None = None
    """Free text to rank by instead of "Sobre você"."""


@app.post("/agenda/rank", response_model=AgendaRanking)
async def rank_agenda(req: RankRequest):
    try:
        return await rank_items(req.items, req.limit, req.topic)
    except ErroIA as e:
        log.warning("ranking da pauta falhou: %s", e.msg)
        return JSONResponse({"erro": e.msg, "tipo": e.tipo}, 502)
    except Exception:
        log.exception("erro inesperado no ranking da pauta")
        return JSONResponse({"erro": "Não foi possível ordenar a pauta agora.", "tipo": "outro"}, 502)


class PedidoTeste(BaseModel):
    provedor: Provedor
    chave: str | None = None
    url: str | None = None


class ResultadoTeste(BaseModel):
    resultado: Teste


@app.post("/testar")
async def testar(t: PedidoTeste) -> ResultadoTeste:
    return ResultadoTeste(resultado=await testar_conexao(t.provedor, t.chave, t.url))
