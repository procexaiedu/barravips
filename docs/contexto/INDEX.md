# Indice de Contexto do Projeto Barra Vips

Este indice organiza os documentos da pasta `docs/contexto` por finalidade pratica. Use-o para localizar rapidamente o contexto de produto, regras de negocio, arquitetura, contratos, riscos e criterios de producao assistida.

## Visao geral da pasta

A pasta contem o contexto consolidado do MVP Barra Vips: um sistema de atendimento por IA via WhatsApp que impersona uma modelo real, opera de forma reativa, qualifica clientes, conduz agenda dentro de limites definidos e faz hard handoff para humano nos momentos certos.

Os documentos formam uma base de referencia para desenvolvedores e agentes de IA. Eles cobrem:

- escopo e roadmap do MVP;
- regras de negocio, operacao e persona;
- fluxos de atendimento interno e externo;
- estado conversacional, memoria e modelo de dados;
- arquitetura, stack, repositorio e deploy;
- integracoes com Evolution API, Google Calendar, Chatwoot, audio e midia;
- interface operacional e read models;
- handoff, seguranca, resiliencia e concorrencia;
- observabilidade, testes, producao assistida, decisoes e lacunas.

## Mapa de navegacao recomendado

Para onboarding geral, leia nesta ordem:

1. [00-visao-geral-e-onboarding.md](00-visao-geral-e-onboarding.md)
2. [01-escopo-mvp-e-roadmap.md](01-escopo-mvp-e-roadmap.md)
3. [02-regras-de-negocio-e-operacao.md](02-regras-de-negocio-e-operacao.md)
4. [03-persona-tom-e-politica-de-resposta.md](03-persona-tom-e-politica-de-resposta.md)
5. [04-fluxos-de-atendimento.md](04-fluxos-de-atendimento.md)
6. [05-estado-memoria-e-modelo-de-dados.md](05-estado-memoria-e-modelo-de-dados.md)
7. [06-arquitetura-stack-e-repositorio.md](06-arquitetura-stack-e-repositorio.md)
8. [07-integracoes-canais-e-midia.md](07-integracoes-canais-e-midia.md)
9. [08-interface-operacional-e-api.md](08-interface-operacional-e-api.md)
10. [09-handoff-seguranca-e-robustez-operacional.md](09-handoff-seguranca-e-robustez-operacional.md)
11. [10-observabilidade-testes-e-producao-assistida.md](10-observabilidade-testes-e-producao-assistida.md)
12. [11-decisoes-tecnicas-e-praticas-analisadas.md](11-decisoes-tecnicas-e-praticas-analisadas.md)
13. [12-riscos-pendencias-e-ambiguidades.md](12-riscos-pendencias-e-ambiguidades.md)

Para alteracoes de codigo, leia sempre os documentos `00`, `01`, `03`, `04`, `05` e `06`, mais o documento especifico da area alterada.

## Arquivos fundamentais

- [00-visao-geral-e-onboarding.md](00-visao-geral-e-onboarding.md): porta de entrada e interpretacao correta do projeto.
- [01-escopo-mvp-e-roadmap.md](01-escopo-mvp-e-roadmap.md): limites do MVP e criterio minimo de producao assistida.
- [03-persona-tom-e-politica-de-resposta.md](03-persona-tom-e-politica-de-resposta.md): contrato de comunicacao do agente.
- [04-fluxos-de-atendimento.md](04-fluxos-de-atendimento.md): comportamento funcional dos fluxos interno e externo.
- [05-estado-memoria-e-modelo-de-dados.md](05-estado-memoria-e-modelo-de-dados.md): fonte principal para estado, memoria e schema relacional.
- [06-arquitetura-stack-e-repositorio.md](06-arquitetura-stack-e-repositorio.md): arquitetura tecnica e organizacao do monorepo.
- [09-handoff-seguranca-e-robustez-operacional.md](09-handoff-seguranca-e-robustez-operacional.md): regras criticas de handoff, pausa do agente, erro e concorrencia.
- [10-observabilidade-testes-e-producao-assistida.md](10-observabilidade-testes-e-producao-assistida.md): testes, evals, metricas e criterios de pronto.
- [12-riscos-pendencias-e-ambiguidades.md](12-riscos-pendencias-e-ambiguidades.md): lacunas e pendencias que ainda precisam virar artefatos implementaveis.

