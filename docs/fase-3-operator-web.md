# Fase 3 - Operator Web

## Objetivo

A Fase 3 entrega a interface operacional de Fernando em `apps/operator-web`.

A interface deve ser um painel de leitura e intervencao operacional minima sobre os read models do backend FastAPI. Ela nao acessa Postgres/Supabase diretamente, nao expõe `OPERATOR_API_KEY` no browser e nao vira canal de atendimento manual.

Resultado esperado:

- dar visibilidade rapida sobre saude da operacao;
- listar conversas, handoffs, agenda, midias, modelo ativa e status;
- permitir apenas acoes operacionais aprovadas: acknowledge/release de handoff, bloqueio manual de agenda e curadoria basica de midia;
- usar polling de 10 a 30 segundos, sem WebSocket, SSE ou Supabase Realtime.

## Decisoes fechadas

- `GET /api/escorts/active` e P0 para a tela `/acompanhantes` e para o dashboard.
- `operator-web` precisa de barreira de acesso propria alem da `OPERATOR_API_KEY` usada entre Next.js e FastAPI.
- `/api/schedule/sync` fica oculto enquanto retornar `manual_stub`.
- `/dashboard` entra como primeira tela operacional; `/` redireciona para `/dashboard`.
- O painel nao permite digitacao ou envio manual de mensagem no MVP.
- `/dashboard` deixa de exibir status tecnico bruto e passa a concentrar insights/numeros/filas operacionais.
- `/status` concentra a saude tecnica (health, Evolution, Calendar) com detalhes operacionais.

## Conclusao da pesquisa

A pesquisa sera aproveitada como guia de processo e qualidade, nao como expansao de escopo.

Entram na Fase 3:

- especificacao antes de codar;
- implementacao modular em fatias pequenas e verificaveis;
- design contract enxuto em `apps/operator-web/DESIGN.md`;
- UI operacional densa, legivel, com alto contraste e sem decoracao generica;
- componentes deterministas para tabelas, filtros, badges, estados vazios e erros;
- validacao visual e funcional com Playwright.

Nao entram agora:

- Figma Remote MCP;
- micro-frontends reais;
- orquestracao multiagente formal;
- dashboard analitico pesado;
- motion/efeitos avancados;
- dependencia obrigatoria de MCPs de componentes.

## Arquitetura

Stack proposta:

- Next.js App Router em `apps/operator-web`;
- Server Components para renderizacao inicial;
- Route Handlers em `/api/operator/**` como BFF/proxy server-side;
- cliente backend server-only em `src/server/backend.ts`;
- contratos TypeScript gerados a partir do OpenAPI/schema do backend;
- polling no browser chamando apenas o proprio `operator-web`.

Variaveis:

- `BACKEND_API_URL`: server-only no `operator-web`;
- `OPERATOR_API_KEY`: server-only no `operator-web`;
- nenhuma das duas pode usar prefixo `NEXT_PUBLIC_`.

Fluxo seguro:

1. Browser chama `operator-web`.
2. `operator-web` chama FastAPI server-to-server.
3. `operator-web` injeta `x-operator-api-key` ou `Authorization: Bearer`.
4. Browser nunca recebe a chave nem chama FastAPI diretamente.

## Modulos e pastas

