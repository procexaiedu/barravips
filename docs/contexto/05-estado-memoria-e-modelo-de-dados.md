# Estado, Memoria e Modelo de Dados

Este documento consolida o estado operacional da conversa, a estrategia de memoria e o modelo minimo de dados do MVP.

## Estado da conversa

Modelo simplificado confirmado para o MVP:

- `NOVO`
- `QUALIFICANDO`
- `NEGOCIANDO`
- `CONFIRMADO`
- `ESCALADO`

O estado deve existir como campo estruturado do sistema, nao como inferencia solta do LLM em texto livre.

## Transicoes confirmadas

- `NOVO` -> `QUALIFICANDO`: primeira mensagem do cliente.
- `QUALIFICANDO` -> `NEGOCIANDO`: cliente demonstra intencao concreta de contratar/agendar.
- `QUALIFICANDO` ou `NEGOCIANDO` -> `ESCALADO`: quando o fluxo for classificado como `EXTERNAL`, pois saidas exigem avaliacao humana imediata.
- `NEGOCIANDO` -> `CONFIRMADO`: horario, duracao e valor aceitavel estao fechados no estado operacional.
- `CONFIRMADO` -> `ESCALADO`: no fluxo interno, apos foto de chegada.
- Qualquer estado -> `ESCALADO`: somente quando houver necessidade operacional explicita de intervencao humana.

Nao existe encerramento ativo no MVP. A conversa apenas para de ter atividade.

## Campos operacionais complementares

A conversa deve carregar `flow_type`:

- `INTERNAL`
- `EXTERNAL`
- `UNDETERMINED`

Tambem deve carregar campos estruturados que evitem reinferencia solta:

- `pending_action`: acao aguardada, como `analyze_receipt`, `wait_arrival_photo` ou `confirm_schedule`;
- `awaiting_input_type`: entrada esperada, como `receipt_image`, `arrival_photo`, `text_confirmation` ou `address`;
- `awaiting_client_decision`: indica que o agente ja propos algo e aguarda aceite, recusa ou contraproposta;
- `urgency_profile`: perfil operacional opcional, como `IMMEDIATE`, `SCHEDULED`, `UNDEFINED_TIME` ou `ESTIMATED_TIME`;
- `expected_amount`: valor esperado para comprovante ou negociacao, quando aplicavel;
- `handoff_status`: estado operacional do handoff;
- snapshot dos dados operacionais usados na decisao quando houver risco de mudanca posterior.

Esses campos nao substituem historico nem resumo incremental. Eles tornam retomadas, retries, testes e validacoes mais deterministicos.

## Cliente recorrente e memoria

Foi escolhida abordagem com historico.

Implicacoes:

- o sistema reconhece o numero do cliente;
- o agente usa memoria operacional para adaptar a conversa;
- o atendimento nao precisa recomecar totalmente do zero;
- o uso da memoria deve parecer natural.

Estrategia consolidada:

- curto prazo: state do LangGraph com `messages` + `summary`, persistido via checkpointer por thread;
- a thread tecnica do LangGraph deve ser sempre `thread_id = conversation_id`;
- o grafo nao deve ser invocado sem `thread_id`, nem com `client_id`, `model_id` ou identificador global como substituto;
- longo prazo: perfil unico por cliente, indexado pelo numero, contendo nome, preferencias, historico util e observacoes operacionais;
- a memoria de longo prazo nao deve ser quebrada em tres dominios independentes no MVP;
- informacoes de perfil sao contexto interno, nao frase a revelar ao cliente;
- o agente nao deve escrever coisas como "vi aqui que voce ja veio" ou "lembro pelo sistema";
- a memoria deve ajustar tom, evitar perguntas repetidas e conduzir melhor a conversa.

Padrao de janela: resumo incremental + ultimas 10 trocas.

## Entidades minimas

### Modelo

- identificador da modelo;
- nome de exibicao;
- status ativo/inativo, preservando historico;
- atributos de persona;
- idiomas;
- servicos/limites definidos;
- midia associada;
- agenda associada;
- regras de preco.

No MVP, o backend deve preservar a invariante de uma unica modelo ativa. Ativar nova modelo deve desativar a anterior ou rejeitar a operacao explicitamente.

### Cliente

- numero de WhatsApp;
- nome, se houver;
- historico resumido;
- ultimos estados da conversa;
- preferencias observadas;
- status operacional (`client_status`).

`client_status` substitui `recurrence_status` porque o campo precisa cobrir estados que vao alem de recorrencia. Valores canonicos do MVP: `NEW`, `RETURNING`, `VIP`, `BLOCKED`.

