# Radar Legislativo

Painel local para acompanhar o Congresso Nacional (Câmara dos Deputados e Senado Federal) usando os dados abertos oficiais.

- **Composição**: hemiciclo por partido, bancadas por estado e lista de parlamentares, com filtros cruzados.
- **Votações**: realizadas (7, 30 ou 90 dias) e previstas (pautas das próximas sessões). Cada votação mostra placar, hemiciclo colorido pelo voto, orientação e fidelidade de cada bancada e o voto nominal de cada parlamentar.
- **Tramitação**: proposições com movimento recente agrupadas pela etapa em que estão (aguardando relator, em análise, pronta para pauta, em pauta), filtráveis por tipo, comissão e tema. Cada proposição tem ficha com fase, relator, linha do tempo e votações.
- **Agenda da semana**: sessões de plenário e reuniões de comissões das duas Casas, com as pautas.
- **Perfil de cada parlamentar**: dados pessoais e de contato, votos nominais com participação e fidelidade partidária, projetos de autoria, emendas a projetos, emendas ao orçamento, gastos da cota parlamentar dos últimos 12 meses, comissões, frentes e filiações. Clique em qualquer assento ou nome para abrir.
- **Emendas**: a projetos (Senado e comissões mistas do Congresso, com autor e decisão) e ao orçamento (Portal da Transparência, com autor, destino e quanto foi pago).
- **Resumo em linguagem simples** (opcional): gerado pelo Claude a partir da ementa e da tramitação, guardado em cache.

## Rodando

Requer Node 20 ou superior.

```bash
npm install
npm run dev                  # http://localhost:3000
```

Para uso diário, `npm run build && npm start` é mais rápido.

Por padrão o Radar só aceita conexões do próprio computador (`127.0.0.1`). Para abrir pelo celular ou outro aparelho da mesma rede, use `npm run dev:rede` ou `npm run start:rede` e acesse pelo IP da máquina. Faça isso só em redes de confiança: quem estiver na rede consegue gerar resumos cobrados na sua conta da Anthropic.

### Chaves opcionais

Dois recursos precisam de chave: os resumos em linguagem simples (Anthropic) e as emendas ao orçamento (Portal da Transparência, gratuita). Configure pela própria ferramenta, em **Configurações** no menu: a tela explica como conseguir cada chave, testa antes de salvar e guarda em `.config/chaves.json` (fora do git, legível só pelo seu usuário). A edição só é permitida no próprio computador (`localhost`), não por outros aparelhos da rede.

Quem preferir pode usar variáveis de ambiente em `.env.local` (veja `.env.example`); uma chave salva pela tela tem prioridade.

## Como funciona

- `src/lib/camara.ts` e `src/lib/senado.ts` falam com as APIs oficiais e convertem tudo para o modelo comum em `src/lib/types.ts`.
  - Câmara: https://dadosabertos.camara.leg.br/api/v2
  - Senado: https://legis.senado.leg.br/dadosabertos
- `src/lib/cache.ts` guarda as respostas em memória e em `.cache/` (disco), com validade por tipo de dado: votações passadas por dias, agenda e votações recentes por minutos. Se a fonte oficial cair, o último dado bom é reaproveitado. Apague `.cache/` para forçar a recarga.
- `src/lib/fase.ts` traduz a "situação" em texto livre de cada Casa para uma fase do processo e uma etapa dentro da comissão. As regras são expressões regulares; ajuste ali se alguma situação nova cair em "Outras situações".
- `src/lib/partidos.ts` define a ordem dos partidos no hemiciclo e as cores. As oito maiores bancadas têm cores próprias (paleta validada para daltonismo); as demais usam tons neutros e são identificadas pela legenda.

## Limitações conhecidas

- A Câmara não publica nos dados abertos o resultado das emendas a projetos nem a qual projeto cada uma se refere. No perfil do deputado elas aparecem com link para o texto; a página Emendas mostra só as do Senado e das comissões mistas, que têm decisão registrada.
- O primeiro perfil de deputado aberto leva até um minuto na aba Votos: o sistema cruza todas as votações nominais dos últimos 120 dias. Depois disso todos os perfis usam o mesmo índice em cache.
- Emendas ao orçamento: o Portal da Transparência não filtra por situação, então "concluída" (totalmente paga) é calculado a partir dos valores. A busca por autor usa o nome parlamentar e, se não achar, o nome civil. A API permite 90 consultas por minuto, por isso as buscas grandes são limitadas às primeiras páginas.

- A primeira abertura da tramitação da Câmara leva de 15 a 30 segundos: a API não informa a situação na listagem, então cada proposição é consultada uma vez e depois fica em cache.
- No Senado, a listagem de votações traz só as nominais; votações simbólicas aparecem na tramitação de cada matéria.
- O Senado raramente publica orientação de bancada nos dados abertos, então a fidelidade partidária costuma aparecer só na Câmara.
- Em semanas de recesso ou de eleição a agenda fica vazia; use as setas para navegar entre semanas.

## Segurança

- As chaves ficam em `.config/chaves.json` (modo 600) ou `.env.local`, ambos fora do git. Nunca faça commit delas.
- O Radar foi feito para rodar na sua máquina, não como site público: não há login, e qualquer pessoa que alcance o servidor pode gerar resumos com a sua chave.
- A rota de resumo recusa pedidos vindos de outros sites (CSRF e DNS rebinding), e as chaves só podem ser alteradas acessando por `localhost`.

Encontrou uma falha? Abra uma issue sem detalhes sensíveis ou use o [reporte privado de vulnerabilidades](https://docs.github.com/pt/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) do GitHub.

## Licença

[MIT](LICENSE). Os dados exibidos vêm das APIs de dados abertos da Câmara, do Senado e do Portal da Transparência, sujeitos aos termos de uso de cada fonte.
