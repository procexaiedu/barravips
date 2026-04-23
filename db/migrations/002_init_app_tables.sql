CREATE TABLE app.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_jid text NOT NULL,
  display_name text,
  language_hint text,
  client_status text NOT NULL DEFAULT 'NEW',
  profile_summary text,
  preferences_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_whatsapp_jid_unique UNIQUE (whatsapp_jid),
  CONSTRAINT clients_client_status_check CHECK (client_status IN ('NEW', 'RETURNING', 'VIP', 'BLOCKED'))
);

CREATE TABLE app.models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  persona_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  services_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  languages text[] NOT NULL DEFAULT ARRAY[]::text[],
  calendar_external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX one_active_model
  ON app.models (is_active)
  WHERE is_active = true;

CREATE TABLE app.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES app.clients(id) ON DELETE RESTRICT,
  model_id uuid NOT NULL REFERENCES app.models(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'NOVO',
  state_before_escalation text,
  flow_type text NOT NULL DEFAULT 'UNDETERMINED',
  summary text,
  last_summarized_message_id uuid,
  pending_action text,
  awaiting_input_type text,
  awaiting_client_decision boolean NOT NULL DEFAULT false,
  urgency_profile text,
  expected_amount numeric(12, 2),
  handoff_status text NOT NULL DEFAULT 'NONE',
  last_handoff_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_client_model_unique UNIQUE (client_id, model_id),
  CONSTRAINT conversations_state_check CHECK (state IN ('NOVO', 'QUALIFICANDO', 'NEGOCIANDO', 'CONFIRMADO', 'ESCALADO')),
  CONSTRAINT conversations_state_before_check CHECK (
    state_before_escalation IS NULL
    OR state_before_escalation IN ('NOVO', 'QUALIFICANDO', 'NEGOCIANDO', 'CONFIRMADO')
  ),
  CONSTRAINT conversations_flow_type_check CHECK (flow_type IN ('INTERNAL', 'EXTERNAL', 'UNDETERMINED')),
  CONSTRAINT conversations_urgency_profile_check CHECK (
    urgency_profile IS NULL
    OR urgency_profile IN ('IMMEDIATE', 'SCHEDULED', 'UNDEFINED_TIME', 'ESTIMATED_TIME')
  ),
  CONSTRAINT conversations_handoff_status_check CHECK (handoff_status IN ('NONE', 'OPENED', 'ACKNOWLEDGED', 'RELEASED')),
  CONSTRAINT conversations_open_handoff_requires_escalado CHECK (
    handoff_status NOT IN ('OPENED', 'ACKNOWLEDGED')
    OR (state = 'ESCALADO' AND state_before_escalation IS NOT NULL)
  ),
  CONSTRAINT conversations_closed_handoff_not_escalado CHECK (
    handoff_status NOT IN ('NONE', 'RELEASED')
    OR state != 'ESCALADO'
  ),
  CONSTRAINT conversations_state_before_handoff_consistency CHECK (
    (handoff_status IN ('NONE', 'RELEASED') AND state_before_escalation IS NULL)
    OR (handoff_status IN ('OPENED', 'ACKNOWLEDGED') AND state_before_escalation IS NOT NULL)
  )
);

CREATE INDEX conversations_model_last_message_idx
  ON app.conversations (model_id, last_message_at DESC);

CREATE INDEX conversations_handoff_last_message_idx
  ON app.conversations (handoff_status, last_message_at DESC);

CREATE TABLE app.raw_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'evolution',
  event_name text NOT NULL,
  instance text,
  external_event_id text,
  external_message_id text,
  remote_jid text,
  trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payload_sanitized_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status text NOT NULL DEFAULT 'RECEIVED',
  error_code text,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT raw_webhook_events_processing_status_check CHECK (
    processing_status IN ('RECEIVED', 'SKIPPED', 'PROCESSING', 'PROCESSED', 'FAILED')
  )
);

CREATE UNIQUE INDEX raw_webhook_events_provider_message_unique
  ON app.raw_webhook_events (provider, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE TABLE app.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES app.models(id) ON DELETE RESTRICT,
  media_type text NOT NULL,
  category text,
  storage_path text NOT NULL,
  approval_status text NOT NULL DEFAULT 'PENDING',
  send_constraints_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_media_type_check CHECK (media_type IN ('image', 'audio', 'video', 'document')),
  CONSTRAINT media_assets_approval_status_check CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED'))
);