## Alertas de consistencia

- **Documento sem H1:** [12-riscos-pendencias-e-ambiguidades.md](12-riscos-pendencias-e-ambiguidades.md) comeca em `## Duplicidades consolidadas`. O assunto esta claro, mas falta titulo de nivel 1.
- **Ambiguidade resolvida:** [01-escopo-mvp-e-roadmap.md](01-escopo-mvp-e-roadmap.md) registra a tensao entre "um unico fluxo funcional de ponta a ponta" e a necessidade de suportar fluxo interno e fluxo de saida. A leitura consolidada e: uma operacao unica com dois caminhos operacionais principais.
- **Estimativa legada:** [06-arquitetura-stack-e-repositorio.md](06-arquitetura-stack-e-repositorio.md) marca a estimativa de custo dual-tier como historica/legada. Nao use essa estimativa como premissa atual sem recalcular com consumo real.
- **Duplicidades ja consolidadas:** [12-riscos-pendencias-e-ambiguidades.md](12-riscos-pendencias-e-ambiguidades.md) lista onde decisoes repetidas foram centralizadas, como Redis fora do MVP, hard handoff, persona, interface e observabilidade.
- **Potencial conflito futuro:** [06-arquitetura-stack-e-repositorio.md](06-arquitetura-stack-e-repositorio.md) e [11-decisoes-tecnicas-e-praticas-analisadas.md](11-decisoes-tecnicas-e-praticas-analisadas.md) reforcam que nao devem existir `docker-compose.prod.yml` e `infra/portainer-stack.yml` com a mesma responsabilidade. Deve haver um unico artefato canonico de producao.

## Categoria: orientacao de produto e escopo

### [00-visao-geral-e-onboarding.md](00-visao-geral-e-onboarding.md)

- **Caminho relativo:** `00-visao-geral-e-onboarding.md`
- **Titulo ou assunto principal:** Visao geral, onboarding e leitura correta do projeto.
- **Resumo:** Explica o que e o Barra Vips, por que existe e como interpretar o produto. Define que o agente nao e um chatbot generico, mas um operador de atendimento que impersona uma modelo em uma operacao premium.
- **Principais topicos:** objetivo do produto, problema de negocio, contexto do cliente, origem do contexto, superficies do MVP, ordem recomendada de leitura.
- **Quando consultar:** antes de qualquer implementacao, revisao de arquitetura, onboarding de desenvolvedor ou agente de IA.
- **Relacoes:** introduz todos os demais documentos e define a sequencia canonica de leitura. Complementa [01](01-escopo-mvp-e-roadmap.md) para escopo e [06](06-arquitetura-stack-e-repositorio.md) para arquitetura.

### [01-escopo-mvp-e-roadmap.md](01-escopo-mvp-e-roadmap.md)

- **Caminho relativo:** `01-escopo-mvp-e-roadmap.md`
- **Titulo ou assunto principal:** Escopo do MVP, fora de escopo e roadmap.
- **Resumo:** Delimita o que entra no MVP e o que fica para fases futuras. Tambem define sequencia de implementacao e criterio minimo para producao assistida.
- **Principais topicos:** 1 modelo, 1 numero WhatsApp, atendimento reativo, interface operacional, observabilidade minima, itens fora do MVP, roadmap futuro, ambiguidade sobre fluxo unico.
- **Quando consultar:** ao decidir se uma feature pertence ao MVP, ao planejar fases de entrega ou ao avaliar prontidao para uso real assistido.
- **Relacoes:** deve ser lido junto com [10](10-observabilidade-testes-e-producao-assistida.md) para criterios de pronto e com [12](12-riscos-pendencias-e-ambiguidades.md) para pendencias abertas.

## Categoria: negocio, operacao e persona

### [02-regras-de-negocio-e-operacao.md](02-regras-de-negocio-e-operacao.md)

