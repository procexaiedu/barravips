# Arquitetura, Stack e Repositorio

Este documento consolida a arquitetura tecnica do MVP, a stack confirmada, a estrategia de repositorio e o modelo de deploy.

## Repositorio

O MVP deve ser desenvolvido em um mesmo repositorio no GitHub, em formato de monorepo.

O monorepo deve agrupar pelo menos:

- backend/API;
- agente;
- interface operacional do Fernando;
- banco/migrations;
- prompts;
- testes e scripts.

Backend, agente e interface devem evoluir juntos, compartilhando contratos e versionamento.

Referencia operacional de repositorio: seguir o padrao observado em projetos similares, com codigo versionado no GitHub, historico de commits rastreavel, estrutura clara por dominios (`src`, `migrations`, `scripts`, `tests`, `supabase` quando aplicavel) e infra versionada junto do produto. Para o Barra Vips, a organizacao abaixo continua sendo a forma canonica, ajustada ao monorepo planejado.

Estrutura inicial recomendada, inspirada na separacao observada em projetos similare, mas ajustada para Python/LangGraph:

```text
apps/
  api/                  # HTTP backend, webhooks, read models e auth operacional
  agent/                # grafo LangGraph, tools, prompts e validadores
  operator-web/         # interface operacional do Fernando
packages/
  contracts/            # schemas JSON/Pydantic e tipos compartilhados
  observability/        # helpers de trace_id, logging e LangFuse
infra/
  docker-compose.dev.yml      # dependencias locais minimas para desenvolvimento/teste
  portainer-stack.yml         # artefato canonico de producao para Portainer/Swarm
db/
  migrations/
  seeds/
prompts/
  persona/
  validators/
tests/
  fixtures/evolution/
  agent/
  integration/
  evals/
scripts/
  simulate_webhook/
  sync_calendar/
  retention/
```

Regra de propriedade: `apps/api` recebe eventos e serve leitura; `apps/agent` decide e chama tools; `packages/contracts` define payloads e read models. Nenhuma superficie deve duplicar contratos de forma manual.

## Sequencia tecnica recomendada

1. Backend, banco, contratos de dados e read models.
2. Interface operacional sobre os dados consolidados.
3. Agente sobre a base estruturada.
4. Integracoes externas.
5. Endurecimento operacional.

O agente deve orientar o desenho desde o inicio, especialmente estados, eventos, tools, prompts e validacoes.

## Stack confirmada

- LangGraph como framework do agente.
- Claude Sonnet 4.6 como LLM principal para respostas em persona, negociacao e decisao conversacional.
- PostgresSaver no LangGraph para checkpointing e estado persistente.
- `conversation_id` como chave canonica de isolamento de checkpoint, memoria curta, debounce, lock e trace.
- Evolution API para WhatsApp.
- Google Calendar como referencia visual humana da agenda.
- Postgres como base principal para historico, estado, leitura/reserva de agenda, metadados e logs.
- Supabase como hospedagem recomendada do Postgres principal no MVP.
- Chatwoot para espelho de conversa, visibilidade operacional e eventos de handoff.
- Interface operacional propria para Fernando.
- LangFuse self-hosted para tracing, observabilidade e custo por conversa.
- Groq Whisper para transcricao de audio, com fallback para OpenAI Whisper.
- Volume Docker local/filesystem local para midia no MVP.
- Vercel para deploy da interface operacional web.
- Portainer para deploy e gestao da stack do agente/backend em producao.
- docker-compose apenas como base local minima; producao deve ter um unico artefato canonico versionado para Portainer/Swarm.

## Padrao operacional Portainer/Swarm

O deploy de producao deve seguir o padrao ja usado pela empresa em projetos como `barravips-backend`: uma stack no Portainer/Swarm, publicada a partir de artefato versionado no repositorio, com servico principal da aplicacao e servicos auxiliares declarados de forma explicita.

O repositorio nao deve manter dois arquivos de producao com a mesma responsabilidade. A primeira versao deve usar `infra/portainer-stack.yml` como artefato canonico de producao. Se a operacao decidir publicar diretamente um arquivo chamado `docker-compose.prod.yml`, ele deve substituir o `portainer-stack.yml`, nao duplicar sua configuracao.

Para o Barra Vips, a stack inicial recomendada deve ser enxuta:

- servico principal para backend/API e execucao do agente, ou servicos separados `api` e `agent` se a implementacao justificar;
- volume Docker local para midia aprovada/operacional no MVP;
- rede interna compartilhada com os servicos necessarios, preferindo trafego interno para Evolution/Chatwoot/LangFuse quando estiverem no mesmo ambiente;
- publicacao externa apenas do endpoint necessario ao webhook/API, preferencialmente via Traefik;
- uma replica inicial, salvo evidencia operacional para escalar horizontalmente;
- rollback por tag/imagem anterior no Portainer.

Redis nao deve entrar na stack apenas por estar presente na em projetos similares. Se multiplas instancias, filas distribuidas, cache compartilhado ou locks distribuidos se tornarem necessidade medida, ele deve ser adicionado como servico auxiliar explicito na mesma stack ou como dependencia dedicada, com a decisao registrada.

Da mesma forma, Evolution API, Chatwoot, LangFuse, MinIO/S3 e outros servicos externos nao devem ser copiados para a stack local ou de producao do Barra Vips apenas por existirem no ambiente da empresa. A stack do produto deve declarar somente o que ele precisa operar diretamente; integracoes ja hospedadas devem ser consumidas por rede/credencial configurada.

## Arquitetura do agente

O MVP deve usar agente unico com tools, nao arquitetura multiagente.

Diretrizes:

- um no principal concentra persona, raciocinio e decisao conversacional;
- agenda, CRM/registro, analise de comprovante, envio de midia e handoff sao tools operacionais;
- LangGraph orquestra estado estruturado, chamadas de tool e validacao antes do envio;
- o output final e sempre uma resposta curta em nome da modelo;
- o loop de tools deve ter limite explicito de recursao/iteracoes;
- tools sensiveis devem executar pre-checagens deterministicas antes de agir.

Nos recomendados:

- carregar contexto;
- interceptar casos deterministicos que nao precisam de LLM;
- extrair estado;
- decidir resposta/tool;
- executar tools;
- validar saida;
- enviar;
- persistir.

O no inicial de interceptacao deve cobrir, no minimo, 5 condicoes que produzem execucao `SKIPPED` em `logs.agent_executions`:

1. `handoff_status` aberto (`OPENED` ou `ACKNOWLEDGED`);
2. transcricao de audio falhou e ja foi sinalizada;
3. lote vazio sem midia util apos debounce;
4. conversa bloqueada administrativamente (cliente em `BLOCKED`);
5. mensagem `fromMe`/eco, que representa atuacao humana ou reflexao do proprio envio do agente e nao deve disparar nova resposta automatica.

Cada no de persistencia explicito deve registrar seu resultado intermediario para permitir reconstrucao de trace: carregamento de contexto, extracao de estado, decisao, resultado de tools, validacao e envio. O grafo nao deve avancar alem do no de interceptacao quando qualquer condicao acima for verdadeira.

## Estrategia de modelos

O MVP adota estrategia de **1 tier conversacional + servicos auxiliares**:

- Claude Sonnet 4.6 como unico LLM conversacional, responsavel por geracao de resposta, manutencao da persona, negociacao e decisoes;
- Groq Whisper para transcricao de audio, com fallback para OpenAI Whisper;
- sem LLM secundario de triagem ou classificacao no MVP.

A estimativa abaixo e **historica (legado)** e foi feita sobre uma configuracao dual-tier que nao foi adotada. Ela deve ser revisada com base no consumo real durante producao assistida:

- custo medio por conversa na configuracao dual-tier historica: cerca de US$ 0,19;
- 50 conversas/dia (estimativa legada): aproximadamente US$ 310-330/mes somando LLM, infraestrutura e audio.

## Postgres e schemas

Postgres e a base principal de persistencia e leitura operacional.

Diretrizes:

- usar `PostgresSaver` desde o inicio;
- invocar o grafo sempre com `thread_id = conversation_id`;
- nunca compartilhar checkpoint, state em memoria, buffer de debounce ou lock entre conversas distintas;
- versionar migrations como SQL puro numerado em `db/migrations`;
- manter schemas separados e canonicos: `app`, `langgraph` e `logs`;
- usar connection pool compartilhado;
- aplicar politica de limpeza de checkpoints;
- separar logs, estado da aplicacao e checkpointing.

Uso canonico dos schemas:

- `app`: clientes, modelos, conversas, mensagens, agenda, midia, handoff, integracoes e configuracoes operacionais.
- `langgraph`: tabelas internas do checkpointer do LangGraph/PostgresSaver.
- `logs`: eventos brutos sanitizados, execucoes do agente, auditoria tecnica e resultados de eval.