| Modulo | Responsabilidade | Endpoints | Fora do MVP |
| --- | --- | --- | --- |
| `app/(operator)/layout.tsx` | shell, navegacao, regioes comuns | nenhum direto | preferencias por usuario |
| `app/(operator)/dashboard` | insights e filas operacionais | conversations, schedule, media, models | BI/analytics, status tecnico |
| `app/(operator)/conversas` | lista paginada e filtros | `GET /api/conversations` | envio manual |
| `app/(operator)/conversas/[id]` | timeline e estado da conversa | `GET /api/conversations/{id}`, handoff POSTs | edicao de conversa |
| `app/(operator)/handoffs` | fila de handoffs abertos/reconhecidos | conversations filtradas, handoff POSTs | atribuicao multiusuario |
| `app/(operator)/agenda` | slots e bloqueio manual | schedule slots, block | calendario drag/drop |
| `app/(operator)/midias` | catalogo, upload, preview, aprovacao | media list/upload/patch/content | taxonomia rigida |
| `app/(operator)/acompanhantes` | leitura da modelo ativa | `GET /api/escorts/active` | edicao de persona/preco |
| `app/(operator)/status` | saude tecnica minima | status endpoints | status falso de servicos nao integrados |
| `app/api/operator/**` | proxy server-side para FastAPI | todos os endpoints consumidos | regra de negocio nova |
| `src/server` | cliente backend, env, erros | todos | imports em Client Components |
| `src/contracts` | tipos gerados | OpenAPI/schema | contratos manuais soltos |
| `src/features` | UI por dominio | conforme modulo | acoplamento cruzado |
| `src/components` | componentes compartilhados | nenhum direto | design system grande demais |

## Rotas

Rotas finais:

```text
/
/dashboard
/conversas
/conversas/[id]
/handoffs
/agenda
/midias
/acompanhantes
/status
```

`/` redireciona para `/dashboard`.

### `/dashboard`

Objetivo: entregar numeros, filas e pendencias operacionais em um unico lugar, sem virar dashboard analitico pesado.

A tela NAO mostra mais status tecnico bruto (health, Evolution, Calendar). Isso foi movido para `/status`.

Layout:

- bloco de numeros operacionais: total de conversas recentes carregadas, handoffs `OPENED`, handoffs `ACKNOWLEDGED`, slots no periodo proximo;
- atalhos para `/conversas`, `/handoffs`, `/agenda`, `/midias`, `/acompanhantes`, `/status`;
- conversas por estado (`NOVO`, `QUALIFICANDO`, `NEGOCIANDO`, `CONFIRMADO`, `ESCALADO`);
- conversas por tipo de fluxo (`UNDETERMINED`, `INTERNAL`, `EXTERNAL`);
- conversas por handoff;
- agenda resumida: total no periodo, bloqueios, pendentes de sync, com erro de sync;
- midias por aprovacao (`PENDING`, `APPROVED`, `REJECTED`, `REVOKED`);
- pendencias da acompanhante ativa: nome, idiomas, `calendar_external_id`, ao menos 1 servico e ao menos 1 local cadastrado.

Fontes:

- `GET /api/operator/conversations?page_size=100` para amostra base;
- `GET /api/operator/conversations?handoff_status=OPENED&page_size=1` e `ACKNOWLEDGED&page_size=1` para totais via envelope;
- `GET /api/operator/schedule/slots?from=<now>&to=<now+14d>&page_size=100`;
- `GET /api/operator/media?page_size=100`;
- `GET /api/operator/escorts/active`.

Polling:

- dashboard completo: 15s.

Fora do dashboard:

- dashboards analiticos pesados;
- custo por conversa;
- status verde de LangFuse, Whisper, Chatwoot ou agente sem endpoint real.

### `/conversas`

Objetivo: triagem e navegacao para detalhe.

Filtros:

- `status`;
- `handoff_status`;
- `q`;
- pagina e tamanho da pagina.

Campos:

- cliente;
- WhatsApp;
- modelo;
- `state`;
- `flow_type`;
- `handoff_status`;
- `pending_action`;
- `awaiting_input_type`;
- ultima mensagem;
- `last_message_at`.

Polling: 15s.

Acoes:

- abrir detalhe.

Fora:

- responder cliente;
- editar estado.

### `/conversas/[id]`

Objetivo: reconstruir estado operacional de uma conversa.

Layout:

- cabecalho com cliente/modelo/estado;
- timeline de mensagens;
- painel lateral com estado estruturado;
- eventos de handoff;
- ultima execucao do agente;
- midias relacionadas ao modelo.

Campos:

- `ConversationRead`;
- mensagens recentes;
- `handoff_events`;
- `agent_execution`;
- `media`.

Polling:

- 10s quando `handoff_status` for `OPENED` ou `ACKNOWLEDGED`;
- 20s nos demais casos.

