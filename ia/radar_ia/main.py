import json
import logging

from fastapi import FastAPI
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .provedores import (
    NOME_PROVEDOR,
    ErroIA,
    Provedor,
    Teste,
    configurado,
    login_claude,
    mensagem,
    modelo_de,
    provedor_ativo,
    provedores_configurados,
    testar_conexao,
)
from .agenda import AgendaItem, AgendaRanking, AgendaStatus, agenda_status, rank_items, reader_profile
from .resumo import INSTRUCOES_PADRAO, Proposicao, Resumo, resumir, resumir_stream

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


DESATIVADO = {"erro": "Resumo por IA desativado: configure uma IA em Configurações.", "tipo": "outro"}


@app.post("/resumo", response_model=Resumo)
async def resumo(p: Proposicao, com_leitor: bool = True):
    """`com_leitor=false` in the query writes the summary without "Sobre você" (and without paraVoce)."""
    ativo = provedor_ativo()
    if not ativo:
        return JSONResponse(DESATIVADO, 503)
    try:
        return await resumir(p, com_leitor)
    except ErroIA as e:
        log.warning("resumo de %s falhou (%s): %s", p.sigla, e.tipo, e.msg)
        return JSONResponse({"erro": mensagem(e, ativo), "tipo": e.tipo}, 502)
    except Exception:
        log.exception("erro inesperado no resumo de %s", p.sigla)
        return JSONResponse({"erro": "Não foi possível gerar o resumo agora.", "tipo": "outro"}, 502)


@app.post("/resumo/stream")
async def resumo_stream(p: Proposicao, com_leitor: bool = True):
    """`/resumo` as NDJSON, one event per line (see `resumir_stream`), so the page can show the summary being written."""
    if not provedor_ativo():
        return JSONResponse(DESATIVADO, 503)

    async def linhas():
        try:
            async for e in resumir_stream(p, com_leitor):
                yield json.dumps(e, ensure_ascii=False) + "\n"
        except Exception:
            log.exception("erro inesperado no resumo de %s", p.sigla)
            yield json.dumps({"tipo": "erro", "erro": "Não foi possível gerar o resumo agora."}, ensure_ascii=False) + "\n"

    return StreamingResponse(linhas(), media_type="application/x-ndjson")


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
