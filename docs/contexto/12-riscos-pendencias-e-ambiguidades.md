## Duplicidades consolidadas

O arquivo original repetia algumas decisoes em secoes diferentes. Na divisao, elas foram concentradas como fontes canonicas:

- Redis fora do MVP: `07-integracoes-canais-e-midia.md`.
- Hard handoff e pausa do agente: `09-handoff-seguranca-e-robustez-operacional.md`.
- Estado, memoria e entidades: `05-estado-memoria-e-modelo-de-dados.md`.
- Persona, tom, prompt injection e validacao de saida: `03-persona-tom-e-politica-de-resposta.md`.
- Interface de Fernando e read models: `08-interface-operacional-e-api.md`.
- Observabilidade, testes e criterio de pronto: `10-observabilidade-testes-e-producao-assistida.md`.
- Praticas adotadas/rejeitadas: `11-decisoes-tecnicas-e-praticas-analisadas.md`.


## Lacunas resolvidas na fundacao tecnica

- Estrutura inicial do monorepo ja esta materializada em `apps/`, `packages/`, `db/`, `infra/`, `prompts/`, `scripts/`, `tests/` e `docs/`.
- Contratos versionados iniciais ja existem em `packages/contracts/src/barra_vips_contracts/v1`.
- Migrations SQL puro versionado ja existem em `db/migrations` para schemas e tabelas iniciais.
- Seed minimo de desenvolvimento ja existe em `db/seeds/001_dev_fixture.sql`.
- `infra/docker-compose.dev.yml` ja existe como compose minimo de desenvolvimento para Postgres local.
- Backend/read models/API operacional da Fase 2 ja existem em `apps/api`, com testes pytest cobrindo contratos, autenticacao, webhooks, handoff, midia e read models.


## Lacunas funcionais pendentes

- Regras comerciais detalhadas por modelo ainda nao estao descritas.
- Politica concreta de tolerancia para atrasos, reagendamento e cancelamento nao aparece detalhada.
- Exemplos reais de conversa ainda nao estao incorporados como fixtures/evals.
- Criterio de classificacao de cliente recorrente ainda esta conceitual.
- Desfecho de handoff/atendimento ainda precisa de contrato operacional antes de automatizar `RETURNING`, CRM ou metricas de fechamento, porque handoff nao significa fechamento.
- Detalhes de permissao operacional na interface ainda sao minimos.
- Regras para os quatro perfis de urgencia ainda precisam virar transicoes e prompts testaveis.
- Estrategia de seguranca territorial para saidas permanece humana no MVP, mas ainda precisa virar procedimento operacional claro.
- Politica de contingencia para banimento/troca de numero ainda nao esta definida.


## Lacunas tecnicas pendentes

- Politica de secrets reais por ambiente precisa ser definida.
- Stack de producao, nomes de servicos, imagens/tags, volumes, rede Traefik e estrategia de rollback ainda precisam ser materializados em um unico arquivo canonico de producao.
- Jobs de retencao, sync Calendar e reprocessamento precisam de desenho concreto.
- Fila logica, debounce e lock por `conversation_id` ainda precisam virar implementacao testada.
- Simulador de payloads Evolution precisa ser criado.
- Evals precisam de rubricas e dataset inicial.
- Agente LangGraph ainda precisa ser implementado em `apps/agent`.
- Interface operacional ainda precisa ser implementada em `apps/operator-web`.
- Integracoes reais com Evolution API, Google Calendar, Chatwoot, Whisper, LLM e LangFuse ainda precisam ser conectadas e validadas.
