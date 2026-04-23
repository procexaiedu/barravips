# Visao Geral e Onboarding

Este documento e a porta de entrada do contexto do projeto Barra Vips. Ele resume o que o produto e, por que existe, quais premissas nao podem ser perdidas e como agentes de IA ou desenvolvedores devem se orientar antes de trabalhar no sistema.

As praticas da Joana devem ser copiadas com criterio: copiar arquitetura operacional validada, adaptar o que depende do dominio e rejeitar atalhos que a propria analise mostrou como fragilidade.

## Resumo executivo

O projeto Barra Vips e um sistema de atendimento por IA via WhatsApp que responde clientes como se fosse a propria modelo. O agente realiza atendimento inicial, qualificacao, organizacao do fluxo de agendamento, consulta de disponibilidade, uso de sinais operacionais relevantes e transbordo para atendimento humano nos momentos certos.

O produto nao deve ser tratado como um chatbot generico. Ele e um operador de atendimento disfarcado de pessoa, em uma operacao premium, na qual inconsistencia, tom inadequado ou quebra de persona podem derrubar rapidamente a confianca do cliente.

No MVP, o foco e uma operacao enxuta:

- uma unica modelo ativa;
- um unico numero de WhatsApp ja existente;
- fluxo funcional de ponta a ponta;
- atendimento reativo;
- impersonacao da modelo;
- visibilidade operacional para Fernando;
- base de dados central no Postgres.

Expansoes como multiplas modelos, multiplos numeros, CRM robusto, remarketing, outbound automatico e IA administrativa ficam para fases posteriores.

## Problema real do negocio

O problema declarado inicialmente era ter uma IA mais direcional e que fechasse mais vendas. A leitura consolidada e mais estrutural: a IA deve aliviar o gargalo operacional do atendimento.

Hoje a operacao depende de atencao humana constante, nao escala bem com varios celulares, exige resposta rapida, organizacao de disponibilidade e acionamento correto da pessoa certa no momento certo.

Portanto, a funcao primaria da IA nao e simplesmente conversar bem. A IA existe para operar atendimento com eficiencia, naturalidade e controle.

## Leitura correta do projeto

- Funcao primaria: responder clientes, qualificar, organizar agenda e escalar para humano quando necessario.
- Funcao secundaria: fechar autonomamente tudo o que for possivel dentro das regras definidas.
- Modo de operacao: impersonacao total da modelo, sem se apresentar como sistema.
- Contexto sensivel: o agente lida com agenda, local, foto de confirmacao, comprovante e memoria de cliente.

## Contexto do cliente e da operacao

Fernando opera ha cerca de 10 anos uma operacao premium no Rio de Janeiro, referenciada internamente como Barra Vips. O nome vem da plataforma onde os perfis sao anunciados e por onde clientes chegam organicamente.

O negocio se posiciona como premium. O publico-alvo tem maior poder aquisitivo e busca nao apenas encontro, mas uma experiencia de companhia sofisticada. Isso impacta diretamente o agente:

- clientes sao desconfiados;
- inconsistencias derrubam confianca;
- a conversa precisa ser curta, convincente e natural;
- respostas com cara de bot, script rigido ou incoerencia reduzem conversao;
- o tom precisa preservar discricao, exclusividade e naturalidade.

Fernando possui conhecimento tacito sobre operacao, seguranca, clientes, localizacao, agenda e gestao de modelos. Parte essencial do projeto e transformar esse conhecimento informal em regras operacionais e comportamentais utilizaveis pela IA.

## Origem do contexto

O contexto consolidado nasceu de uma ata de alinhamento estrategico com Fernando. A ata original registra a origem do projeto, a dor operacional, os fluxos iniciais, a visao de longo prazo e varios pontos de negocio que depois foram refinados no documento consolidado.

## Superficies principais do produto

O MVP possui quatro superficies principais:

- agente de atendimento no WhatsApp;
- backend/API e banco operacional;
- interface operacional propria para Fernando;
- integracoes externas, como Evolution API, Google Calendar, Chatwoot e provedores de LLM/audio.

A interface operacional propria de Fernando e parte do MVP. Ela deve dar visibilidade centralizada sobre dashboard, conversas, agenda, handoffs e registros relevantes. A fonte principal de leitura dessa interface e o Postgres, acessado por backend/read models, e nao integracoes externas diretamente.

## Documentos recomendados

Para entender o projeto completo, leia em ordem:

1. `00-visao-geral-e-onboarding.md`
2. `01-escopo-mvp-e-roadmap.md`
3. `02-regras-de-negocio-e-operacao.md`
4. `03-persona-tom-e-politica-de-resposta.md`
5. `04-fluxos-de-atendimento.md`
6. `05-estado-memoria-e-modelo-de-dados.md`
7. `06-arquitetura-stack-e-repositorio.md`
8. `07-integracoes-canais-e-midia.md`
9. `08-interface-operacional-e-api.md`
10. `09-handoff-seguranca-e-robustez-operacional.md`
11. `10-observabilidade-testes-e-producao-assistida.md`
12. `11-decisoes-tecnicas-e-praticas-analisadas.md`
13. `12-riscos-pendencias-e-ambiguidades.md`


Para agentes que vao alterar codigo, o minimo recomendado e ler os documentos `00`, `01`, `03`, `04`, `05`, `06` e o arquivo especifico da area alterada.

## Resumo em uma frase

O projeto Barra Vips e um sistema de atendimento por IA, via WhatsApp, que impersona uma modelo real para qualificar clientes, conduzir o fluxo de marcacao, consultar disponibilidade, lidar com sinais operacionais relevantes e transbordar para a modelo no momento certo, comecando por um MVP enxuto, contextual e orientado a operacao.
