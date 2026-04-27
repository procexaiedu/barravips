# Setup da Fase 1 e API operacional inicial

Este documento registra o estado local validado depois da Fase 1 e do primeiro corte da Fase 2. A fundacao tecnica esta aplicada em Postgres local e existe uma API operacional minima em `apps/api`.

> O fechamento completo da Fase 2 esta documentado em `docs/fase-2-conclusao.md`. Este arquivo permanece como referencia operacional do ambiente de desenvolvimento.

Ainda nao fazem parte deste setup: agente LangGraph, interface operacional web, Evolution real, Chatwoot real, Google Calendar real, Whisper real e LangFuse real.

## Estado atual validado

- Postgres local sobe via `infra/docker-compose.dev.yml`.
- Migrations `001_init_schemas.sql` e `002_init_app_tables.sql` aplicam do zero.
- Seed `001_dev_fixture.sql` cria uma modelo ativa fixture-only, um cliente e uma conversa de desenvolvimento.
- Contracts Pydantic validam os 6 fixtures Evolution.
- API FastAPI em `apps/api` responde endpoints operacionais minimos.
- Webhook Evolution fixture persiste `messages.upsert` e atualiza `connection.update`.
- Upload de midia grava arquivo em `storage/media` e serve conteudo apenas por endpoint autenticado.

O compose local continua propositalmente pequeno. Ele nao inclui Redis, MinIO/S3, Evolution, Chatwoot, LangFuse, WebSocket, SSE ou Supabase Realtime.

## Dependencias locais

