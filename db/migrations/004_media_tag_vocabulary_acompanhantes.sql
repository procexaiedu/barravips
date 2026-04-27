-- Substitui o vocabulario inicial de tags (que vinha como exemplo comercial generico)
-- pelo vocabulario do dominio real: acompanhantes de luxo. Tags refletem styling,
-- foco da imagem e cenario, que sao as dimensoes que o agente vai cruzar com o pedido
-- do cliente.

DELETE FROM app.media_tags;
DELETE FROM app.media_tag_vocabulary;

INSERT INTO app.media_tag_vocabulary (tag, display_label, sort_order) VALUES
  ('rosto',         'Rosto',           10),
  ('corpo',         'Corpo',           20),
  ('casual',        'Casual',          30),
  ('sensual',       'Sensual',         40),
  ('elegante',      'Elegante',        50),
  ('lingerie',      'Lingerie',        60),
  ('praia-piscina', 'Praia / piscina', 70),
  ('ambiente',      'Ambiente',        80)
ON CONFLICT (tag) DO NOTHING;
