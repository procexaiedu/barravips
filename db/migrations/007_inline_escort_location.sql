-- Funde app.escort_locations em app.escorts como local fixo unico.
--
-- Motivacao:
--   - Cada modelo tem no maximo um local fixo de atendimento. A tabela plural
--     com sort_order foi over-engineered: nao houve caso real de modelo com
--     N enderecos.
--   - Locais sao sempre lidos em bloco com a escort. Mesmo argumento de
--     006_inline_escort_singletons: 1:1, sem ganho relacional, inline eh mais
--     simples do que uma tabela 1:1 separada.
--   - O deslocamento passa a ser propriedade da modelo (sim/nao + taxa
--     opcional), nao do local. O local descreve onde ela atende fixo;
--     deslocamento eh um modo alternativo de atendimento.
--   - Esquema antigo carregava (city, neighborhood) sem endereco real nem
--     pontos de referencia. O novo permite cadastrar o local de fato:
--     nome, endereco completo (com numero do apto, etc.) e referencias.
--
-- Hoje app.escort_locations esta vazia em desenvolvimento. A copia abaixo eh
-- defensiva: cobre o caso de algum insert ter ocorrido entre a definicao
-- desta migration e a aplicacao em outro ambiente.

ALTER TABLE app.escorts
  ADD COLUMN place_name text,
  ADD COLUMN place_address text,
  ADD COLUMN place_reference_points text,
  ADD COLUMN accepts_displacement boolean NOT NULL DEFAULT false,
  ADD COLUMN displacement_fee_cents int,
  ADD CONSTRAINT escorts_displacement_fee_non_negative CHECK (
    displacement_fee_cents IS NULL OR displacement_fee_cents >= 0
  ),
  ADD CONSTRAINT escorts_displacement_fee_requires_displacement CHECK (
    displacement_fee_cents IS NULL OR accepts_displacement = true
  );

-- Copia o primeiro local existente (menor sort_order) como local fixo da
-- escort. (city, neighborhood) viram um place_address sintetico para nao
-- perder dado historico. Em dev hoje eh no-op.
UPDATE app.escorts e
SET place_address          = sub.address_text,
    accepts_displacement   = sub.accepts_displacement,
    displacement_fee_cents = sub.displacement_fee_cents,
    updated_at             = now()
FROM (
  SELECT DISTINCT ON (escort_id)
    escort_id,
    NULLIF(trim(both ' - ' FROM concat_ws(' - ', neighborhood, city)), '') AS address_text,
    accepts_displacement,
    displacement_fee_cents
  FROM app.escort_locations
  ORDER BY escort_id, sort_order, created_at
) AS sub
WHERE sub.escort_id = e.id;

DROP TABLE app.escort_locations;