Acoes:

- acknowledge se `OPENED`;
- release se `OPENED` ou `ACKNOWLEDGED`.

Confirmacao:

- release exige modal explicito com cliente, estado e ultima mensagem.

Fora:

- textbox;
- templates;
- envio manual.

### `/handoffs`

Objetivo: fila operacional de escaladas humanas.

Layout:

- secao/tab `OPENED`;
- secao/tab `ACKNOWLEDGED`;
- cards/linhas com idade do handoff, cliente, estado anterior quando disponivel e ultima mensagem.

Endpoints:

- `GET /api/conversations?handoff_status=OPENED`;
- `GET /api/conversations?handoff_status=ACKNOWLEDGED`;
- handoff POSTs para acoes.

Polling: 10s.

Acoes:

- acknowledge;
- release com confirmacao.

Erro 409:

- acknowledge: `Este handoff nao esta mais aberto. Atualize a conversa.`;
- release: `A conversa ja foi liberada ou nao esta em handoff.`;
- apos 409, refetch automatico.

### `/agenda`

Objetivo: visualizar cache local de agenda e bloquear horario manualmente.

Layout:

- lista agrupada por dia;
- resumo do periodo;
- badges `PENDING`, `SYNCED`, `ERROR`;
- aviso fixo quando Calendar estiver `LOCAL_CACHE_ONLY`.

Filtros MVP:

- periodo `from/to`;
- `status`.

Filtros P1:

- `source`;
- `calendar_sync_status`;
- `model_id`.

Polling: 30s.

Acoes:

- bloquear slot manual com inicio, fim e motivo.

Erro 409:

- conflito de bloqueio: `Conflita com bloqueio existente.`;
- sem modelo ativa: `Nenhuma modelo ativa configurada.`;

Fora:

- calendario drag/drop;
- prometer disponibilidade real antes da fase de Calendar real;
- mostrar botao de sync enquanto for `manual_stub`.

### `/midias`

Objetivo: curadoria manual do catalogo outbound.

Layout:

- lista/grid por midia;
- preview autenticado;
- filtros;
- painel de metadata/restricoes.

Filtros:

- `model_id`;
- `type`;
- `approval_status`;
- categoria apenas quando a API suportar filtro P1; ate la, filtro client-side na pagina atual se necessario.

Polling: 30s ou refetch apos acao.

Acoes:

- upload;
- aprovar;
- rejeitar;
- revogar;
- editar categoria;
- editar restricoes/metadata minimas.

Preview:

- browser chama `/api/operator/media/{id}/content`;
- Next faz proxy autenticado para `GET /api/media/{id}/content`;
- path interno nunca aparece no browser.

Fora:

- categorias oficiais de negocio;
- analytics de uso;
- migracao para S3/MinIO.

### `/acompanhantes`

Objetivo: leitura da unica modelo ativa e das pendencias humanas.

Endpoint P0:

- `GET /api/escorts/active`.

Campos:

- `id`;
- `display_name`;
- `is_active`;
- `languages`;
- `calendar_external_id`;
- `photo_main_path`;
- `created_at`;
- `updated_at`.

Detalhes adicionais (`GET /api/operator/escorts/{id}`) trazem `services`, `locations`, `preferences` e `availability` como listas tipadas.

Comportamento:

- catalogo (servicos, locais, preferencias, agenda) editavel pelo operador via formulario por aba;
- persona, vocabulario e regras de qualificacao ficam no system prompt definido pela engenharia, fora da UI;
- pendencias geram badges no checklist do dashboard.

Decisoes humanas pendentes:

- precos por duracao;
- adicional de saida;
- servicos nao oferecidos;
- antecedencia minima;
- limite diario;
- idiomas reais;
- Calendar ID real;
- limites de persona/tom.

### `/status`

Objetivo: painel de saude tecnica. Concentra tudo o que o dashboard deixou de mostrar.

Campos:

- backend `status`;
- database `status`, `checked_at`;
- Evolution `status`, `instance`, `qr_code_ref`, `last_event_at`, `updated_at`;
- Calendar `status`, `pending_slots`, `error_slots`, `last_synced_at`, `last_sync_error`, `updated_at`;
- aviso fixo quando Calendar estiver `LOCAL_CACHE_ONLY`;
- bloco explicito informando que LangFuse, Whisper, Chatwoot e o agente nao possuem endpoint dedicado ainda.

Polling: 30s.

Acoes:

- nenhuma no MVP.

Fora:

- afirmar saude de agente, LangFuse, Whisper ou Chatwoot sem endpoint real;
- numeros/insights operacionais (ficam no `/dashboard`).

## Dados por entidade

| Entidade | Onde aparece | API atual cobre? | Lacuna |
| --- | --- | --- | --- |
| `app.clients` | conversas, detalhe, handoffs | parcial | `client_status`, `profile_summary`, `language_hint` |
| `app.escorts` | briefs em varias telas; `/acompanhantes` | parcial | falta `GET /api/escorts/active` |
| `app.conversations` | conversas, detalhe, dashboard, handoffs | parcial | `summary`, `expected_amount`, `urgency_profile`, `awaiting_client_decision`, `last_handoff_at` |
| `app.messages` | detalhe | parcial | `media_id` e metadados de midia por mensagem |
| `app.handoff_events` | detalhe, handoffs | parcial | ultimo motivo/evento na lista |
| `app.schedule_slots` | agenda, dashboard, status | sim para MVP | filtros por source/sync status e metadata reason |
| `app.media_assets` | midias, detalhe, dashboard | sim para MVP | filtro por categoria e model brief |
| `app.integration_status` | status, dashboard | sim para Evolution | status real de outras integracoes |
| `logs.agent_executions` | detalhe | parcial | agregacao geral para status/dashboard |
| `app.receipts` | fora da Fase 3 | nao | endpoint futuro |

## Matriz tela x endpoint x dados x acoes

| Tela | Endpoints | Dados | Acoes |
| --- | --- | --- | --- |
| `/dashboard` | conversations, schedule, media, models | numeros operacionais, filas, pendencias | navegar |
| `/conversas` | `GET /api/conversations` | `ConversationRead` | filtrar, paginar, abrir detalhe |
| `/conversas/[id]` | `GET /api/conversations/{id}`, handoff POSTs | detalhe, mensagens, eventos, midias, execucao | acknowledge, release |
| `/handoffs` | conversations filtradas, handoff POSTs | conversas em handoff | acknowledge, release |
| `/agenda` | slots, block, calendar status | slots e sync status | bloquear |
| `/midias` | media list/upload/patch/content | midias e metadata | upload, aprovar/rejeitar/revogar, preview |
| `/acompanhantes` | `GET /api/escorts/active` | configuracao ativa | nenhuma |
| `/status` | health, evolution, calendar | saude tecnica | nenhuma |

## Gaps de API e read model

### P0 - bloqueia Fase 3 completa

| Gap | Mudanca |
| --- | --- |
| Tela `/acompanhantes` sem fonte real | Criar `EscortRead` e `GET /api/escorts/active` |
| `operator-web` sem barreira de acesso humana | Definir Basic Auth/reverse proxy/VPN ou sessao simples no Next antes de expor |
| Contratos TS sem fonte unica | Gerar tipos TS a partir de OpenAPI/schema |

### P1 - melhora operacao, nao bloqueia MVP

| Gap | Mudanca |
| --- | --- |
| Dashboard faz varias chamadas | Criar `GET /api/dashboard/summary` |
| Conversa/detalhe pobre | Ampliar `ConversationRead/DetailRead` com `summary`, `client_status`, `awaiting_client_decision`, `urgency_profile`, `expected_amount`, `last_handoff_at` |
| Handoff sem lista propria | Criar `GET /api/handoffs` ou aceitar filtro multi-status |
| Agenda filtra pouco | Adicionar `source`, `calendar_sync_status`, `model_id` e `metadata_json.reason` |
| Midia filtra pouco | Adicionar filtro `category` e model brief |
| Mensagem sem midia vinculada | Incluir `media_id` e metadados minimos em `ConversationMessageRead` |
| Erros pouco estruturados | Padronizar `detail.code` para 401/409/422/500 |
| Status sem agente agregado | Expor resumo de `logs.agent_executions` |

