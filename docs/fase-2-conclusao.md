# Conclusao da Fase 2 - Backend, read models e APIs operacionais

Este documento registra o fechamento da Fase 2 do roadmap. A API operacional `apps/api` cobre todos os entregaveis e passa nos criterios de aceite documentados em `docs/contexto/08-interface-operacional-e-api.md` e `docs/roadmap-executavel-mvp.md`.

A Fase 1 continua descrita em `docs/fase-1-setup.md`, que tambem lista o ambiente local validado.

## Entregaveis cobertos

- Backend FastAPI em `apps/api` com autenticacao operacional por `OPERATOR_API_KEY`.
- Webhooks separados em `/webhooks/evolution` e `/webhooks/chatwoot` com secrets proprios.
- Endpoints minimos de conversas, agenda, midias, status e health.
- Read models paginados com envelope canonico `{ items, total, page, page_size }`.
- Servico autenticado para midia por `GET /api/media/{media_id}/content`, com path resolvido no banco.
- Validacao real de MIME e tamanho maximo antes de gravar upload de midia.
- Contratos versionados em `packages/contracts/src/barra_vips_contracts/v1` consumidos via `response_model` em todos os endpoints operacionais.

## Endpoints com contrato declarado

Cada endpoint tem `response_model` apontando para um contrato de `packages/contracts`. Isso vale como regressao de schema continua em produto, alem dos testes pytest:

- `GET /api/status/health` -> `HealthStatusRead`
- `GET /api/status/evolution` -> `EvolutionStatusRead`
- `GET /api/status/calendar` -> `CalendarStatusRead`
- `GET /api/conversations` -> `PaginatedEnvelope[ConversationRead]`
- `GET /api/conversations/{id}` -> `ConversationDetailRead`
- `POST /api/conversations/{id}/handoff/acknowledge` -> `HandoffActionRead`
- `POST /api/conversations/{id}/handoff/release` -> `HandoffActionRead`
- `GET /api/schedule/slots` -> `PaginatedEnvelope[ScheduleSlotRead]`
- `POST /api/schedule/slots/block` -> `ScheduleSlotRead`
- `POST /api/schedule/sync` -> `ScheduleSyncRequestRead` (stub `manual_stub`; sync real fica para Fase 8)
- `GET /api/media` -> `PaginatedEnvelope[MediaRead]`
- `POST /api/media` -> `MediaRead`
- `PATCH /api/media/{id}` -> `MediaRead`
- `GET /api/media/{id}/content` -> `FileResponse` autenticado, com path resolvido no banco

## Suite de testes

A suite roda contra Postgres dev + seed `001_dev_fixture.sql`. O harness de pytest esta configurado em `pytest.ini` para coletar apenas `tests`, ignorar caches/tempdirs no root e evitar o cache interno do pytest nesta sandbox Windows, onde diretorios criados com permissao `0o700` ficam inacessiveis.

```powershell
pytest
```

Cobertura atual verificada (65 casos):

- `tests/unit/test_media_utils.py`
  - magic-bytes para PNG/JPEG/GIF/WEBP/MP4 e rejeicao de bytes desconhecidos.
  - `ensure_inside` aceita subpath, base e rejeita traversal.

- `tests/integration/test_auth_separation.py`
  - `/api/*` rejeita ausencia de chave, evolution secret, chatwoot secret e `apikey` (header de webhook).
  - `/webhooks/evolution` rejeita `OPERATOR_API_KEY` (mesmo no header `x-operator-api-key`) e o secret do Chatwoot.
  - `/webhooks/chatwoot` rejeita `OPERATOR_API_KEY` e o secret da Evolution.
  - `Authorization: Bearer` aceita `OPERATOR_API_KEY`.

- `tests/integration/test_read_models_schema.py`
  - Lista de conversas valida contra `PaginatedEnvelope[ConversationRead]` e cobre N+1 (cliente, modelo e last_message no envelope).
  - Detalhe valida contra `ConversationDetailRead`; 404 para id desconhecido.
  - `/api/schedule/slots` valida cada item contra `ScheduleSlotRead`.
  - `/api/status/evolution` valida contra `EvolutionStatusRead`.
  - `/api/media` mantem envelope paginado.

- `tests/integration/test_handoff_endpoints.py`
  - Acknowledge sem handoff aberto -> 409.
  - Acknowledge com handoff aberto persiste evento e atualiza estado.
  - Acknowledge idempotente.
  - Release sem handoff -> 409.
  - Release apos open restaura `state_before_escalation` e persiste evento.
  - Release apos acknowledged persiste evento.
  - Release idempotente.