### Conversa

- id da conversa;
- cliente;
- modelo;
- mensagens recentes;
- resumo incremental;
- estado atual;
- `flow_type`;
- valor esperado para confirmacao;
- `pending_action`;
- `awaiting_input_type`;
- decisao pendente do cliente;
- timestamps;
- flags de escalada;
- estado operacional de handoff.

### Sessao de conversa

Decisao do MVP: `conversation_sessions` fica **adiada para pos-MVP**. A semantica de "ciclo" de conversa ainda esta imatura e toda auditoria necessaria pode ser derivada de `app.handoff_events` + `last_message_at` + `state_before_escalation`. Quando a necessidade for medida, a direcao futura e introduzir uma tabela de eventos de estado (`conversation_state_events`), nao uma tabela de sessoes separada.

### Agenda ou bloqueio

- modelo;
- data/hora inicial;
- data/hora final;
- origem do bloqueio;
- observacao opcional.

### Slot de agenda

- modelo;
- data/hora inicial;
- data/hora final;
- status do slot;
- origem do dado (`CALENDAR_SYNC`, `MANUAL`, `AUTO_BLOCK`);
- referencia externa do evento;
- status de sincronizacao com Calendar;
- timestamp de sincronizacao;
- resumo do ultimo erro de sincronizacao, quando houver.

### Midia outbound curada (`media_assets`)

Catalogo de midia aprovada para envio pelo agente. Nao contem mensagens inbound do cliente.

- modelo;
- tipo de arquivo;
- caminho interno no volume local;
- categoria;
- status de aprovacao;
- restricoes de envio;
- metadados minimos.

Estados minimos de aprovacao:

- `PENDING`
- `APPROVED`
- `REJECTED`
- `REVOKED`

Decisao: a tabela `media_sends` foi eliminada. O vinculo entre envio e midia fica em `app.messages.media_id`, que ja carrega `conversation_id`, `client_id` e `created_at`. Nao ha razao para duplicar.

### Comprovante (`receipts`)

Tabela especifica para mensagens inbound com valor financeiro a analisar. Separada de `media_assets` porque o ciclo de vida, retencao e analise sao distintos.

- conversa/cliente;
- referencia da mensagem inbound;
- caminho da imagem recebida;
- valor detectado;
- valor esperado;
- status da analise;
- tolerancia aplicada;
- necessidade de revisao.

## Persistencia e memoria tecnica

O sistema deve usar Postgres como base principal de persistencia do MVP.

Diretrizes:

- `PostgresSaver` no LangGraph desde o inicio para checkpointing por thread;
- `conversation_id` e a chave canonica de isolamento de estado, memoria curta, buffers, locks, traces e execucoes do agente;
- cada execucao do grafo deve propagar `thread_id = conversation_id` para impedir mistura de historico entre clientes;
- separacao logica de schemas;
- connection pool compartilhado dimensionado para LangGraph + aplicacao;
- retencao e limpeza periodica de checkpoints antigos;
- memoria de curto prazo no state do grafo;
- memoria de longo prazo em perfil unico por cliente, acessivel por tool;
- atualizacoes leves de perfil podem rodar em background com log estruturado;
- atualizacoes criticas, como estado, `expected_amount`, `pending_action` e handoff, devem ser sincronas e transacionais.

## Modelo relacional minimo

As migrations iniciais devem materializar pelo menos estas tabelas. Os nomes abaixo sao canonicos para o MVP.

### `app.clients`

- `id`
- `whatsapp_jid`, unico
- `display_name`
- `language_hint`
- `client_status`, valores `NEW`, `RETURNING`, `VIP`, `BLOCKED`
- `profile_summary`
- `preferences_json`
- `risk_notes`
- `created_at`
- `updated_at`

### `app.escorts` e tabelas filhas

A operacao mantem o catalogo das acompanhantes em tabelas normalizadas. A engenharia controla o system prompt do agente; o operador edita apenas catalogo (nada de tom, vocabulario ou regras de qualificacao).

`app.escorts`:

- `id`
- `display_name`
- `is_active`, `NOT NULL DEFAULT false`
- `languages` (text[])
- `calendar_external_id`
- `photo_main_path`
- `min_duration_minutes`, `advance_booking_minutes`, `max_bookings_per_day` (regras de booking; nullable). Originalmente em `app.escort_availability` (1:1), inlinadas na migration 006.
- `preferences_json` (jsonb, default `{}`). Originalmente em `app.escort_preferences` (EAV key/value), consolidada em jsonb na migration 006.
- `created_at`
- `updated_at`