- **Caminho relativo:** `02-regras-de-negocio-e-operacao.md`
- **Titulo ou assunto principal:** Regras de negocio e operacao.
- **Resumo:** Consolida premissas operacionais que nao dependem diretamente da implementacao tecnica. Define atendimento reativo, impersonacao, negociacao com piso, disponibilidade, horario de operacao, onboarding/offboarding de modelo e retencao de dados.
- **Principais topicos:** agente reativo, persona real, pedidos fora do escopo, negociacao limitada, Google Calendar como referencia visual, Postgres como fonte do sistema, AUTO_BLOCK, operacao 24/7, sinais de qualidade do cliente, local ativo, retencao.
- **Quando consultar:** ao implementar regras comerciais, agenda, bloqueio automatico, cadastro de modelo, politicas de dados ou comportamento operacional do agente.
- **Relacoes:** complementa [03](03-persona-tom-e-politica-de-resposta.md) para tom, [04](04-fluxos-de-atendimento.md) para fluxo, [05](05-estado-memoria-e-modelo-de-dados.md) para campos e tabelas, e [07](07-integracoes-canais-e-midia.md) para Calendar.

### [03-persona-tom-e-politica-de-resposta.md](03-persona-tom-e-politica-de-resposta.md)

- **Caminho relativo:** `03-persona-tom-e-politica-de-resposta.md`
- **Titulo ou assunto principal:** Persona, tom e politica de resposta.
- **Resumo:** Define os pilares de comunicacao do agente e as validacoes obrigatorias antes de enviar mensagem. O foco e manter respostas curtas, naturais, discretas e coerentes com a modelo.
- **Principais topicos:** atributos da persona, o que evitar, cadencia de WhatsApp, politica multilingue, prompt injection, validacao deterministica de saida, robustez conversacional, versionamento de prompts.
- **Quando consultar:** ao escrever prompts, validadores, sanitizacao, testes de resposta, politicas de idioma ou comportamento contra prompt injection.
- **Relacoes:** e essencial para [04](04-fluxos-de-atendimento.md), [06](06-arquitetura-stack-e-repositorio.md), [10](10-observabilidade-testes-e-producao-assistida.md) e [11](11-decisoes-tecnicas-e-praticas-analisadas.md).

## Categoria: fluxos, estado e dados

### [04-fluxos-de-atendimento.md](04-fluxos-de-atendimento.md)

- **Caminho relativo:** `04-fluxos-de-atendimento.md`
- **Titulo ou assunto principal:** Fluxos de atendimento.
- **Resumo:** Descreve os caminhos funcionais do WhatsApp, incluindo fluxo interno e saida/externo. Define gatilhos de estado, comprovante, foto de chegada, agenda e escalada.
- **Principais topicos:** `flow_type`, perfis por urgencia, fluxo interno, fluxo externo, comprovante, foto de chegada, agenda, escalada funcional, mensagens picotadas e midia.
- **Quando consultar:** ao implementar ou testar o grafo do agente, classificacao de fluxo, agenda, handoff, processamento de imagens e debounce funcional.
- **Relacoes:** depende das regras de [02](02-regras-de-negocio-e-operacao.md), materializa estados de [05](05-estado-memoria-e-modelo-de-dados.md), e conecta com handoff em [09](09-handoff-seguranca-e-robustez-operacional.md).

### [05-estado-memoria-e-modelo-de-dados.md](05-estado-memoria-e-modelo-de-dados.md)

- **Caminho relativo:** `05-estado-memoria-e-modelo-de-dados.md`
- **Titulo ou assunto principal:** Estado, memoria e modelo de dados.
- **Resumo:** E a principal referencia para estados conversacionais, memoria curta/longa e modelo relacional do MVP. Define entidades, tabelas canonicas, invariantes, indices e relacao com LangGraph/PostgresSaver.
- **Principais topicos:** estados `NOVO`, `QUALIFICANDO`, `NEGOCIANDO`, `CONFIRMADO`, `ESCALADO`; `flow_type`; campos operacionais; cliente recorrente; entidades minimas; tabelas `app.clients`, `app.models`, `app.conversations`, `app.messages`, `app.raw_webhook_events`, `app.handoff_events`, `app.integration_status`, `app.media_assets`, `app.receipts`, `app.schedule_slots`, `logs.agent_executions`.
- **Quando consultar:** ao criar migrations, contratos Pydantic/JSON, tools do agente, read models, persistencia, memoria, checkpoints, locks ou logs.
- **Relacoes:** base tecnica para [06](06-arquitetura-stack-e-repositorio.md), [08](08-interface-operacional-e-api.md), [09](09-handoff-seguranca-e-robustez-operacional.md) e [10](10-observabilidade-testes-e-producao-assistida.md).