Subir o Postgres de desenvolvimento:

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
```

Dependencias Python usadas pela API local:

```powershell
python -m pip install "psycopg[binary]>=3.2,<4" "python-multipart>=0.0.9,<1"
```

`fastapi`, `uvicorn`, `pydantic`, `pytest` e `httpx` ja estavam disponiveis nesta maquina durante a validacao. Se outra maquina nao tiver essas dependencias, instalar tambem o pacote local de `apps/api` ou as dependencias declaradas em `apps/api/pyproject.toml`.

## Migrations e seed

Aplicar schemas, tabelas, indices e constraints:

```powershell
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/migrations/001_init_schemas.sql
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/migrations/002_init_app_tables.sql
```

Aplicar seed fixture-only:

```powershell
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/seeds/001_dev_fixture.sql
```

O seed usa apenas fixtures e campos `PENDING_DECISION`; nao contem precos, duracoes ou regras comerciais reais.

## Contracts e fixtures

Validar fixtures Evolution contra os contratos Pydantic versionados:

```powershell
python packages/contracts/scripts/validate_fixtures.py
```

Resultado esperado:

```text
OK messages_upsert_text.json: text from_me=False
OK messages_upsert_image.json: image from_me=False
OK messages_upsert_audio.json: audio from_me=False
OK messages_upsert_from_me.json: text from_me=True
OK connection_update_connected.json: CONNECTED
OK connection_update_disconnected.json: DISCONNECTED
```

## API operacional local

As variaveis de ambiente vivem no `.env` da raiz (copiar de `.env.example`). O `apps/api/src/barra_vips_api/config.py` carrega esse arquivo automaticamente via `python-dotenv`, entao nao eh necessario exportar secrets no shell nem usar `--env-file`.

Caminho padrao — sobe API e frontend juntos em background:

```powershell
scripts\dev_up.ps1      # Windows
```

```bash
scripts/dev_up.sh       # bash / WSL / Linux / macOS
```

Parar: `scripts\dev_down.ps1` (ou `.sh`). Logs e PIDs em `.run/`.

Execucao manual (so a API):

```powershell
$env:PYTHONPATH='apps/api/src;packages/contracts/src'
python -m uvicorn barra_vips_api.main:app --host 127.0.0.1 --port 8000
```

URL local:

```text
http://127.0.0.1:8000
```

Todos os endpoints `/api/*` exigem um destes formatos:

```powershell
@{ 'x-operator-api-key' = 'dev-operator-api-key' }
```

ou:

```text
Authorization: Bearer dev-operator-api-key
```

Webhooks usam secrets separados:

- Evolution: header `apikey`.
- Chatwoot: header `x-chatwoot-webhook-secret`.

## Endpoints implementados neste corte

Operacionais:

- `GET /api/status/health`
- `GET /api/status/evolution`
- `GET /api/status/calendar`
- `GET /api/conversations`
- `GET /api/conversations/{conversation_id}`
- `POST /api/conversations/{conversation_id}/handoff/acknowledge`
- `POST /api/conversations/{conversation_id}/handoff/release`
- `GET /api/schedule/slots`
- `POST /api/schedule/slots/block`
- `POST /api/schedule/sync`
- `GET /api/media`
- `POST /api/media`
- `PATCH /api/media/{media_id}`
- `GET /api/media/{media_id}/content`

Webhooks:

- `POST /webhooks/evolution`
- `POST /webhooks/chatwoot`

`POST /api/schedule/sync` ainda e stub operacional. O sync real com Google Calendar fica para a fase de integracoes.

## Politica inicial de midia

Decisao atual:

- tipos permitidos: imagem e video;
- sem limite de tamanho definido pela regra de negocio;
- `MAX_MEDIA_UPLOAD_BYTES=0` representa ausencia de limite no nivel da aplicacao;
- fotos so devem ser enviadas quando o cliente pedir;
- videos devem ser enviados como `view_once`;
- categorias de midia continuam pendentes.

Observacao tecnica: o endpoint atual de upload ainda le o arquivo em memoria antes de gravar. Antes de producao com arquivos grandes, a aplicacao ou a infraestrutura precisa de protecao explicita contra abuso, mesmo que a regra de negocio nao imponha limite comercial.

## Smoke test da API

Executar o smoke local:

```powershell
python apps/api/scripts/smoke_api.py
```

O smoke valida:

- `/api/status/health` bloqueia chamada sem `OPERATOR_API_KEY`;
- `/api/status/health` responde com chave valida;
- `/api/conversations` e detalhe da conversa respondem;
- webhook `connection.update` atualiza status Evolution;
- webhook `messages.upsert` cria mensagem no Postgres;
- bloqueio de agenda respeita o banco;
- upload de imagem valida bytes reais, grava catalogo e serve conteudo autenticado.

Resultado esperado:

```text
OK api smoke
```

## Suite de testes pytest

Executar a suite de integracao em `tests/integration` (requer Postgres dev em pe e seed `001_dev_fixture.sql` aplicado):

```powershell
pytest tests/integration
```

A suite cobre:

- `tests/integration/test_auth_separation.py`: prova que `/api/*`, `/webhooks/evolution` e `/webhooks/chatwoot` rejeitam credenciais cruzadas e so aceitam o secret correto.
- `tests/integration/test_read_models_schema.py`: regressao de schema validando respostas de `/api/conversations`, `/api/conversations/{id}`, `/api/schedule/slots`, `/api/status/evolution` e `/api/media` contra `barra_vips_contracts.v1` (`PaginatedEnvelope[ConversationRead]`, `ConversationDetailRead`, `ScheduleSlotRead`, `EvolutionStatusRead`).
- `tests/integration/test_handoff_endpoints.py`: cobre acknowledge/release de handoff a partir do estado seed (incluindo idempotencia, 409 quando handoff nao esta aberto, restauracao de `state_before_escalation` e persistencia em `app.handoff_events`).

Os testes restauram a conversa do seed (`30000000-0000-0000-0000-000000000001`) antes e depois de cada caso de handoff via fixture `reset_seed_conversation`.

## Consultas uteis de verificacao

Listar tabelas criadas:

```powershell
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -c "select schemaname, tablename from pg_tables where schemaname in ('app','logs') order by schemaname, tablename;"
```

Conferir contagens principais:

```powershell
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -c "select count(*) as escorts from app.escorts; select count(*) as clients from app.clients; select count(*) as conversations from app.conversations; select count(*) as messages from app.messages;"
```

## Secrets pendentes

Valores de desenvolvimento usados localmente neste corte:

- `DATABASE_URL`: `postgresql://barra_vips:barra_vips_dev_password@localhost:5432/barra_vips`.
- `OPERATOR_API_KEY`: `dev-operator-api-key`.
- `EVOLUTION_WEBHOOK_SECRET`: `dev-evolution-webhook-secret`.
- `CHATWOOT_WEBHOOK_SECRET`: `dev-chatwoot-webhook-secret`.

Valores reais ainda pendentes:

- `EVOLUTION_API_BASE_URL`: PENDING_DECISION.
- `EVOLUTION_API_KEY`: PENDING_DECISION.
- `EVOLUTION_INSTANCE`: confirmar se sera `barra-vips-main`.
- `EVOLUTION_WEBHOOK_SECRET`: PENDING_DECISION para ambientes reais.
- `OPERATOR_API_KEY`: PENDING_DECISION para ambientes reais.
- `DATABASE_URL`: definido localmente pelo compose; valor de producao pendente.
- `ANTHROPIC_API_KEY`: PENDING_DECISION.
- `GROQ_API_KEY`: PENDING_DECISION.
- `OPENAI_API_KEY`: PENDING_DECISION para fallback de Whisper.
- `GOOGLE_CALENDAR_CLIENT_ID`: PENDING_DECISION.
- `GOOGLE_CALENDAR_CLIENT_SECRET`: PENDING_DECISION.
- `GOOGLE_CALENDAR_REFRESH_TOKEN`: PENDING_DECISION.
- `CHATWOOT_WEBHOOK_SECRET`: PENDING_DECISION para ambientes reais.
- `LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`: PENDING_DECISION.
- `HANDOFF_NOTIFICATION_GROUP_JID`: PENDING_DECISION.
- `OPERATOR_UI_BASE_URL`: PENDING_DECISION.

## Inferencias da ata para cliente e risco

A ata ajuda parcialmente no ponto 4. Ela nao fecha uma taxonomia operacional completa, mas da sinais concretos para os primeiros criterios.

Decisoes atuais:

- `NEW`: numero sem historico anterior no sistema.
- `RETURNING`: cliente que ja fechou atendimento antes. Ter conversado antes nao basta.
- `VIP`: sera identificado futuramente por recorrencia e/ou ticket, mas os thresholds ainda nao estao definidos.
- `BLOCKED`: nao deve ser aplicado automaticamente neste corte; o sistema deve apenas sugerir revisao humana.

Inferencias seguras da ata:

- Sinal para sugerir revisao/bloqueio: comportamento vulgar/agressivo, envio de imagem explicita, excesso de emojis com baixa intencao de fechar, tentativa de levar a modelo para local inseguro, resposta suspeita sobre comunidade/endereco, ou historico de chamar deslocamento e cancelar.
- Handoff imediato: qualquer fluxo `EXTERNAL`/saida, endereco suspeito, resposta positiva ou ambigua para triagem de comunidade, pedido logistico que exija julgamento territorial, chegada no fluxo interno com foto de portaria/fachada, e qualquer situacao de risco operacional.
- Sinal de cliente qualificado: educado, serio, objetivo, pede informacoes praticas como horario, endereco, valor e disponibilidade.

Ponto tecnico importante:

- Handoff nao e sinonimo de fechamento. Uma conversa pode escalar para humano e nao fechar. Para o agente saber que o cliente "ja fechou" quando voltar depois de algum tempo, o sistema precisa registrar um desfecho operacional do handoff/atendimento, como `closed`, `not_closed`, `cancelled` ou equivalente.
- No MVP, `client_status = RETURNING` deve ser atualizado apenas apos um sinal explicito de fechamento real, nao apenas apos `handoff_opened`, `handoff_acknowledged` ou `handoff_released`.

Ainda nao definido:

- Thresholds para `VIP`: quantidade minima de fechamentos, ticket minimo, frequencia, janela temporal e se havera override manual.
- Contrato exato para registrar o desfecho do handoff/atendimento.

## Decisoes por acompanhante

Catalogo (servicos, locais, preferencias, agenda) nao deve ser hardcoded na aplicacao. Cada acompanhante carrega o proprio catalogo. Persona, vocabulario e regras de qualificacao ficam no system prompt definido pela engenharia, fora do banco e fora da UI do operador.

Campos ja modelados para isso (migrations 005 e 006):

- `app.escorts`: identidade (nome, idiomas, calendar, status, foto principal).
- `app.escort_services`: servicos com duracao e preco em centavos.
- `app.escort_locations`: cidades, bairros, taxa de deslocamento.
- `app.escort_preferences`: chave/valor discretos para restricoes objetivas.
- `app.escort_availability`: duracao minima, antecedencia minima, maximo por dia (1:1 com `app.escorts`).
- `app.schedule_slots.model_id`: agenda e bloqueios por acompanhante (coluna mantem nome legado mas referencia `app.escorts`).
- `app.media_assets.model_id`: midias vinculadas a acompanhante (coluna mantem nome legado mas referencia `app.escorts`).
- `app.conversations.model_id`: conversa sempre ligada a uma acompanhante (coluna mantem nome legado mas referencia `app.escorts`).

No MVP existe a invariante `one_active_escort`, que garante uma unica acompanhante ativa para reduzir risco operacional. Isso nao impede a expansao futura; apenas evita que a primeira versao precise resolver roteamento entre acompanhantes, multiplos numeros, disponibilidade cruzada e conflitos de handoff.

Enquanto Fernando ainda nao fornecer dados reais, o seed permanece fixture-only. A API e o banco devem continuar funcionando sem inventar valores comerciais.

## Pendencias humanas

Essas decisoes continuam pendentes, mas persona, regras comerciais e agenda nao bloqueiam a fundacao tecnica nem a API operacional inicial:

- Nome real de exibicao da acompanhante ativa.
- Persona da acompanhante (definida no system prompt pela engenharia, com base nos materiais fornecidos por Fernando).
- Precos, duracoes, piso de negociacao e acrescimo de saida.
- Servicos oferecidos, servicos nao oferecidos e limites operacionais reais.
- Antecedencia minima, limite diario, atraso, reagendamento, cancelamento e no-show.
- Thresholds para `VIP` e contrato de desfecho de handoff/atendimento.
- Procedimento humano de seguranca territorial para fluxo `EXTERNAL`.
- JID do grupo WhatsApp que recebera notificacoes de handoff.
- Politica de contingencia para banimento, desconexao ou troca do numero WhatsApp.
- Categorias de midia.
- Nome final do artefato canonico de producao, caso nao seja `infra/portainer-stack.yml`.
