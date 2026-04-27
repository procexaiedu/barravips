-- Renomeia o módulo "models" (que sempre representou acompanhantes) para "escorts"
-- e quebra os JSONBs monolíticos persona_json/services_json/pricing_json em tabelas
-- normalizadas. A UI deixa de expor configurações de comportamento ao operador
-- (persona, qualificação, vocabulário) — essas passam a ser definidas pela
-- engenharia no system prompt — e passa a editar apenas catálogo: serviços,
-- locais, preferências discretas e disponibilidade.
--
-- As colunas FK `model_id` em app.media_assets, app.conversations e
-- app.schedule_slots permanecem com o nome atual: o FK referencia a tabela por
-- OID, então o rename é transparente. Renomear as colunas é trabalho separado,
-- com blast radius próprio.

ALTER TABLE app.models RENAME TO escorts;

ALTER INDEX app.one_active_model RENAME TO one_active_escort;

ALTER TABLE app.escorts
  DROP COLUMN persona_json,
  DROP COLUMN services_json,
  DROP COLUMN pricing_json;

ALTER TABLE app.escorts
  ADD COLUMN photo_main_path text;

CREATE TABLE app.escort_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escort_id uuid NOT NULL REFERENCES app.escorts(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  duration_minutes int NOT NULL,
  price_cents int NOT NULL,
  restrictions text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escort_services_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT escort_services_price_non_negative CHECK (price_cents >= 0)
);

CREATE INDEX escort_services_escort_idx
  ON app.escort_services (escort_id, sort_order);

CREATE TABLE app.escort_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escort_id uuid NOT NULL REFERENCES app.escorts(id) ON DELETE CASCADE,
  city text NOT NULL,
  neighborhood text,
  accepts_displacement boolean NOT NULL DEFAULT false,
  displacement_fee_cents int,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escort_locations_fee_non_negative CHECK (
    displacement_fee_cents IS NULL OR displacement_fee_cents >= 0
  ),
  CONSTRAINT escort_locations_fee_requires_displacement CHECK (
    displacement_fee_cents IS NULL OR accepts_displacement = true
  )
);

CREATE INDEX escort_locations_escort_idx
  ON app.escort_locations (escort_id, sort_order);

CREATE TABLE app.escort_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escort_id uuid NOT NULL REFERENCES app.escorts(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escort_preferences_unique UNIQUE (escort_id, key)
);

CREATE INDEX escort_preferences_escort_idx
  ON app.escort_preferences (escort_id);

CREATE TABLE app.escort_availability (
  escort_id uuid PRIMARY KEY REFERENCES app.escorts(id) ON DELETE CASCADE,
  min_duration_minutes int,
  advance_booking_minutes int,
  max_bookings_per_day int,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escort_availability_min_duration_positive CHECK (
    min_duration_minutes IS NULL OR min_duration_minutes > 0
  ),
  CONSTRAINT escort_availability_advance_non_negative CHECK (
    advance_booking_minutes IS NULL OR advance_booking_minutes >= 0
  ),
  CONSTRAINT escort_availability_max_bookings_positive CHECK (
    max_bookings_per_day IS NULL OR max_bookings_per_day > 0
  )
);