## Categoria: arquitetura, stack e integracoes

### [06-arquitetura-stack-e-repositorio.md](06-arquitetura-stack-e-repositorio.md)

- **Caminho relativo:** `06-arquitetura-stack-e-repositorio.md`
- **Titulo ou assunto principal:** Arquitetura, stack e repositorio.
- **Resumo:** Define a arquitetura tecnica do MVP, stack confirmada, estrutura de monorepo, deploy e pipeline de entrada. Estabelece agente unico com tools em LangGraph e Postgres como base principal.
- **Principais topicos:** monorepo, sequencia tecnica, LangGraph, Claude Sonnet 4.6, PostgresSaver, Evolution API, Google Calendar, Supabase, Chatwoot, LangFuse, Groq Whisper, Vercel, Portainer, schemas, ambientes, deploy, contratos versionados, pipeline de webhook.
- **Quando consultar:** ao montar repositorio, escolher dependencias, desenhar servicos, configurar deploy, implementar pipeline de entrada ou definir limites entre API, agente e frontend.
- **Relacoes:** consolida decisoes de [11](11-decisoes-tecnicas-e-praticas-analisadas.md), depende do modelo de dados de [05](05-estado-memoria-e-modelo-de-dados.md) e detalha integracoes tratadas em [07](07-integracoes-canais-e-midia.md).

### [07-integracoes-canais-e-midia.md](07-integracoes-canais-e-midia.md)

- **Caminho relativo:** `07-integracoes-canais-e-midia.md`
- **Titulo ou assunto principal:** Integracoes, canais e midia.
- **Resumo:** Especifica o uso de WhatsApp via Evolution API, Google Calendar, Chatwoot, audio, debounce e midia. Reforca que Redis, MinIO/S3 e WhatsApp Cloud API ficam fora do MVP salvo necessidade futura.
- **Principais topicos:** Evolution API, webhook `messages.upsert`, `connection.update`, envio WhatsApp, Calendar sync, Chatwoot, transcricao de audio, debounce por `conversation_id`, banco de midia, selecao e publicacao de midia.
- **Quando consultar:** ao implementar webhooks, clientes HTTP, envio de mensagens, sync de agenda, transcricao, debounce, armazenamento local de midias ou integracao com Chatwoot.
- **Relacoes:** complementa [06](06-arquitetura-stack-e-repositorio.md) no nivel operacional, usa tabelas de [05](05-estado-memoria-e-modelo-de-dados.md) e se conecta a seguranca/retry em [09](09-handoff-seguranca-e-robustez-operacional.md).

## Categoria: interface operacional e API

### [08-interface-operacional-e-api.md](08-interface-operacional-e-api.md)

- **Caminho relativo:** `08-interface-operacional-e-api.md`
- **Titulo ou assunto principal:** Interface operacional e API.
- **Resumo:** Especifica a interface propria de Fernando e os read models que o backend deve expor. Define endpoints minimos, autenticacao operacional, rotas de frontend e limites da intervencao humana.
- **Principais topicos:** papel da interface, fonte de dados, diretrizes de API, endpoints de conversas, agenda, midias, status e webhooks, frontend, `OPERATOR_API_KEY`, read models, relacao com Chatwoot, intervencao operacional.
- **Quando consultar:** ao construir o backend HTTP, read models, frontend operacional, proxy de autenticacao, endpoints de midia ou telas de conversa/agenda/handoff/status.
- **Relacoes:** consome entidades de [05](05-estado-memoria-e-modelo-de-dados.md), segue arquitetura de [06](06-arquitetura-stack-e-repositorio.md), usa integracoes de [07](07-integracoes-canais-e-midia.md) e eventos de handoff de [09](09-handoff-seguranca-e-robustez-operacional.md).