### P2 - pos-MVP

- RBAC/Supabase Auth;
- edicao de modelo;
- desfecho formal de atendimento/handoff;
- taxonomia final de midias;
- analytics de uso;
- Calendar real com worker/sync;
- status real de LangFuse, Whisper e Chatwoot;
- WebSocket/SSE/Supabase Realtime;
- CRM;
- multiplas modelos.

## Handoff

Regra operacional:

- `OPENED` e `ACKNOWLEDGED` bloqueiam resposta automatica;
- `RELEASED` devolve a conversa para automacao;
- toda transicao e evento auditavel;
- painel reconhece e libera, mas nao conversa com cliente.

Acoes:

- acknowledge: permitido somente em `OPENED`;
- release: permitido em `OPENED` e `ACKNOWLEDGED`;
- release exige confirmacao visual;
- 409 dispara mensagem clara e refetch.

## Agenda

Decisao de UI:

- lista operacional agrupada por dia;
- nao usar calendario completo no MVP.

Justificativa:

- calendario completo sugere disponibilidade real;
- Calendar ainda pode estar `LOCAL_CACHE_ONLY`;
- a operacao precisa ver bloqueios e erros, nao gerenciar uma agenda rica.

## Midias

Regras:

- midia e catalogo outbound curado;
- upload manual;
- aprovacao antes de uso automatico;
- categorias sao texto livre ate decisao humana;
- preview sempre via backend autenticado;
- nao expor storage path.

## Modelos

Regra:

- uma modelo ativa no MVP;
- tela somente leitura;
- valores pendentes ficam visiveis para orientar decisao humana;
- sem edicao de persona, servicos ou precos na Fase 3.

## Status

Mostrar apenas o que o sistema sabe medir:

- backend;
- database;
- Evolution;
- Calendar local/cache;
- slots pendentes/erro.

Nao mostrar status verde para componentes ainda inexistentes.

## Requisitos para a Fase 5

### A UI so exibe

- `state`;
- `flow_type`;
- `pending_action`;
- `awaiting_input_type`;
- `awaiting_client_decision`;
- `expected_amount`;
- `handoff_status`;
- `summary`;
- mensagens;
- eventos de handoff;
- trace/status/duracao/tools;
- midia, agenda e comprovante quando fases futuras existirem.

### O agente precisa gravar

- mensagens outbound com `role=agent`;
- atualizacoes transacionais de conversa;
- `logs.agent_executions`;
- eventos `handoff_opened` com `reason` e `metadata_json`;
- resumo incremental;
- `trace_id` propagado;
- dados de midia/agenda/comprovante quando existirem.

### O backend precisa expor

- read models enriquecidos de conversa;
- modelo ativa;
- handoffs operacionais;
- status agregado;
- receipts quando a fase correspondente existir.

## Fora da Fase 3

- chat manual;
- envio de mensagem pelo painel;
- WebSocket, SSE ou Supabase Realtime;
- edicao de prompts/persona/precos;
- RBAC completo;
- multiplas modelos;
- Calendar real como garantia;
- taxonomia final de midias;
- CRM;
- desfecho comercial de atendimento;
- analytics;
- LangFuse embed/playground.

## Criterios de aceite

- Todas as rotas carregam com dados vazios.
- Todas as rotas carregam com seed de desenvolvimento.
- Erros 401, 404, 409 e 500 sao tratados com mensagens operacionais claras.
- Nenhum request do browser vai diretamente para FastAPI.
- `OPERATOR_API_KEY` nao aparece no bundle, HTML, Network tab ou console do browser.
- Polling respeita os intervalos definidos.
- Acknowledge e release atualizam a UI e tratam 409.
- Release exige confirmacao.
- Agenda bloqueia slot e mostra conflito.
- Midias permitem upload, preview autenticado e patch de aprovacao.
- `/acompanhantes` exibe a modelo ativa via `GET /api/escorts/active`.
- `/dashboard` mostra numeros e filas operacionais (conversas, handoffs, agenda resumida, midias, pendencias da modelo) e NAO status tecnico bruto.
- `/status` concentra saude tecnica: health, Evolution e Calendar.
- Playwright valida desktop e mobile sem sobreposicao visual relevante.
- Build, typecheck e testes definidos passam.

