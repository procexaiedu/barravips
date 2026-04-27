-- Colapsa app.media_tags (N:N) e app.media_tag_vocabulary (8 valores curados)
-- como uma coluna text[] em app.media_assets.
--
-- Motivacao:
--   - app.media_tag_vocabulary tem 8 linhas, gerenciadas por engenharia em SQL
--     (vide migration 004). Nao ha endpoint para o operador editar o
--     vocabulario - eh um enum disfarcado de tabela.
--   - app.media_tags eh N:N puro com 0 linhas hoje. Refatorar agora eh livre.
--   - O codigo paga ~12 pontos de toque para hidratar `tags` em cada listagem
--     de midia (subqueries com array_agg). Coluna text[] reduz para 1 SELECT
--     direto.
--   - O `display_label` e `sort_order` de cada tag passam a viver em
--     apps/api/src/barra_vips_api/media.py (constante MEDIA_TAGS). Endpoint
--     GET /api/media/tags continua existindo com o mesmo shape, servido da
--     constante. Frontend nao muda.
--
-- O CHECK constraint trava o conjunto valido em DDL: se a engenharia mudar
-- o vocabulario no futuro, eh uma migration nova alterando o CHECK e a
-- constante Python juntas.

ALTER TABLE app.media_assets
  ADD COLUMN tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD CONSTRAINT media_assets_tags_known CHECK (
    tags <@ ARRAY[
      'rosto', 'corpo', 'casual', 'sensual',
      'elegante', 'lingerie', 'praia-piscina', 'ambiente'
    ]::text[]
  );

CREATE INDEX media_assets_tags_idx ON app.media_assets USING gin (tags);

-- Defensivo: copia tags ja registradas (0 linhas hoje).
UPDATE app.media_assets ma
SET tags = sub.tags
FROM (
  SELECT media_id, array_agg(tag ORDER BY tag) AS tags
  FROM app.media_tags
  GROUP BY media_id
) AS sub
WHERE sub.media_id = ma.id;

DROP TABLE app.media_tags;
DROP TABLE app.media_tag_vocabulary;
