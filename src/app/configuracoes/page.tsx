import { connection } from "next/server";
import { ChaveForm } from "@/components/ChaveForm";
import { CompativelForm } from "@/components/CompativelForm";
import { PersonalizacaoForm } from "@/components/PersonalizacaoForm";
import { ProvedorForm } from "@/components/ProvedorForm";
import { PageHeader } from "@/components/ui";
import { chave, LIMITE_CONTEXTO, LIMITE_INSTRUCOES, mascarar, type NomeChave, origem } from "@/lib/config";
import { ehAcessoLocal } from "@/lib/acesso";
import { NOME_PROVEDOR, statusIA } from "@/lib/ia";

export const metadata = { title: "Configurações | Radar Legislativo" };

interface Servico {
  nome: NomeChave;
  titulo: string;
  oQueFaz: string;
  custo: string;
  passos: React.ReactNode[];
  rotulo: string;
  placeholder: string;
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-phosphor hover:underline">
      {children}
    </a>
  );
}

const Cod = ({ children }: { children: React.ReactNode }) => <code className="text-phosphor">{children}</code>;

const IAS: Servico[] = [
  {
    nome: "ANTHROPIC_API_KEY",
    titulo: "Anthropic (Claude)",
    oQueFaz: "Resumos gerados pelo Claude, da Anthropic.",
    custo: "Pago por uso na sua conta da Anthropic. Cada resumo custa poucos centavos e fica guardado, então abrir de novo não cobra.",
    passos: [
      <>
        Entre em <Ext href="https://console.anthropic.com">console.anthropic.com</Ext> e crie uma conta (ou faça login).
      </>,
      "Adicione um meio de pagamento em Billing, se ainda não tiver.",
      <>
        Vá em <span className="text-ink">API Keys</span> e clique em <span className="text-ink">Create Key</span>.
      </>,
      <>
        Copie a chave, que começa com <Cod>sk-ant-</Cod>, e cole abaixo. Ela só aparece uma vez no site da Anthropic.
      </>,
    ],
    rotulo: "Chave da API da Anthropic",
    placeholder: "sk-ant-…",
  },
  {
    nome: "OPENAI_API_KEY",
    titulo: "OpenAI (GPT)",
    oQueFaz: "Resumos gerados pelos modelos GPT, da OpenAI.",
    custo: "Pago por uso na sua conta da OpenAI. O modelo padrão é o mais barato da linha; cada resumo fica guardado e abrir de novo não cobra.",
    passos: [
      <>
        Entre em <Ext href="https://platform.openai.com">platform.openai.com</Ext> e crie uma conta (ou faça login).
      </>,
      "Adicione créditos em Billing, se ainda não tiver.",
      <>
        Vá em <Ext href="https://platform.openai.com/api-keys">API keys</Ext> e clique em{" "}
        <span className="text-ink">Create new secret key</span>.
      </>,
      <>
        Copie a chave, que começa com <Cod>sk-</Cod>, e cole abaixo. Ela só aparece uma vez.
      </>,
    ],
    rotulo: "Chave da API da OpenAI",
    placeholder: "sk-…",
  },
  {
    nome: "GROQ_API_KEY",
    titulo: "Groq",
    oQueFaz: "Resumos gerados por modelos abertos rodando na infraestrutura da Groq, com respostas muito rápidas.",
    custo: "Tem plano gratuito com limite de uso; acima dele, pago por uso.",
    passos: [
      <>
        Entre em <Ext href="https://console.groq.com">console.groq.com</Ext> e crie uma conta (ou faça login).
      </>,
      <>
        Vá em <Ext href="https://console.groq.com/keys">API Keys</Ext> e clique em{" "}
        <span className="text-ink">Create API Key</span>.
      </>,
      <>
        Copie a chave, que começa com <Cod>gsk_</Cod>, e cole abaixo.
      </>,
    ],
    rotulo: "Chave da API da Groq",
    placeholder: "gsk_…",
  },
];

const TRANSPARENCIA: Servico = {
  nome: "TRANSPARENCIA_API_KEY",
  titulo: "Emendas ao orçamento",
  oQueFaz:
    "Liga a busca de emendas ao Orçamento da União no Portal da Transparência: quem indicou, para onde foi o dinheiro e quanto já foi pago.",
  custo: "Gratuita. O portal permite 90 consultas por minuto, e o Radar respeita esse limite sozinho.",
  passos: [
    <>
      Entre em{" "}
      <Ext href="https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email">
        portaldatransparencia.gov.br/api-de-dados/cadastrar-email
      </Ext>
      .
    </>,
    "Faça login com sua conta gov.br e confirme o e-mail.",
    "A chave chega por e-mail em alguns minutos. Copie e cole abaixo.",
  ],
  rotulo: "Chave da API do Portal da Transparência",
  placeholder: "Cole a chave recebida por e-mail",
};

