import { connection } from "next/server";
import { ChaveForm } from "@/components/ChaveForm";
import { PageHeader } from "@/components/ui";
import { chave, mascarar, type NomeChave, origem } from "@/lib/config";
import { ehAcessoLocal } from "@/lib/acesso";

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

const SERVICOS: Servico[] = [
  {
    nome: "ANTHROPIC_API_KEY",
    titulo: "Resumos em linguagem simples",
    oQueFaz:
      "Liga o resumo gerado pelo Claude nas páginas de proposições e votações: o que a proposta muda, quem é afetado e qual o próximo passo.",
    custo: "Pago por uso na sua conta da Anthropic. Cada resumo custa poucos centavos e fica guardado, então abrir de novo não cobra.",
    passos: [
      <>
        Entre em{" "}
        <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-phosphor hover:underline">
          console.anthropic.com
        </a>{" "}
        e crie uma conta (ou faça login).
      </>,
      "Adicione um meio de pagamento em Billing, se ainda não tiver.",
      <>
        Vá em <span className="text-ink">API Keys</span> e clique em <span className="text-ink">Create Key</span>.
      </>,
      <>
        Copie a chave, que começa com <code className="text-phosphor">sk-ant-</code>, e cole abaixo. Ela só aparece uma
        vez no site da Anthropic.
      </>,
    ],
    rotulo: "Chave da API da Anthropic",
    placeholder: "sk-ant-…",
  },
  {
    nome: "TRANSPARENCIA_API_KEY",
    titulo: "Emendas ao orçamento",
    oQueFaz:
      "Liga a busca de emendas ao Orçamento da União no Portal da Transparência: quem indicou, para onde foi o dinheiro e quanto já foi pago.",
    custo: "Gratuita. O portal permite 90 consultas por minuto, e o Radar respeita esse limite sozinho.",
    passos: [
      <>
        Entre em{" "}
        <a
          href="https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email"
          target="_blank"
          rel="noreferrer"
          className="text-phosphor hover:underline"
        >
          portaldatransparencia.gov.br/api-de-dados/cadastrar-email
        </a>
        .
      </>,
      "Faça login com sua conta gov.br e confirme o e-mail.",
      "A chave chega por e-mail em alguns minutos. Copie e cole abaixo.",
    ],
    rotulo: "Chave da API do Portal da Transparência",
    placeholder: "Cole a chave recebida por e-mail",
  },
];

function Estado({ nome }: { nome: NomeChave }) {
  const o = origem(nome);
  const loginClaude = nome === "ANTHROPIC_API_KEY" && !o && (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
  if (!o && !loginClaude) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2">
        <span className="h-2 w-2 rounded-full border border-muted" aria-hidden />
        Não configurada
      </span>
    );
  }
  const valor = chave(nome);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[12px]">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-phosphor/40 px-2.5 py-0.5 text-phosphor">
        <span className="h-2 w-2 rounded-full bg-phosphor" aria-hidden />
        {loginClaude ? "Usando o login do Claude deste computador" : "Configurada"}
      </span>
      {valor && <code className="text-ink-2">{mascarar(valor)}</code>}
      {o === "env" && <span className="text-muted">definida no arquivo .env.local</span>}
    </span>
  );
}

export default async function ConfiguracoesPage() {
  await connection();
  const local = await ehAcessoLocal();

  return (
    <>
      <PageHeader
        title="Configurações"
        lead="Dois recursos do Radar dependem de chaves de acesso a serviços externos. Tudo o mais funciona sem nenhuma configuração."
      />

      {!local && (
        <div className="mb-6 rounded-lg border border-amber/40 bg-amber/5 p-4 text-[13.5px] text-ink">
          Você está acessando o Radar por outro dispositivo da rede. Por segurança, as chaves só podem ser alteradas no
          computador onde ele está rodando (endereço <code className="text-phosphor">localhost</code>).
        </div>
      )}

      <div className="space-y-6">
        {SERVICOS.map((s) => {
          const configurada = !!chave(s.nome);
          return (
            <section key={s.nome} className="panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-[19px] font-semibold">{s.titulo}</h2>
                  <Estado nome={s.nome} />
                </div>
                <p className="max-w-[62ch] text-[14px] text-ink-2">{s.oQueFaz}</p>
                <p className="max-w-[62ch] text-[13px] text-muted">{s.custo}</p>
                <ChaveForm
                  nome={s.nome}
                  rotulo={s.rotulo}
                  placeholder={s.placeholder}
                  configurada={configurada}
                  doApp={origem(s.nome) === "app"}
                  bloqueado={!local}
                />
              </div>
              <div className="rounded-lg border border-line bg-bg/40 p-4">
                <h3 className="mb-2 text-[13px] font-semibold text-ink">Como conseguir a chave</h3>
                <ol className="space-y-2 text-[13px] text-ink-2">
                  {s.passos.map((p, i) => (
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
        })}
      </div>

      <section className="mt-8 max-w-[75ch] text-[13px] text-ink-2">
        <h2 className="mb-2 font-display text-[15px] font-semibold text-ink">Onde as chaves ficam guardadas</h2>
        <p>
          Só neste computador, no arquivo <code className="text-phosphor">.config/chaves.json</code> dentro da pasta do Radar.
          Elas não são enviadas para nenhum lugar além do próprio serviço (Anthropic ou Portal da Transparência) e não
          aparecem inteiras nesta tela. O arquivo não é criptografado: quem tiver acesso aos arquivos deste computador
          consegue lê-lo.
        </p>
        <p className="mt-2">
          Uma chave salva aqui tem prioridade sobre a mesma chave no arquivo <code className="text-phosphor">.env.local</code>.
          Ao salvar, o Radar testa a chave antes e não guarda chaves recusadas.
        </p>
      </section>
    </>
  );
}
