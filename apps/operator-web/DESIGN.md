# Operator Web Design Rules

## Papel da UI

- A primeira tela e sempre operacional; nao existe landing page.
- Cada tela deve ajudar Fernando a decidir o proximo clique com base no estado real da operacao.
- Nao prometer saude, disponibilidade ou integracao que a API ainda nao mede.
- Nao criar canal de chat manual, composer, template sender ou resposta pelo painel.

## Direcao Visual

- Painel denso, escuro e de alto contraste, inspirado no site institucional sem copiar decoracao.
- Preto e cinza escuro como base; dourado para rotulos e bordas de prioridade; vermelho apenas para alerta, erro ou destaque de risco.
- Sem gradientes, orbs, glassmorphism, blur decorativo ou hero.
- Bordas simples, raio maximo de 8px e espacamento compacto.

## Layout

- Shell fixo com navegacao lateral em desktop e navegacao compacta em telas estreitas.
- Conteudo principal sempre mostra titulo, descricao operacional curta e estado da tela.
- Nao usar cards aninhados. Um painel pode conter tabela, lista ou metricas, mas nao outro painel visualmente emoldurado.
- Evitar dashboards analiticos pesados; priorizar filas, status e pendencias acionaveis.

## Tabelas e Listas

- Cabecalhos claros, colunas alinhadas e densidade suficiente para varrer muitos registros.
- Datas, estados e identificadores devem ser legiveis sem depender apenas de cor.
- Listas vazias precisam dizer o que esta vazio e se isso e esperado.
- Erros precisam informar a falha operacional e manter uma acao simples de tentar novamente quando aplicavel.

## Estados

- Loading: linha ou bloco simples com texto direto, sem skeleton decorativo complexo.
- Empty: mensagem curta no mesmo espaco da lista/tabela.
- Error: bloco com borda vermelha, mensagem do BFF e acao de retry quando houver fetch no browser.
- Success: mostrar dado bruto suficiente para auditoria inicial, sem mascarar campos importantes.

## Componentes

- Preferir HTML semantico e CSS local/global simples.
- Componentes compartilhados so entram quando removem duplicacao real entre telas.
- Badges sao compactos e textuais; nao criar sistema de variantes amplo antes da necessidade.
- Botoes usam texto direto para comandos operacionais; icones podem ser adicionados quando houver acoes reais.

## Seguranca de Frontend

- Browser chama apenas `/api/operator/**`.
- `BACKEND_API_URL` e `OPERATOR_API_KEY` sao server-only e nunca usam `NEXT_PUBLIC_`.
- Client Components nao importam `src/server/**`.
- CORS nao e o caminho principal; o BFF server-side injeta a chave no backend.