## Categoria: handoff, seguranca e resiliencia

### [09-handoff-seguranca-e-robustez-operacional.md](09-handoff-seguranca-e-robustez-operacional.md)

- **Caminho relativo:** `09-handoff-seguranca-e-robustez-operacional.md`
- **Titulo ou assunto principal:** Handoff, seguranca e robustez operacional.
- **Resumo:** Define hard handoff, pausa persistente do agente, seguranca de webhook, estrategia de erro, degradacao, SLA e concorrencia por conversa. E um documento critico para evitar resposta duplicada entre agente e humano.
- **Principais topicos:** `handoff_opened`, `handoff_acknowledged`, `handoff_released`, pausa formal, notificacao operacional, `fromMe`, webhook secret, retries/fallbacks, matriz de degradacao, latencia, lock por `conversation_id`, maquina de estados do handoff.
- **Quando consultar:** ao implementar handoff, processamento de `fromMe`, seguranca de entrada, idempotencia, retry, fallback, concorrencia, locks, jobs de recuperacao ou criterios de SLA.
- **Relacoes:** operacionaliza [04](04-fluxos-de-atendimento.md), usa campos/tabelas de [05](05-estado-memoria-e-modelo-de-dados.md), integra canais de [07](07-integracoes-canais-e-midia.md) e define testes esperados em [10](10-observabilidade-testes-e-producao-assistida.md).

## Categoria: qualidade, testes e producao

### [10-observabilidade-testes-e-producao-assistida.md](10-observabilidade-testes-e-producao-assistida.md)

- **Caminho relativo:** `10-observabilidade-testes-e-producao-assistida.md`
- **Titulo ou assunto principal:** Observabilidade, testes e producao assistida.
- **Resumo:** Define metricas, tracing, logs, suites de teste, evals LLM-as-judge e criterios minimos para expor o MVP a uso real assistido. Prioriza asserts sobre estado estruturado e trace, nao texto exato do LLM.
- **Principais topicos:** metricas operacionais, LangFuse, `trace_id`, `logs.agent_executions`, testes de agente, integracao, debounce, concorrencia, evals offline, rubricas, criterio minimo de pronto, calibracao com experiencia real.
- **Quando consultar:** ao montar testes, evals, observabilidade, dashboards, criterios de aceite, producao assistida ou investigacao de falhas.
- **Relacoes:** valida requisitos de [03](03-persona-tom-e-politica-de-resposta.md), [04](04-fluxos-de-atendimento.md), [05](05-estado-memoria-e-modelo-de-dados.md), [07](07-integracoes-canais-e-midia.md) e [09](09-handoff-seguranca-e-robustez-operacional.md).

## Categoria: decisoes, praticas e lacunas

### [11-decisoes-tecnicas-e-praticas-analisadas.md](11-decisoes-tecnicas-e-praticas-analisadas.md)

- **Caminho relativo:** `11-decisoes-tecnicas-e-praticas-analisadas.md`
- **Titulo ou assunto principal:** Decisoes tecnicas e praticas analisadas.
- **Resumo:** Registra decisoes consolidadas do MVP, praticas adotadas/adaptadas de projeto similar, praticas rejeitadas e temas que so devem ser investigados com evidencia. Tambem reconcilia desenho anterior em n8n com a arquitetura atual.
- **Principais topicos:** agente unico, monorepo, Postgres, Evolution API, Calendar, Chatwoot, Groq Whisper, filesystem local, LangFuse, Portainer, praticas adotadas, praticas rejeitadas, Redis fora do MVP, RAG fora do MVP, ADRs futuros.
- **Quando consultar:** ao justificar escolhas arquiteturais, evitar regressao para padroes rejeitados, revisar PRs de arquitetura ou decidir se uma complexidade deve entrar no MVP.
- **Relacoes:** explica a origem de decisoes refletidas em [06](06-arquitetura-stack-e-repositorio.md), [07](07-integracoes-canais-e-midia.md), [09](09-handoff-seguranca-e-robustez-operacional.md) e [10](10-observabilidade-testes-e-producao-assistida.md).

