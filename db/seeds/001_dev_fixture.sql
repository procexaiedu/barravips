INSERT INTO app.models (
  id,
  display_name,
  is_active,
  persona_json,
  services_json,
  pricing_json,
  languages
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Modelo em cadastro',
  true,
  '{"fixture_only": true, "persona": "PENDING_DECISION"}'::jsonb,
  '{
    "fixture_only": true,
    "offered": "PENDING_DECISION",
    "not_offered": "PENDING_DECISION",
    "constraints": {
      "min_duration_minutes": "PENDING_DECISION",
      "advance_booking_minutes": "PENDING_DECISION",
      "max_bookings_per_day": "PENDING_DECISION"
    }
  }'::jsonb,
  '{
    "fixture_only": true,
    "currency": "BRL",
    "durations": "PENDING_DECISION",
    "negotiation_floor_pct": "PENDING_DECISION",
    "external_surcharge": "PENDING_DECISION"
  }'::jsonb,
  ARRAY[]::text[]
) ON CONFLICT (id) DO NOTHING;

INSERT INTO app.clients (
  id,
  whatsapp_jid,
  display_name,
  client_status,
  profile_summary,
  preferences_json
) VALUES (
  '20000000-0000-0000-0000-000000000001',
  '5521999999999@s.whatsapp.net',
  'Cliente de exemplo',
  'NEW',
  'Cadastro de exemplo para desenvolvimento. Sem dados reais.',
  '{"fixture_only": true}'::jsonb
) ON CONFLICT (id) DO NOTHING;

INSERT INTO app.conversations (
  id,
  client_id,
  model_id,
  state,
  flow_type,
  handoff_status,
  summary,
  last_message_at
) VALUES (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'NOVO',
  'UNDETERMINED',
  'NONE',
  'Conversa de exemplo para validar a leitura operacional.',
  now()
) ON CONFLICT (id) DO NOTHING;
