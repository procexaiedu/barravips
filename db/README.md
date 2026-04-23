# Banco Local

As migrations da Fase 1 sao SQL puro para Postgres.

Subir Postgres local:

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
```

Aplicar migrations do zero:

```powershell
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/migrations/001_init_schemas.sql
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/migrations/002_init_app_tables.sql
```

Aplicar seeds de desenvolvimento:

```powershell
docker compose -f infra/docker-compose.dev.yml exec postgres psql -U barra_vips -d barra_vips -f /workspace/db/seeds/001_dev_fixture.sql
```

Os seeds usam apenas fixtures e campos `PENDING_DECISION`; nao contem precos, duracoes ou regras comerciais reais.

## Tabelas da Fase 1

Schemas canonicos:

- `app`: estado operacional, historico, agenda, midia, handoff e integracoes.
- `langgraph`: reservado para checkpointing do LangGraph/PostgresSaver com `thread_id = conversation_id`.
- `logs`: execucoes do agente e registros operacionais tecnicos.

Tabelas canonicas criadas:

- `app.clients`
- `app.models`
- `app.conversations`
- `app.messages`
- `app.raw_webhook_events`
- `app.handoff_events`
- `app.integration_status`
- `app.media_assets`
- `app.receipts`
- `app.schedule_slots`
- `logs.agent_executions`

Invariantes criticas implementadas:

- uma unica modelo ativa por indice unico parcial `one_active_model`;
- ausencia de sobreposicao entre slots `BLOCKED` da mesma modelo por `schedule_slots_no_overlap`;
- `app.messages.external_message_id` unico quando preenchido;
- `handoff_status OPENED/ACKNOWLEDGED` exige `state = ESCALADO` e `state_before_escalation` preenchido;
- `handoff_status NONE/RELEASED` nao coexiste com `state = ESCALADO`;
- `state_before_escalation` nunca armazena `ESCALADO`;
- `direction` e `role` sao coerentes em `app.messages`;
- `delivery_status` so pode aparecer em mensagem `OUTBOUND`;
- `app.schedule_slots.ends_at > app.schedule_slots.starts_at`.