- `tests/integration/test_media_endpoints.py`
  - Upload com bytes nao reconhecidos -> 415.
  - Upload mente sobre `Content-Type` -> 415 (rejeitado pelos magic bytes).
  - Upload de PNG real cria midia com `category` e `send_constraints_json`.
  - Upload de MP4 reconhecido aplica `view_once: true` por default.
  - `MAX_MEDIA_UPLOAD_BYTES` configurado retorna 413 quando excedido.
  - PATCH parcial preserva campos nao enviados.
  - PATCH com body vazio -> 400.
  - PATCH em id inexistente -> 404.
  - `GET /api/media/{id}/content` resolve do banco e respeita `OPERATOR_API_KEY`.
  - Storage path corrompido (traversal) cai em 404 controlado, nao em 500.

- `tests/integration/test_evolution_webhook.py`
  - `messages.upsert` cria mensagem na primeira chamada.
  - Reenvio do mesmo `external_message_id` retorna `duplicate` sem duplicar mensagem ou `raw_webhook_event`.
  - `connection.update` persiste estados `CONNECTED`, `DISCONNECTED` e `QR_REQUIRED`.
  - Evento desconhecido vira `SKIPPED` sem 500.
  - Payload sem evento conhecido vira `SKIPPED`.
  - Sanitizacao remove `base64` e `jpegThumbnail` antes de gravar.

## Criterios de aceite Fase 2 versus evidencias

| Criterio | Evidencia |
|---|---|
| Endpoints retornam contratos versionados | `response_model` em todos os endpoints + `tests/integration/test_read_models_schema.py` |
| Listas operacionais sem N+1 | SQL com `LATERAL` em `_get_conversation_read` e `list_conversations`; teste `test_list_carries_client_and_model_brief_without_n_plus_one` |
| API bloqueia requisicoes sem `OPERATOR_API_KEY` | `tests/integration/test_auth_separation.py::TestApiRejectsMissingOrWrongKey` |
| Webhooks nao compartilham autenticacao | `TestEvolutionWebhookOnlyAcceptsItsOwnSecret` e `TestChatwootWebhookOnlyAcceptsItsOwnSecret` |
| Midia so via backend autenticado, id no banco | `tests/integration/test_media_endpoints.py::TestMediaContent` |
| Telas montam lista sem chamada adicional por item | Mesmo teste de N+1 |

## Lacunas tratadas neste fechamento

- Endpoints retornavam dicts crus do psycopg sem validacao contra contratos: agora todos declaram `response_model`.
- `/api/schedule/slots` calculava `page_size: len(items) or 1`: substituido por paginacao real `page`/`page_size`/`total`.
- `/api/media` ignorava `category`/`approval_status` enviados como form: agora declarados com `Form()`.
- `GET /api/media/{id}/content` retornava 500 em paths corrompidos: agora retorna 404 controlado.
- `Settings` era `frozen=True`, impedindo testes parametrizarem `MAX_MEDIA_UPLOAD_BYTES`: removido frozen para permitir override seguro em teste com `monkeypatch`.

## Decisoes operacionais que permanecem como pendencias humanas

- `MAX_MEDIA_UPLOAD_BYTES` continua `0` por default (sem limite comercial). A Fase 10 (producao assistida) deve definir um limite tecnico de protecao independente da regra de negocio, pois o endpoint le bytes em memoria.
- `POST /api/schedule/sync` continua como stub `manual_stub`. O sync real com Google Calendar e responsabilidade da Fase 8 (Integracoes de agenda, midia, audio e Chatwoot).
- `OPERATOR_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`, `CHATWOOT_WEBHOOK_SECRET` continuam com valores `dev-*` em desenvolvimento; valores reais por ambiente continuam em `PENDING_DECISION` (ver `docs/fase-1-setup.md`).
- Persona, regras comerciais e thresholds VIP continuam em `PENDING_DECISION`. A Fase 2 nao depende dessas decisoes; a Fase 5 (agente LangGraph) sim.

## Verificacoes locais executadas

```powershell
python packages/contracts/scripts/validate_fixtures.py
pytest
```

Resultado:

- `validate_fixtures.py` -> 6 fixtures Evolution OK.
- `pytest` -> 65 passed.

## Pronto para a Fase 3

Com a Fase 2 fechada, a Fase 3 (Interface operacional de Fernando) tem todos os read models e endpoints operacionais que ela consome. As pendencias tecnicas remanescentes (sync Calendar, agente LangGraph, integracoes Evolution/Whisper/Chatwoot) nao bloqueiam a Fase 3, pois a interface consome apenas a API ja exposta.
