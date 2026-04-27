-- Funde app.escort_availability (PK = escort_id, 1:1 com app.escorts) e
-- app.escort_preferences (EAV de 2 colunas key/value sem schema) como colunas
-- de app.escorts.
--
-- Motivacao:
--   - escort_availability nasceu como tabela separada por normalizacao canonica,
--     mas eh estritamente 1:1, sempre lida em bloco com a escort, e tem apenas
--     tres inteiros opcionais. Nao ha nada relacional a ganhar.
--   - escort_preferences eh (key text, value text) sem semantica, sem CHECK
--     alem de UNIQUE (escort_id, key). Eh o anti-pattern EAV. O precedente
--     correto esta em app.clients.preferences_json (jsonb).
--
-- Hoje as duas tabelas estao vazias (0 linhas), entao o passo de copia eh
-- defensivo: cobre o caso de alguma insercao entre a definicao desta migration
-- e sua aplicacao em outro ambiente.

ALTER TABLE app.escorts
  ADD COLUMN min_duration_minutes int,
  ADD COLUMN advance_booking_minutes int,
  ADD COLUMN max_bookings_per_day int,
  ADD COLUMN preferences_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT escorts_min_duration_positive CHECK (
    min_duration_minutes IS NULL OR min_duration_minutes > 0
  ),
  ADD CONSTRAINT escorts_advance_non_negative CHECK (
    advance_booking_minutes IS NULL OR advance_booking_minutes >= 0
  ),
  ADD CONSTRAINT escorts_max_bookings_positive CHECK (
    max_bookings_per_day IS NULL OR max_bookings_per_day > 0
  );

-- Copia dados pre-existentes de escort_availability (no-op hoje).
UPDATE app.escorts e
SET min_duration_minutes    = a.min_duration_minutes,
    advance_booking_minutes = a.advance_booking_minutes,
    max_bookings_per_day    = a.max_bookings_per_day,
    updated_at              = now()
FROM app.escort_availability a
WHERE a.escort_id = e.id;

-- Copia dados pre-existentes de escort_preferences (no-op hoje).
UPDATE app.escorts e
SET preferences_json = sub.merged,
    updated_at       = now()
FROM (
  SELECT escort_id, jsonb_object_agg(key, value) AS merged
  FROM app.escort_preferences
  GROUP BY escort_id
) AS sub
WHERE sub.escort_id = e.id;

DROP TABLE app.escort_preferences;
DROP TABLE app.escort_availability;