Invariantes:

- so pode existir uma linha com `is_active = true`, garantida por indice unico parcial:

```sql
CREATE UNIQUE INDEX one_active_escort
  ON app.escorts (is_active)
  WHERE is_active = true;
```

- o default `false` permite cadastro como rascunho; a ativacao deve acontecer por service dedicado que desative a acompanhante anterior na mesma transacao ou rejeite a operacao.

Tabelas filhas (todas com FK `escort_id REFERENCES app.escorts(id) ON DELETE CASCADE`):

- `app.escort_services`: `id, name, description, duration_minutes, price_cents, restrictions, sort_order`. Cada linha e um servico ofertado pela acompanhante.
- `app.escort_locations`: `id, city, neighborhood, accepts_displacement, displacement_fee_cents, sort_order`. Cidades atendidas e taxa de deslocamento.

A camada de tool do agente le esse catalogo via API; o prompt nao recebe JSONB livre.

### `app.conversations`

- `id`
- `client_id`
- `model_id` (FK para `app.escorts`)
- `state`
- `state_before_escalation`, nullable; preserva o estado anterior a `ESCALADO` para restaurar no `RELEASED`
- `flow_type`
- `summary`
- `last_summarized_message_id`, nullable; cursor do summarizer para a janela incremental
- `pending_action`
- `awaiting_input_type`
- `awaiting_client_decision`
- `urgency_profile`
- `expected_amount`
- `handoff_status`
- `last_handoff_at`, nullable
- `last_message_at`
- `created_at`
- `updated_at`

Indices recomendados: `(model_id, last_message_at DESC)`, `(handoff_status, last_message_at DESC)` e `UNIQUE (client_id, model_id)`.

No MVP, a conversa ativa deve ser resolvida por `client_id + model_id`. Como existe uma unica acompanhante ativa, isso equivale a uma conversa ativa por cliente, mas a modelagem preserva `model_id` para evitar retrabalho quando multiplas acompanhantes entrarem no produto. O `id` dessa linha e o `conversation_id` usado por LangGraph, debounce, fila logica, locks, logs e testes.

Invariantes de consistencia entre `state` e `handoff_status`:

```sql
-- handoff aberto exige state=ESCALADO e state_before_escalation preenchido
CHECK (handoff_status NOT IN ('OPENED','ACKNOWLEDGED')
       OR (state = 'ESCALADO' AND state_before_escalation IS NOT NULL))

-- handoff fechado nao pode coexistir com state=ESCALADO
CHECK (handoff_status NOT IN ('NONE','RELEASED') OR state != 'ESCALADO')

-- state_before_escalation coerente com handoff_status
CHECK ((handoff_status = 'NONE' AND state_before_escalation IS NULL)
    OR (handoff_status != 'NONE' AND state_before_escalation IS NOT NULL))

-- state_before_escalation nunca pode armazenar o proprio ESCALADO
CHECK (state_before_escalation IS NULL OR state_before_escalation != 'ESCALADO')
```

A equivalencia e assimetrica: `handoff_status IN (OPENED, ACKNOWLEDGED)` implica `state = ESCALADO`; `NONE`/`RELEASED` permitem qualquer `state != ESCALADO`. Ao executar `handoff_released`, o service restaura `state = state_before_escalation` e zera `state_before_escalation`.

### `app.messages`

- `id`
- `conversation_id`
- `client_id`
- `external_message_id`
- `direction`, `INBOUND` ou `OUTBOUND`
- `role`, `client`, `agent` ou `human`
- `message_type`, `text`, `image`, `audio`, `video`, `document` ou `system`
- `content_text`
- `media_id`
- `delivery_status`, nullable, preenchido apenas em `OUTBOUND`
- `from_me`
- `trace_id`
- `raw_event_id`
- `provider_message_at`, nullable; timestamp original do provedor (Evolution), usado em cursores e summarizer
- `created_at`

Invariantes:

```sql
CHECK ((direction = 'INBOUND'  AND role = 'client')
    OR (direction = 'OUTBOUND' AND role IN ('agent','human')))

CHECK (delivery_status IS NULL OR direction = 'OUTBOUND')

CREATE UNIQUE INDEX messages_external_id_unique
  ON app.messages (external_message_id)
  WHERE external_message_id IS NOT NULL;
```

Essa tabela substitui a ideia de manter duas tabelas paralelas de historico.

### Cursor canonico para janela de mensagens

Queries de janela do summarizer e da interface devem usar cursor temporal determinista, nao ordenacao por UUID:

```sql
SELECT m.*
FROM app.messages m, (
  SELECT provider_message_at, created_at, id
  FROM app.messages
  WHERE id = :last_summarized_message_id
) a
WHERE m.conversation_id = :conversation_id
  AND (COALESCE(m.provider_message_at, m.created_at), m.id)
      > (COALESCE(a.provider_message_at, a.created_at), a.id)
ORDER BY COALESCE(m.provider_message_at, m.created_at) DESC, m.id DESC
LIMIT 20;
```

O `id` entra apenas como desempate determinista quando os timestamps colidem.

### `app.raw_webhook_events`

- `id`
- `provider`, inicialmente `evolution`
- `event_name`
- `instance`
- `external_event_id`
- `external_message_id`
- `remote_jid`
- `trace_id`
- `payload_sanitized_json`
- `processing_status`, `RECEIVED`, `SKIPPED`, `PROCESSING`, `PROCESSED` ou `FAILED`
- `error_code`
- `error_message`
- `received_at`
- `processed_at`

Unicidade recomendada: `(provider, external_message_id)` quando `external_message_id` existir. Para eventos sem mensagem, usar `(provider, event_name, instance, received_at)` apenas como registro auditavel, nao como deduplicacao perfeita.

### `app.handoff_events`

- `id`
- `conversation_id`
- `event_type`, `handoff_opened`, `handoff_acknowledged` ou `handoff_released`
- `previous_handoff_status`, `NOT NULL`; o primeiro evento sempre registra transicao `NONE` -> `OPENED`
- `source`, `agent`, `chatwoot`, `operator_ui`, `whatsapp_manual` ou `system`
- `actor_label`
- `reason`
- `metadata_json`
- `trace_id`
- `created_at`

`metadata_json.notification_failed` e flag operacional para `handoff_opened`. Como a notificacao ao grupo acontece apos o commit do evento (fire-and-forget), a flag entra por `UPDATE` best-effort em caso de falha, nao na mesma transacao do insert. O evento permanece vinculante mesmo sem a notificacao; a falha fica rastreavel por log estruturado e pela propria flag.

### `app.integration_status`

- `id`
- `provider`
- `instance`
- `status`, como `CONNECTED`, `DISCONNECTED`, `QR_REQUIRED`, `UNKNOWN`
- `qr_code_ref`
- `last_event_at`
- `metadata_json`
- `updated_at`

Essa tabela corrige uma lacuna da Joana: eventos `connection.update` nao devem morrer apenas em log.

### `app.media_assets`

Catalogo de midia outbound curada. Nao contem mensagens inbound.

- `id`
- `model_id`
- `media_type`
- `category`
- `storage_path`
- `approval_status`
- `send_constraints_json`
- `metadata_json`
- `created_at`
- `updated_at`

Decisao: `app.media_sends` foi removida. O vinculo entre envio e midia existe em `app.messages.media_id`, que ja carrega `conversation_id`, `client_id` e `created_at`. Queries de auditoria de envio passam a fazer join direto em `messages`.

### `app.receipts`

Midia inbound com valor financeiro a analisar. Separada de `media_assets` porque o ciclo de vida, retencao (30 dias) e status de analise sao distintos.

- `id`
- `conversation_id`
- `client_id`
- `message_id`, referencia a `app.messages`
- `storage_path`
- `detected_amount`
- `expected_amount`
- `analysis_status`
- `tolerance_applied`
- `needs_review`
- `metadata_json`
- `created_at`
- `updated_at`

### `app.schedule_slots`

- `id`
- `model_id`
- `starts_at`
- `ends_at`
- `status`
- `source`
- `external_event_id`
- `sync_token_ref`
- `calendar_sync_status`
- `last_synced_at`
- `last_sync_error`
- `metadata_json`

Valores iniciais de `calendar_sync_status`:

- `PENDING`
- `SYNCED`
- `ERROR`

Invariantes:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CHECK (ends_at > starts_at)

-- anti-overlap de slots bloqueados para a mesma modelo
ALTER TABLE app.schedule_slots ADD CONSTRAINT schedule_slots_no_overlap
  EXCLUDE USING gist (
    model_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status = 'BLOCKED');
```

### `logs.agent_executions`

- `id`
- `conversation_id`
- `trace_id`
- `status`
- `duration_ms`
- `tool_count`
- `retry_count`
- `fallback_used`
- `input_message_ids`
- `output_message_id`
- `error_summary`
- `created_at`

Essa tabela deve guardar resumo operacional, nao todo o historico bruto quando LangFuse ja contem o trace detalhado.