function Selo({ ligado, children }: { ligado: boolean; children: React.ReactNode }) {
  return ligado ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-phosphor/40 px-2.5 py-0.5 text-phosphor">
      <span className="h-2 w-2 rounded-full bg-phosphor" aria-hidden />
      {children}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2">
      <span className="h-2 w-2 rounded-full border border-muted" aria-hidden />
      {children}
    </span>
  );
}

function Estado({ nome, loginClaude }: { nome: NomeChave; loginClaude: boolean }) {
  const o = origem(nome);
  const usandoLogin = nome === "ANTHROPIC_API_KEY" && !o && loginClaude;
  if (!o && !usandoLogin) return <Selo ligado={false}>Não configurada</Selo>;
  const valor = chave(nome);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[12px]">
      <Selo ligado>{usandoLogin ? "Usando o login do Claude deste computador" : "Configurada"}</Selo>
      {valor && <code className="text-ink-2">{mascarar(valor)}</code>}
      {o === "env" && <span className="text-muted">definida no arquivo .env.local</span>}
    </span>
  );
}

function Cartao({
  titulo,
  estado,
  oQueFaz,
  custo,
  passos,
  tituloPassos = "Como conseguir a chave",
  children,
}: {
  titulo: string;
  estado: React.ReactNode;
  oQueFaz: string;
  custo: string;
  passos: React.ReactNode[];
  tituloPassos?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-[18px] font-semibold">{titulo}</h3>
          {estado}
        </div>
        <p className="max-w-[62ch] text-[14px] text-ink-2">{oQueFaz}</p>
        <p className="max-w-[62ch] text-[13px] text-muted">{custo}</p>
        {children}
      </div>
      <div className="rounded-lg border border-line bg-bg/40 p-4">
        <h4 className="mb-2 text-[13px] font-semibold text-ink">{tituloPassos}</h4>
        <ol className="space-y-2 text-[13px] text-ink-2">
          {passos.map((p, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="tnum mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[11px] text-ink">
                {i + 1}
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function CartaoChave({ s, bloqueado, loginClaude = false }: { s: Servico; bloqueado: boolean; loginClaude?: boolean }) {
  return (
    <Cartao titulo={s.titulo} estado={<Estado nome={s.nome} loginClaude={loginClaude} />} oQueFaz={s.oQueFaz} custo={s.custo} passos={s.passos}>
      <ChaveForm
        nome={s.nome}
        rotulo={s.rotulo}
        placeholder={s.placeholder}
        configurada={!!chave(s.nome)}
        doApp={origem(s.nome) === "app"}
        bloqueado={bloqueado}
      />
    </Cartao>
  );
}

export default async function ConfiguracoesPage() {
  await connection();
  const local = await ehAcessoLocal();
  const ia = await statusIA();
  const configurados = ia?.configurados ?? [];
  const ativo = ia?.ativo ?? null;
  const chaveCompativel = chave("COMPATIVEL_API_KEY");

  return (
    <>
      <PageHeader
        title="Configurações"
        lead="Dois recursos do Radar dependem de serviços externos: os resumos por IA e as emendas ao orçamento. Tudo o mais funciona sem nenhuma configuração."
      />

      {!local && (
        <div className="mb-6 rounded-lg border border-amber/40 bg-amber/5 p-4 text-[13.5px] text-ink">
          Você está acessando o Radar por outro dispositivo da rede. Por segurança, as configurações só podem ser alteradas
          no computador onde ele está rodando (endereço <code className="text-phosphor">localhost</code>).
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-[21px] font-semibold">Resumos em linguagem simples</h2>
          {ativo ? (
            <span className="text-[12px]">
              <Selo ligado>Usando {NOME_PROVEDOR[ativo]}</Selo>
            </span>
          ) : (
            <Selo ligado={false}>Nenhuma IA configurada</Selo>
          )}
        </div>
        <p className="max-w-[75ch] text-[14px] text-ink-2">
          Liga o resumo gerado por IA nas páginas de proposições e votações: o que a proposta muda, quem é afetado e qual
          o próximo passo. Configure uma das opções abaixo; com mais de uma, escolha qual usar.
        </p>

        {!ia && (
          <div className="rounded-lg border border-amber/40 bg-amber/5 p-4 text-[13.5px] text-ink">
            O serviço de IA (pasta <code className="text-phosphor">ia/</code>) não está rodando, então os resumos estão
            desligados e as chaves não podem ser testadas. Inicie o Radar com{" "}
            <code className="text-phosphor">npm run dev</code>, que sobe os dois juntos.
          </div>
        )}

        {configurados.length > 1 && (
          <div className="panel p-5 sm:p-6">
            <ProvedorForm
              opcoes={configurados.map((p) => ({ valor: p.id, nome: p.nome, modelo: p.modelo }))}
              ativo={ativo}
              bloqueado={!local}
            />
          </div>
        )}

        {ia && (
          <div className="panel space-y-3 p-5 sm:p-6">
            <h3 className="font-display text-[18px] font-semibold">Personalizar os resumos</h3>
            <p className="max-w-[62ch] text-[14px] text-ink-2">
              Conte quem você é para receber análises mais úteis para o seu caso, ou ajuste as instruções que a IA segue.
              Vale para todos os resumos gerados daqui em diante.
            </p>
            <PersonalizacaoForm
              contexto={chave("IA_CONTEXTO")}
              instrucoes={chave("IA_INSTRUCOES")}
              instrucoesPadrao={ia.instrucoesPadrao}
              limiteContexto={LIMITE_CONTEXTO}
              limiteInstrucoes={LIMITE_INSTRUCOES}
              bloqueado={!local}
            />
            <p className="border-t border-line pt-3 text-[13px] text-ink-2">
              <span className="text-ink">Pauta para você:</span>{" "}
              {ia.agenda.available ? (
                <>
                  a aba Previstas de cada Casa ordena a pauta pelo seu &ldquo;Sobre você&rdquo; ou por um tema que você
                  digitar, usando o modelo <Cod>{ia.agenda.model}</Cod> do Ollama. Só roda
                  quando você clica.
                </>
              ) : (
                <>
                  desligada. {ia.agenda.reason} Ela usa o modelo <Cod>{ia.agenda.model}</Cod> do Ollama, que roda
                  neste computador enquanto ordena.
                </>
              )}
            </p>
          </div>
        )}

        {IAS.map((s) => (
          <CartaoChave key={s.nome} s={s} bloqueado={!local} loginClaude={!!ia?.loginClaude} />
        ))}

        <Cartao
          titulo="Compatível com OpenAI"
          estado={
            <span className="text-[12px]">
              <Selo ligado={!!ia?.compativel}>{ia?.compativel ? "Configurada" : "Não configurada"}</Selo>
            </span>
          }
          oQueFaz="Qualquer servidor que fale a API da OpenAI: modelos rodando no seu próprio computador (Ollama, LM Studio) ou serviços como o OpenRouter."
          custo="Rodando local é gratuito e nada sai do seu computador, mas a qualidade depende do modelo e do hardware. Modelos pequenos podem errar ou demorar."
          tituloPassos="Como configurar"
          passos={[
            <>
              <span className="text-ink">Ollama:</span> instale pelo <Ext href="https://ollama.com">ollama.com</Ext>, baixe
              um modelo (<Cod>ollama pull llama3.1:8b</Cod>) e use a URL <Cod>http://localhost:11434/v1</Cod> com o nome
              do modelo.
            </>,
            <>
              <span className="text-ink">LM Studio:</span> ligue o servidor local no app e use{" "}
              <Cod>http://localhost:1234/v1</Cod> com o nome do modelo carregado.
            </>,
            <>
              <span className="text-ink">OpenRouter:</span> use <Cod>https://openrouter.ai/api/v1</Cod>, sua chave e o
              nome do modelo como aparece no site.
            </>,
          ]}
        >
          <CompativelForm
            url={chave("COMPATIVEL_URL")}
            modelo={chave("COMPATIVEL_MODELO")}
            chaveMascarada={chaveCompativel ? mascarar(chaveCompativel) : undefined}
            bloqueado={!local}
          />
        </Cartao>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="font-display text-[21px] font-semibold">Dados do orçamento</h2>
        <CartaoChave s={TRANSPARENCIA} bloqueado={!local} />
      </section>

      <section className="mt-8 max-w-[75ch] text-[13px] text-ink-2">
        <h2 className="mb-2 font-display text-[15px] font-semibold text-ink">Onde as chaves ficam guardadas</h2>
        <p>
          Só neste computador, no arquivo <code className="text-phosphor">.config/chaves.json</code> dentro da pasta do Radar.
          Cada chave só é enviada para o próprio serviço (Anthropic, OpenAI, Groq, o servidor compatível que você indicar
          ou o Portal da Transparência) e não aparece inteira nesta tela. O arquivo não é criptografado: quem tiver acesso
          aos arquivos deste computador consegue lê-lo.
        </p>
        <p className="mt-2">
          Uma chave salva aqui tem prioridade sobre a mesma chave no arquivo <code className="text-phosphor">.env.local</code>.
          Ao salvar, o Radar testa a chave antes e não guarda chaves recusadas.
        </p>
      </section>
    </>
  );
}