### [12-riscos-pendencias-e-ambiguidades.md](12-riscos-pendencias-e-ambiguidades.md)

- **Caminho relativo:** `12-riscos-pendencias-e-ambiguidades.md`
- **Titulo ou assunto principal:** Duplicidades consolidadas, lacunas funcionais e lacunas tecnicas.
- **Resumo:** Lista decisoes que foram centralizadas em documentos canonicos e aponta lacunas que ainda precisam virar regras, schemas, migrations, jobs, fixtures, evals ou procedimentos operacionais.
- **Principais topicos:** duplicidades consolidadas, regras comerciais pendentes, politica de atraso/reagendamento/cancelamento, fixtures/evals, criterio de cliente recorrente, seguranca territorial, contingencia de numero, contratos JSON, migrations, monorepo, secrets, stacks, jobs, simulador Evolution.
- **Quando consultar:** ao planejar backlog, preparar sprints, abrir issues, definir ADRs ou identificar riscos antes de producao assistida.
- **Relacoes:** fecha o ciclo com pendencias derivadas de todos os documentos anteriores, especialmente [01](01-escopo-mvp-e-roadmap.md), [05](05-estado-memoria-e-modelo-de-dados.md), [06](06-arquitetura-stack-e-repositorio.md), [08](08-interface-operacional-e-api.md) e [10](10-observabilidade-testes-e-producao-assistida.md).

## Lacunas e documentos que deveriam existir

Os documentos atuais sao suficientes para orientar o MVP, mas ainda faltam artefatos mais executaveis:

- `contracts/` ou documento especifico de schemas versionados para Evolution, Chatwoot, read models e tools.
- ADRs formais para decisoes que podem ser revisitadas quando o projeto crescer.
- Documento de regras comerciais reais por modelo, com precos, duracoes, limites, servicos oferecidos e nao oferecidos.
- Procedimento operacional para seguranca territorial em saidas.
- Politica concreta de atraso, reagendamento, cancelamento e no-show.
- Politica de contingencia para banimento, perda ou troca do numero WhatsApp.
- Guia de secrets por ambiente, incluindo nomes canonicos e rotacao.
- Plano de jobs de retencao, anonimizacao, Calendar sync e reprocessamento de mensagens.
- Dataset inicial de fixtures/evals com conversas anonimizadas e rubricas versionadas.
- Especificacao inicial do `docker-compose.dev.yml` e do artefato canonico de producao.
- Procedimento de onboarding/offboarding com checklist operacional convertivel em tarefa.

## Arquivos analisados

- [00-visao-geral-e-onboarding.md](00-visao-geral-e-onboarding.md)
- [01-escopo-mvp-e-roadmap.md](01-escopo-mvp-e-roadmap.md)
- [02-regras-de-negocio-e-operacao.md](02-regras-de-negocio-e-operacao.md)
- [03-persona-tom-e-politica-de-resposta.md](03-persona-tom-e-politica-de-resposta.md)
- [04-fluxos-de-atendimento.md](04-fluxos-de-atendimento.md)
- [05-estado-memoria-e-modelo-de-dados.md](05-estado-memoria-e-modelo-de-dados.md)
- [06-arquitetura-stack-e-repositorio.md](06-arquitetura-stack-e-repositorio.md)
- [07-integracoes-canais-e-midia.md](07-integracoes-canais-e-midia.md)
- [08-interface-operacional-e-api.md](08-interface-operacional-e-api.md)
- [09-handoff-seguranca-e-robustez-operacional.md](09-handoff-seguranca-e-robustez-operacional.md)
- [10-observabilidade-testes-e-producao-assistida.md](10-observabilidade-testes-e-producao-assistida.md)
- [11-decisoes-tecnicas-e-praticas-analisadas.md](11-decisoes-tecnicas-e-praticas-analisadas.md)
- [12-riscos-pendencias-e-ambiguidades.md](12-riscos-pendencias-e-ambiguidades.md)
