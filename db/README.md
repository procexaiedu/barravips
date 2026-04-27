# Banco Local

As migrations da Fase 1 sao SQL puro para Postgres.

Subir Postgres local:

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
```

Aplicar migrations do zero (em ordem):

```powershell
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/migrations/001_init_schemas.sql
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/migrations/002_init_app_tables.sql
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/migrations/003_simplify_media.sql
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/migrations/004_media_tag_vocabulary_acompanhantes.sql
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/migrations/005_normalize_escorts.sql
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/migrations/006_rename_model_id_to_escort_id.sql
```

Aplicar seeds de desenvolvimento:

```powershell
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/seeds/001_dev_fixture.sql
```

Os seeds usam apenas fixtures; nao contem precos, duracoes ou regras comerciais reais.

## Tabelas

Schemas canonicos:

- `app`: estado operacional, catalogo de acompanhantes, historico, agenda, midia, handoff e integracoes.
- `langgraph`: reservado para checkpointing do LangGraph/PostgresSaver com `thread_id = conversation_id`.
- `logs`: execucoes do agente e registros operacionais tecnicos.

Tabelas canonicas:

- `app.clients`
- `app.escorts` (catalogo das acompanhantes; substituiu `app.models` na migration 005)
- `app.escort_services` (servicos oferecidos por acompanhante)
- `app.escort_locations` (cidades atendidas, taxa de deslocamento)
- `app.escort_preferences` (chave/valor discretos)
- `app.escort_availability` (restricoes de booking; 1:1 com `app.escorts`)
- `app.conversations`
- `app.messages`
- `app.raw_webhook_events`
- `app.handoff_events`
- `app.integration_status`
- `app.media_assets`
- `app.media_tag_vocabulary` / `app.media_tags`
- `app.receipts`
- `app.schedule_slots`
- `logs.agent_executions`

A coluna `escort_id` (ex-`model_id`) em `app.media_assets`, `app.conversations` e
`app.schedule_slots` referencia `app.escorts(id)`.

Invariantes criticas implementadas:

- uma unica acompanhante ativa por indice unico parcial `one_active_escort`;
- ausencia de sobreposicao entre slots `BLOCKED` da mesma acompanhante por `schedule_slots_no_overlap`;
- `app.messages.external_message_id` unico quando preenchido;
- `handoff_status OPENED/ACKNOWLEDGED` exige `state = ESCALADO` e `state_before_escalation` preenchido;
- `handoff_status NONE/RELEASED` nao coexiste com `state = ESCALADO`;
- `state_before_escalation` nunca armazena `ESCALADO`;
- `direction` e `role` sao coerentes em `app.messages`;
- `delivery_status` so pode aparecer em mensagem `OUTBOUND`;
- `app.schedule_slots.ends_at > app.schedule_slots.starts_at`.