CREATE TABLE app.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES app.clients(id) ON DELETE RESTRICT,
  external_message_id text,
  direction text NOT NULL,
  role text NOT NULL,
  message_type text NOT NULL,
  content_text text,
  media_id uuid REFERENCES app.media_assets(id) ON DELETE SET NULL,
  delivery_status text,
  from_me boolean NOT NULL DEFAULT false,
  trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
  raw_event_id uuid REFERENCES app.raw_webhook_events(id) ON DELETE SET NULL,
  provider_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_direction_check CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  CONSTRAINT messages_role_check CHECK (role IN ('client', 'agent', 'human')),
  CONSTRAINT messages_message_type_check CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'system')),
  CONSTRAINT messages_direction_role_consistency CHECK (
    (direction = 'INBOUND' AND role = 'client')
    OR (direction = 'OUTBOUND' AND role IN ('agent', 'human'))
  ),
  CONSTRAINT messages_delivery_status_outbound_only CHECK (
    delivery_status IS NULL OR direction = 'OUTBOUND'
  ),
  CONSTRAINT messages_delivery_status_check CHECK (
    delivery_status IS NULL
    OR delivery_status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN')
  )
);

ALTER TABLE app.conversations
  ADD CONSTRAINT conversations_last_summarized_message_fk
  FOREIGN KEY (last_summarized_message_id)
  REFERENCES app.messages(id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX messages_external_id_unique
  ON app.messages (external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX messages_conversation_time_idx
  ON app.messages (conversation_id, (COALESCE(provider_message_at, created_at)) DESC, id DESC);

CREATE TABLE app.handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_handoff_status text NOT NULL,
  source text NOT NULL,
  actor_label text,
  reason text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handoff_events_event_type_check CHECK (
    event_type IN ('handoff_opened', 'handoff_acknowledged', 'handoff_released')
  ),
  CONSTRAINT handoff_events_previous_status_check CHECK (
    previous_handoff_status IN ('NONE', 'OPENED', 'ACKNOWLEDGED', 'RELEASED')
  ),
  CONSTRAINT handoff_events_source_check CHECK (
    source IN ('agent', 'chatwoot', 'operator_ui', 'whatsapp_manual', 'system')
  )
);

CREATE INDEX handoff_events_conversation_created_idx
  ON app.handoff_events (conversation_id, created_at DESC);

CREATE TABLE app.integration_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  instance text NOT NULL,
  status text NOT NULL DEFAULT 'UNKNOWN',
  qr_code_ref text,
  last_event_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_status_provider_instance_unique UNIQUE (provider, instance),
  CONSTRAINT integration_status_status_check CHECK (
    status IN ('CONNECTED', 'DISCONNECTED', 'QR_REQUIRED', 'UNKNOWN')
  )
);

CREATE TABLE app.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES app.clients(id) ON DELETE RESTRICT,
  message_id uuid NOT NULL REFERENCES app.messages(id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  detected_amount numeric(12, 2),
  expected_amount numeric(12, 2),
  analysis_status text NOT NULL DEFAULT 'PENDING',
  tolerance_applied numeric(12, 2),
  needs_review boolean NOT NULL DEFAULT false,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipts_analysis_status_check CHECK (
    analysis_status IN ('PENDING', 'VALID', 'INVALID', 'UNCERTAIN', 'NEEDS_REVIEW')
  )
);

CREATE TABLE app.schedule_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES app.models(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'BLOCKED',
  source text NOT NULL DEFAULT 'MANUAL',
  external_event_id text,
  sync_token_ref text,
  calendar_sync_status text NOT NULL DEFAULT 'PENDING',
  last_synced_at timestamptz,
  last_sync_error text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT schedule_slots_time_order_check CHECK (ends_at > starts_at),
  CONSTRAINT schedule_slots_status_check CHECK (
    status IN ('AVAILABLE', 'BLOCKED', 'HELD', 'CONFIRMED', 'CANCELLED')
  ),
  CONSTRAINT schedule_slots_source_check CHECK (
    source IN ('CALENDAR_SYNC', 'MANUAL', 'AUTO_BLOCK')
  ),
  CONSTRAINT schedule_slots_calendar_sync_status_check CHECK (
    calendar_sync_status IN ('PENDING', 'SYNCED', 'ERROR')
  )
);

ALTER TABLE app.schedule_slots
  ADD CONSTRAINT schedule_slots_no_overlap
  EXCLUDE USING gist (
    model_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status = 'BLOCKED');

CREATE INDEX schedule_slots_model_time_idx
  ON app.schedule_slots (model_id, starts_at, ends_at);

CREATE TABLE logs.agent_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  trace_id uuid NOT NULL,
  status text NOT NULL,
  duration_ms integer,
  tool_count integer NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 0,
  fallback_used boolean NOT NULL DEFAULT false,
  input_message_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  output_message_id uuid REFERENCES app.messages(id) ON DELETE SET NULL,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_executions_status_check CHECK (status IN ('SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED')),
  CONSTRAINT agent_executions_duration_check CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT agent_executions_tool_count_check CHECK (tool_count >= 0),
  CONSTRAINT agent_executions_retry_count_check CHECK (retry_count >= 0)
);

CREATE INDEX agent_executions_conversation_created_idx
  ON logs.agent_executions (conversation_id, created_at DESC);

CREATE INDEX agent_executions_trace_idx
  ON logs.agent_executions (trace_id);