## Plano de implementacao

1. API P0: adicionar `EscortRead` e `GET /api/escorts/active`.
2. Gerar contratos TypeScript a partir da API.
3. Scaffold Next.js em `apps/operator-web`.
4. Implementar env server-only, BFF e cliente backend.
5. Criar `DESIGN.md` do operator-web.
6. Implementar shell e navegacao.
7. Implementar dashboard.
8. Implementar conversas lista/detalhe.
9. Implementar handoffs.
10. Implementar agenda.
11. Implementar midias.
12. Implementar modelos.
13. Implementar status.
14. Rodar Playwright, typecheck e build.

## Estado de implementacao

Entregue nesta fatia:

- BFF ampliado (`src/server/backend.ts`) com suporte a `GET`, `POST`, `PATCH`, body JSON e multipart/form-data sem vazar `OPERATOR_API_KEY`.
- Rotas `/api/operator/**` cobrindo `status/health`, `status/evolution`, `status/calendar`, `models/active`, `conversations`, `conversations/[id]`, `conversations/[id]/handoff/acknowledge`, `conversations/[id]/handoff/release`, `schedule/slots`, `schedule/slots/block`, `media`, `media/[id]` e `media/[id]/content`.
- Tipos TypeScript locais alinhados aos contratos Pydantic em `src/contracts/index.ts` (geracao a partir do OpenAPI fica como evolucao futura).
- `/dashboard` reescrito como tela de insights/numeros/filas operacionais com atalhos para as demais rotas; nao afirma mais saude tecnica.
- `/status` ampliada para concentrar health, Evolution e Calendar tecnicos, com bloco explicito listando integracoes sem endpoint dedicado.
- `/acompanhantes` exibe a modelo ativa, suas pendencias humanas (`PENDING_DECISION`, idiomas vazios, `calendar_external_id` ausente) e JSONs completos read-only.
- `/conversas` com filtros por estado/handoff/busca e paginacao basica (25/pagina).
- `/conversas/[id]` com timeline, estado estruturado, eventos de handoff, ultima execucao do agente, midias vinculadas e acoes de acknowledge/release com confirmacao e tratamento de 409.
- `/handoffs` com secoes `OPENED` e `ACKNOWLEDGED`, acoes inline e modal de confirmacao para release.
- `/agenda` com lista agrupada por dia, badges de sync e bloqueio manual com tratamento de conflito 409.
- `/midias` com upload multipart, preview autenticado via BFF, patch de `approval_status` e `category` inline.
- Smoke test expandido cobrindo insights do dashboard e chamadas BFF do `/status`.

Fora desta fatia (consistente com o escopo da Fase 3):

- chat manual, composer ou templates;
- edicao de persona, servicos ou precos da modelo;
- RBAC e multiplos usuarios;
- dashboard de custo por conversa;
- status real de LangFuse, Whisper, Chatwoot ou agente;
- WebSocket/SSE/Supabase Realtime;
- botao de `POST /api/schedule/sync` enquanto retorna `manual_stub`.

## Verificacao

Verificacao automatizada:

- Playwright para navegacao principal, filtros, acoes criticas, empty states e erros;
- teste de seguranca para garantir que chamadas do browser usam apenas `/api/operator/**`;
- teste/unitario do cliente backend para headers, query params e mapeamento de erro;
- typecheck para contratos gerados;
- build de producao.

Verificacao visual:

- desktop;
- mobile;
- dados longos;
- estados vazios;
- erros;
- modal de release;
- upload/preview de midia.

