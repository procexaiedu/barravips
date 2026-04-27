-- Simplifica o módulo de mídias: remove o workflow editorial (approval_status,
-- send_constraints_json, category) e adota classificação por tags multi-valoradas
-- com vocabulário controlado, mais um único estado is_active/inactive.

ALTER TABLE app.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_approval_status_check;

ALTER TABLE app.media_assets
  DROP COLUMN IF EXISTS approval_status,
  DROP COLUMN IF EXISTS send_constraints_json,
  DROP COLUMN IF EXISTS category;

ALTER TABLE app.media_assets
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN deactivated_at timestamptz;

CREATE INDEX media_assets_is_active_idx ON app.media_assets (is_active);

CREATE INDEX messages_media_id_idx
  ON app.messages (media_id)
  WHERE media_id IS NOT NULL;

CREATE TABLE app.media_tag_vocabulary (
  tag text PRIMARY KEY,
  display_label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.media_tags (
  media_id uuid NOT NULL REFERENCES app.media_assets(id) ON DELETE CASCADE,
  tag text NOT NULL REFERENCES app.media_tag_vocabulary(tag) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, tag)
);

CREATE INDEX media_tags_tag_idx ON app.media_tags (tag);

INSERT INTO app.media_tag_vocabulary (tag, display_label, sort_order) VALUES
  ('produto',       'Produto',       10),
  ('preco',         'Preço',         20),
  ('case',          'Case',          30),
  ('prova-social',  'Prova social',  40),
  ('tutorial',      'Tutorial',      50),
  ('institucional', 'Institucional', 60),
  ('objecoes',      'Objeções',      70),
  ('pos-venda',     'Pós-venda',     80)
ON CONFLICT (tag) DO NOTHING;