Nao criar schema paralelo com nome do projeto para evitar ambiguidade nas migrations. Se for necessario isolamento por produto no futuro, usar prefixos de tabela ou outro banco, nao um quarto schema no MVP.

## Supabase

Supabase deve ser tratado como hospedagem do Postgres principal da aplicacao, nao como camada principal de acesso da interface.

Regras:

- frontend nao conecta diretamente ao banco;
- interface operacional consome backend/read models;
- Supabase Auth, Realtime, WebSocket ou SSE nao sao requisitos iniciais;
- RBAC fica para fase posterior se houver multiplos usuarios, papeis ou auditoria fina.

## Ambientes

O projeto deve operar com dois ambientes explicitos desde o inicio:

- `dev/test`: desenvolvimento, testes simulados e validacao sem numero real;
- `prod`: operacao real com frontend na Vercel, stack agente/backend no Portainer, Chatwoot ativo e credenciais finais.

Diretrizes:

- `docker-compose.dev.yml` cobre apenas dependencias locais necessarias, como Postgres local e volume de midia quando isso acelerar desenvolvimento/testes;
- backend, agente e frontend podem rodar diretamente por `.venv`/processo local e `npm`, sem obrigar containerizacao do app no ciclo de desenvolvimento;
- LangFuse local so deve entrar no compose dev se houver teste concreto de tracing local; caso contrario, usar instancia ja existente ou mock/configuracao desligada;
- stack de producao deve ficar versionada para publicacao via Portainer em um unico arquivo canonico;
- ambiente de desenvolvimento deve ter simulador de payloads compativeis com Evolution API.
- a stack de producao deve refletir o padrao Portainer/Swarm da empresa, nao configuracao manual solta no painel.

## Deploy

O processo de deploy deve ser separado por superficie:

- codigo versionado em git;
- frontend operacional publicado na Vercel;
- agente, backend e integracoes stateful publicados via Portainer;
- stack de producao descrita em `infra/portainer-stack.yml`, ou em outro unico arquivo canonico compativel com Compose se a operacao decidir renomear;
- rollback do frontend por deployment anterior na Vercel;
- rollback da stack operacional por imagem/tag anterior no Portainer;
- sem exigir CI/CD custom completo na primeira versao alem dos fluxos padrao das plataformas.

Decisao: o MVP usa servico unico na stack do Portainer, com API e agente no mesmo processo. Separacao em servicos distintos deve ser considerada apenas se o tempo de processamento do agente ameacar o timeout do webhook ou se houver necessidade real de worker em background com evidencia medida.

## Contratos versionados

Devem ser versionados em git:

- prompts;
- regras operacionais;
- descricoes de tools;
- migrations;
- contratos de payload;
- simuladores de webhook;
- testes e evals.

Payloads de entrada do webhook devem ser validados estruturalmente antes de chegar ao agente.

Textos inbound muito longos devem ser truncados por limite configuravel, com flag operacional indicando truncamento.

## Pipeline de entrada

O pipeline de entrada deve seguir esta ordem:

1. Receber webhook no backend.
2. Autenticar header compartilhado.
3. Validar schema minimo do evento.
4. Sanitizar payload bruto.
5. Persistir evento bruto e chave de idempotencia no Postgres.
6. Atualizar status de integracao quando for evento de conexao.
7. Resolver ou criar `client` a partir de `remote_jid`.
8. Resolver ou criar a conversa ativa por `client_id + model_id`.
9. Normalizar mensagem ou midia para contrato interno.
10. Persistir `app.messages` antes de processamento pesado.
11. Aplicar debounce/fila por `conversation_id`.
12. Bloquear resposta se `handoff_status` estiver aberto.
13. Executar grafo do agente com `trace_id` propagado e `thread_id = conversation_id`.
14. Persistir resposta e enviar pela Evolution.
15. Atualizar status de entrega por loopback/status posterior.

Boundary assincrona canonica: o webhook deve responder `200` **ao final do passo 10**, depois que o evento bruto e a mensagem normalizada ja estao persistidos. Passos 11 a 15 rodam assincronamente dentro do processo via `asyncio.create_task` ou equivalente. Em caso de crash entre a resposta e o passo 13, o evento permanece recuperavel pelo registro em `app.messages`.

Para resiliencia, deve existir job in-process (APScheduler ou equivalente) rodando a cada 5 minutos que detecte mensagens inbound sem `agent_execution` terminal associada e as reprocesse respeitando idempotencia por `external_message_id`.
