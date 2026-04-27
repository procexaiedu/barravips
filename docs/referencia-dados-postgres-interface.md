# Referencia de Dados do Postgres para a Interface

## Objetivo

Este documento descreve quais dados do Postgres podem ser usados na interface operacional atual, de onde eles vem, como ja aparecem nos read models e quais cuidados os agentes precisam ter ao exibi-los.

O foco aqui nao e documentar o banco inteiro de forma academica. O foco e acelerar trabalho de interface com um material pratico, objetivo e seguro.

## Escopo analisado

Levantamento feito a partir de:

- `db/migrations/001_init_schemas.sql`
- `db/migrations/002_init_app_tables.sql`
- `docs/contexto/05-estado-memoria-e-modelo-de-dados.md`
- `docs/contexto/08-interface-operacional-e-api.md`
- `packages/contracts/src/barra_vips_contracts/v1/read_models.py`
- `packages/contracts/src/barra_vips_contracts/v1/handoff.py`
- `apps/api/src/barra_vips_api/main.py`
- `apps/operator-web/src/contracts/index.ts`
- telas atuais em `apps/operator-web/src/features/*`

## Premissas importantes

- A interface nao deve ler Postgres direto. O consumo correto e por read models/endpoints do backend.
- Nem todo campo persistido deve ser exibido.
- Alguns campos existem no schema, mas nao possuem fluxo de escrita claro na implementacao atual.
- Onde houver texto livre, JSON flexivel ou dado tecnico, a exibicao exige contexto adicional.

## Regras rapidas para agentes de interface

Use estas etiquetas ao decidir se um dado entra na UI:

- `Pronto para UI`: pode aparecer em cards, tabelas, filtros ou detalhes com baixo risco.
- `UI com contexto`: pode aparecer, mas precisa de label boa, agrupamento correto ou fallback visual.
- `So suporte/operacao`: util para diagnostico interno, nao para destaque primario.
- `Nao exibir`: campo tecnico, sensivel ou inutil para a operacao do painel.

## Estado atual dos fluxos que alimentam o banco

| Dominio | Tabelas | Situacao observada | Origem do dado |
| --- | --- | --- | --- |
| Conversas WhatsApp | `app.clients`, `app.conversations`, `app.messages`, `app.raw_webhook_events` | Fluxo ativo | Webhook da Evolution em `POST /webhooks/evolution` |
| Status da Evolution | `app.integration_status` | Fluxo ativo | Evento `connection.update` da Evolution |
| Acompanhantes | `app.escorts` + filhas (`escort_services`, `escort_locations`) | Fluxo ativo | API operacional `/api/escorts` |
| Midias curadas | `app.media_assets` | Fluxo ativo | Upload operacional `/api/media` |
| Agenda local | `app.schedule_slots` | Fluxo ativo | Bloqueio manual `/api/schedule/slots/block` |
| Handoffs | `app.handoff_events` + update em `app.conversations` | Fluxo ativo | Acknowledge/release na API operacional; abertura prevista no fluxo do agente |
| Comprovantes | `app.receipts` | Modelado e lido, sem writer claro no codigo analisado fora de testes | Hoje depende de fluxo ainda nao visto nesta codebase |
| Execucoes do agente | `logs.agent_executions` | Modelado e lido, sem writer claro no codigo analisado fora de testes | Hoje depende de integracao/servico ainda nao visto nesta codebase |

## Dados base por dominio

### 1. Clientes (`app.clients`)

| Campo | O que representa | Origem | Como usar na interface | Cuidado |
| --- | --- | --- | --- | --- |
| `id` | Identificador interno do cliente | `app.clients.id`; join com `app.conversations.client_id` e `app.messages.client_id` | Drilldown, chaves React, correlacao interna | `So suporte/operacao`; nao precisa aparecer visualmente |
| `whatsapp_jid` | Identificador do WhatsApp do cliente | `app.clients`; recebido do webhook | Lista de conversas, detalhe, busca, identificacao secundaria | `UI com contexto`; preferir mascarar em listas densas se a tela ficar poluida |
| `display_name` | Nome enviado pelo canal ou definido no sistema | `app.clients`; webhook e upsert | Titulo de cards, listas, cabecalho do detalhe | `Pronto para UI`; sempre ter fallback para `whatsapp_jid` |
| `language_hint` | Idioma sugerido para o atendimento | `app.clients` | Badge, filtro futuro, detalhe de conversa | `UI com contexto`; pode estar vazio ou desatualizado |
| `client_status` | Classificacao operacional do cliente (`NEW`, `RETURNING`, `VIP`, `BLOCKED`) | `app.clients` | Badge, filtro, prioridade visual | `Pronto para UI`; exibir com legenda humana |
| `profile_summary` | Resumo operacional curto do cliente | `app.clients` | Bloco de contexto no detalhe da conversa | `UI com contexto`; texto livre e resumido, nao usar como fato rigido |
| `preferences_json` | Preferencias estruturadas do cliente | `app.clients` | Possivel futura tela de preferencias ou chips resumidos | `UI com contexto`; nao expor JSON bruto |
| `risk_notes` | Observacoes operacionais sensiveis | `app.clients` | Apenas suporte ou revisao manual muito restrita | `So suporte/operacao`; evitar em telas gerais |
| `created_at` | Quando o cliente foi criado no sistema | `app.clients` | Ordenacao secundaria, auditoria, suporte | `So suporte/operacao` |
| `updated_at` | Ultima atualizacao do cadastro | `app.clients` | Auditoria, suporte | `So suporte/operacao` |

### 2. Acompanhantes (`app.escorts` + filhas)

A engenharia controla persona, vocabulario e regras de qualificacao no system prompt. O operador edita apenas catalogo (servicos, locais, preferencias, agenda).

`app.escorts`:

| Campo | O que representa | Origem | Como usar na interface | Cuidado |
| --- | --- | --- | --- | --- |
| `id` | Identificador interno da acompanhante | `app.escorts.id` | Seletores, chaves, relacoes com agenda e midia | `So suporte/operacao` |
| `display_name` | Nome de exibicao | `app.escorts` | Cabecalhos, selects, tabelas, detalhe | `Pronto para UI` |
| `is_active` | Indica qual acompanhante esta ativa na operacao | `app.escorts` | Badge "ativa/inativa", alertas, filtros | `Pronto para UI`; ha invariante de uma unica ativa |
| `languages` | Idiomas atendidos | `app.escorts` | Chips, filtros, detalhe | `Pronto para UI` |
| `calendar_external_id` | Identificador do Google Calendar vinculado | `app.escorts` | Status/configuracao da agenda | `UI com contexto`; campo operacional |
| `photo_main_path` | Caminho/URL da foto principal | `app.escorts` | Cabecalho da tela, miniaturas | `UI com contexto`; opcional |
| `min_duration_minutes`, `advance_booking_minutes`, `max_bookings_per_day` | Regras de booking (duracao minima, antecedencia, teto diario) | `app.escorts` | Form de disponibilidade no detalhe | `UI com contexto`; nullable, exibir vazio quando `null` |
| `preferences_json` | Preferencias/restricoes objetivas em chave/valor (jsonb) | `app.escorts` | Editor chave/valor no detalhe | `UI com contexto`; nao expor JSON bruto |
| `created_at` / `updated_at` | Auditoria | `app.escorts` | Auditoria, tabela administrativa | `So suporte/operacao` |

Tabelas filhas (todas com FK `escort_id`):

- `app.escort_services`: `name`, `description`, `duration_minutes`, `price_cents`, `restrictions`, `sort_order`. Catalogo de servicos vendidos.
- `app.escort_locations`: `city`, `neighborhood`, `accepts_displacement`, `displacement_fee_cents`, `sort_order`. Cidades atendidas e taxa de deslocamento.

Endpoints:

- `GET /api/escorts`, `POST /api/escorts`, `GET /api/escorts/active`.
- `GET /api/escorts/{id}` retorna `EscortDetailRead` com listas tipadas das filhas.
- `PATCH /api/escorts/{id}` atualiza campos da escort, incluindo regras de booking e `preferences_json`.
- `PUT /api/escorts/{id}/{services|locations}` substitui o conjunto.

### 3. Conversas (`app.conversations`)

| Campo | O que representa | Origem | Como usar na interface | Cuidado |
| --- | --- | --- | --- | --- |
| `id` | `conversation_id` canonico da operacao | `app.conversations.id` | URL de detalhe, links, filas, joins com mensagens e handoffs | `Pronto para UI` como chave e drilldown; nao precisa ser destaque textual |
| `client_id` | Cliente dono da conversa | `app.conversations.client_id` | Relacionamento | `Nao exibir`; usar join com cliente |
| `model_id` | Acompanhante vinculada (coluna FK legada) | `app.conversations.model_id` | Relacionamento | `Nao exibir`; usar join com acompanhante |
| `state` | Estado operacional (`NOVO`, `QUALIFICANDO`, `NEGOCIANDO`, `CONFIRMADO`, `ESCALADO`) | `app.conversations` | Badge principal, filtros, cards, colunas de tabela | `Pronto para UI` |
| `state_before_escalation` | Estado anterior ao handoff | `app.conversations` | Auditoria de release ou suporte | `So suporte/operacao`; nao e estado atual |
| `flow_type` | Tipo do atendimento (`INTERNAL`, `EXTERNAL`, `UNDETERMINED`) | `app.conversations` | Badge, filtros, separacao de fluxos | `Pronto para UI` |
| `summary` | Resumo incremental da conversa | `app.conversations` | Preview, detalhe, contexto rapido | `UI com contexto`; texto gerado/curado, nao substitui o historico |
| `last_summarized_message_id` | Cursor tecnico do summarizer | `app.conversations` | Nenhum uso de UX | `Nao exibir` |
| `pending_action` | Proximo passo operacional esperado da IA | `app.conversations` | Chips, cards de pendencia, coluna secundaria | `Pronto para UI` |
| `awaiting_input_type` | Qual entrada a IA espera do cliente | `app.conversations` | Fila, badges, detalhe, cards de atencao | `Pronto para UI` |
| `awaiting_client_decision` | Se a conversa aguarda aceite/recusa do cliente | `app.conversations` | Filtros, badges, fila de prioridade | `Pronto para UI` |
| `urgency_profile` | Perfil de urgencia (`IMMEDIATE`, `SCHEDULED`, etc.) | `app.conversations` | Badge, priorizacao visual, filtros futuros | `Pronto para UI` |
| `expected_amount` | Valor esperado para comprovante ou fechamento | `app.conversations` | Badge de valor, detalhe, revisao financeira | `UI com contexto`; valor monetario deve ser formatado |
| `handoff_status` | Quem esta atendendo (`NONE`, `OPENED`, `ACKNOWLEDGED`, `RELEASED`) | `app.conversations` | Badge forte, filtros, fila, tela de handoffs | `Pronto para UI` |
| `last_handoff_at` | Timestamp do ultimo handoff | `app.conversations` | Tempo de espera, SLA, ordenacao | `Pronto para UI` |
| `last_message_at` | Ultima atividade da conversa | `app.conversations` | Ordenacao, cards, fila, "atualizada ha X" | `Pronto para UI` |
| `created_at` | Criacao da conversa | `app.conversations` | Metricas de "novas hoje", auditoria | `Pronto para UI` em dashboards e suporte |
| `updated_at` | Ultima alteracao na linha da conversa | `app.conversations` | Suporte/auditoria | `So suporte/operacao` |

### 4. Mensagens (`app.messages`)

| Campo | O que representa | Origem | Como usar na interface | Cuidado |
| --- | --- | --- | --- | --- |
| `id` | Identificador da mensagem | `app.messages.id` | Chave de timeline, correlacao com comprovantes | `So suporte/operacao` |
| `conversation_id` | Conversa da mensagem | `app.messages.conversation_id` | Relacionamento | `Nao exibir` |
| `client_id` | Cliente da mensagem | `app.messages.client_id` | Relacionamento | `Nao exibir` |
| `external_message_id` | ID do provedor | `app.messages.external_message_id` | Debug, suporte, idempotencia | `So suporte/operacao` |
| `direction` | `INBOUND` ou `OUTBOUND` | `app.messages` | Bolha visual, labels, filtros | `Pronto para UI` |
| `role` | `client`, `agent` ou `human` | `app.messages` | Distinguir cliente, IA e humano | `Pronto para UI` |
| `message_type` | Tipo da mensagem (`text`, `image`, `audio`, etc.) | `app.messages` | Icones, chips, filtros, timeline | `Pronto para UI` |
| `content_text` | Conteudo textual da mensagem | `app.messages` | Timeline, preview, busca | `UI com contexto`; pode estar vazio em midias |
| `media_id` | Midia outbound relacionada | `app.messages.media_id` | Audit trail de uso de midia | `So suporte/operacao`; na UI preferir exibir a midia derivada |
| `delivery_status` | Status de envio no WhatsApp | `app.messages`; so outbound | Chips de entrega, falhas, metricas de envio | `Pronto para UI` em detalhe e status de envio |
| `from_me` | Marca se veio do proprio numero operacional | `app.messages` | Diferenciar humano/modelo do cliente | `UI com contexto`; usar junto com `direction` e `role` |
| `trace_id` | Correlacao tecnica da execucao | `app.messages` | Suporte tecnico, investigacao | `So suporte/operacao` |
| `raw_event_id` | Ponte para o webhook bruto | `app.messages` | Diagnostico tecnico | `Nao exibir` |
| `provider_message_at` | Timestamp original do provedor | `app.messages` | Ordenacao precisa e analytics | `So suporte/operacao`; a UI pode usar o resultado derivado |
| `created_at` | Timestamp de persistencia local | `app.messages` | Timeline e ordenacao fallback | `Pronto para UI` |

### 5. Handoff (`app.handoff_events`)

| Campo | O que representa | Origem | Como usar na interface | Cuidado |
| --- | --- | --- | --- | --- |
| `id` | Identificador do evento | `app.handoff_events.id` | Chave de timeline | `So suporte/operacao` |
| `conversation_id` | Conversa do handoff | `app.handoff_events.conversation_id` | Relacionamento | `Nao exibir` |
| `event_type` | Abertura, reconhecimento ou liberacao | `app.handoff_events` | Timeline, historico, tabelas de eventos | `Pronto para UI` |
| `previous_handoff_status` | Status anterior do handoff | `app.handoff_events` | Auditoria e explicacao do evento | `UI com contexto` |
| `source` | Quem gerou o evento (`agent`, `operator_ui`, etc.) | `app.handoff_events` | Detalhe tecnico, filtros internos | `Pronto para UI` em suporte e historico |
| `actor_label` | Nome/rotulo de quem executou | `app.handoff_events` | Historico do detalhe | `Pronto para UI` |
| `reason` | Motivo do handoff | `app.handoff_events` | Cards, resumo semanal, tabela de motivos | `Pronto para UI`; tratar vazio como "sem motivo" |
| `metadata_json` | Metadados do evento | `app.handoff_events` | Pode alimentar flags operacionais futuras | `UI com contexto`; nao mostrar JSON bruto |
| `trace_id` | Correlacao tecnica | `app.handoff_events` | Suporte | `So suporte/operacao` |
| `created_at` | Quando o evento aconteceu | `app.handoff_events` | Timeline, duracao, SLA | `Pronto para UI` |

### 6. Agenda (`app.schedule_slots`)

| Campo | O que representa | Origem | Como usar na interface | Cuidado |
| --- | --- | --- | --- | --- |
| `id` | Identificador do slot | `app.schedule_slots.id` | Chaves, edicao futura, correlacao | `So suporte/operacao` |
| `model_id` | Acompanhante dona do slot (coluna FK legada) | `app.schedule_slots.model_id` | Filtro e relacionamento | `UI com contexto`; hoje ha uma acompanhante ativa no MVP |
| `starts_at` | Inicio do slot | `app.schedule_slots` | Agenda, timeline, cards, filtros de periodo | `Pronto para UI` |
| `ends_at` | Fim do slot | `app.schedule_slots` | Agenda, timeline, cards | `Pronto para UI` |
| `status` | Estado do slot (`AVAILABLE`, `BLOCKED`, `HELD`, `CONFIRMED`, `CANCELLED`) | `app.schedule_slots` | Cor do slot, legenda, filtros, contadores | `Pronto para UI` |
| `source` | Origem (`CALENDAR_SYNC`, `MANUAL`, `AUTO_BLOCK`) | `app.schedule_slots` | Coluna "origem", filtros, auditoria | `Pronto para UI` |
| `external_event_id` | ID do evento externo no Calendar | `app.schedule_slots` | Coluna tecnica, suporte de sync | `So suporte/operacao` |
| `sync_token_ref` | Token tecnico de sincronizacao | `app.schedule_slots` | Nenhum valor de UX | `Nao exibir` |
| `calendar_sync_status` | `PENDING`, `SYNCED` ou `ERROR` | `app.schedule_slots` | Badge de sync, filtros, alertas | `Pronto para UI` |
| `last_synced_at` | Ultima sincronizacao do slot | `app.schedule_slots` | Tooltip, detalhe, suporte | `UI com contexto` |
| `last_sync_error` | Ultimo erro de sincronizacao | `app.schedule_slots` | Tooltip, alerta, tela de status | `UI com contexto`; pode ser tecnico e ruidoso |
| `metadata_json` | Metadados do slot | `app.schedule_slots`; no bloqueio manual recebe `reason` | Possivel detalhe de agenda e auditoria | `UI com contexto`; nao expor JSON bruto |

Observacao:

- O bloqueio manual atual grava `metadata_json.reason`. Esse dado e util para uma futura coluna "motivo do bloqueio", mas o read model atual de agenda ainda nao expoe esse campo.

### 7. Midias curadas (`app.media_assets`)

| Campo | O que representa | Origem | Como usar na interface | Cuidado |
| --- | --- | --- | --- | --- |
| `id` | Identificador da midia | `app.media_assets.id` | Preview URL, card, auditoria | `Pronto para UI` como chave e drilldown |
| `model_id` | Acompanhante associada (coluna FK legada) | `app.media_assets.model_id` | Filtro por acompanhante, agrupamento | `UI com contexto` |
| `media_type` | Tipo (`image`, `audio`, `video`, `document`) | `app.media_assets` | Icones, filtros, cards, preview | `Pronto para UI` |
| `category` | Categoria curada da midia | `app.media_assets` | Filtros, agrupamentos, chips | `Pronto para UI`; tratar vazio como "sem categoria" |
| `storage_path` | Caminho interno no volume local | `app.media_assets` | Nenhum uso visual | `Nao exibir` |
| `approval_status` | `PENDING`, `APPROVED`, `REJECTED`, `REVOKED` | `app.media_assets` | Badge, filtros, fila de aprovacao | `Pronto para UI` |
| `send_constraints_json` | Restricoes de envio | `app.media_assets` | Configuracao, labels futuras, regras de uso | `UI com contexto`; nao exibir JSON cru |
| `metadata_json` | Metadados tecnicos, ex. MIME detectado | `app.media_assets` | Suporte e preview especializado | `UI com contexto`; criar whitelist antes de mostrar |
| `created_at` | Upload/persistencia inicial | `app.media_assets` | Ordenacao, timeline | `Pronto para UI` |
| `updated_at` | Ultima alteracao da midia | `app.media_assets` | Cards, auditoria, tabela | `Pronto para UI` |

### 8. Comprovantes (`app.receipts`)

| Campo | O que representa | Origem | Como usar na interface | Cuidado |
| --- | --- | --- | --- | --- |
| `id` | Identificador do comprovante | `app.receipts.id` | Chave e auditoria | `So suporte/operacao` |
| `conversation_id` | Conversa relacionada | `app.receipts.conversation_id` | Drilldown para detalhe | `Pronto para UI` como link, nao como destaque textual |
| `client_id` | Cliente relacionado | `app.receipts.client_id` | Relacionamento | `Nao exibir` |
| `message_id` | Mensagem inbound que originou o comprovante | `app.receipts.message_id` | Vinculo com timeline | `So suporte/operacao` |
| `storage_path` | Caminho do arquivo de comprovante | `app.receipts` | Nenhum uso visual direto | `Nao exibir` |
| `detected_amount` | Valor detectado na analise | `app.receipts` | Tabela de revisao, detalhe financeiro | `Pronto para UI` |
| `expected_amount` | Valor esperado para validacao | `app.receipts` | Comparacao, alerta, detalhe | `Pronto para UI` |
| `analysis_status` | Resultado da analise | `app.receipts` | Badge, filtros, fila de revisao | `Pronto para UI` |
| `tolerance_applied` | Tolerancia considerada na analise | `app.receipts` | Coluna de suporte ou detalhe | `UI com contexto` |
| `needs_review` | Marca se exige revisao humana | `app.receipts` | Filtro, alerta, cards de atencao | `Pronto para UI` |
| `metadata_json` | Metadados adicionais da analise | `app.receipts` | Suporte, explicacao futura | `UI com contexto`; nao expor JSON bruto |
| `created_at` | Criacao do registro | `app.receipts` | Ordenacao, fila, auditoria | `Pronto para UI` |
| `updated_at` | Ultima atualizacao da analise | `app.receipts` | Auditoria, tabela | `Pronto para UI` |

Observacao:

- O endpoint e o contrato existem, mas nao foi encontrado writer de runtime em `apps/api` para popular `app.receipts` fora de testes. Para a interface isso significa: tratar a tela como valida, mas assumir que a massa real pode estar vazia ate o fluxo ser ligado.

### 9. Integracoes (`app.integration_status`)

| Campo | O que representa | Origem | Como usar na interface | Cuidado |
| --- | --- | --- | --- | --- |
| `id` | Identificador do registro | `app.integration_status.id` | Nenhum uso visual | `Nao exibir` |
| `provider` | Provedor da integracao | `app.integration_status.provider` | Bloco de status | `Pronto para UI` |
| `instance` | Instancia/nome monitorado | `app.integration_status.instance` | Linha de status, detalhe | `Pronto para UI` |
| `status` | Estado da integracao (`CONNECTED`, `DISCONNECTED`, etc.) | `app.integration_status` | Badge, cards de saude | `Pronto para UI` |
| `qr_code_ref` | Referencia de QR pendente | `app.integration_status` | Suporte operacional | `UI com contexto`; nao exibir se houver risco de expor segredo ou conteudo sensivel |
| `last_event_at` | Ultimo evento recebido | `app.integration_status` | Status temporal, auditoria | `Pronto para UI` |
| `metadata_json` | Metadados tecnicos do ultimo evento | `app.integration_status` | Suporte tecnico | `So suporte/operacao` |
| `updated_at` | Ultima atualizacao do registro | `app.integration_status` | Bloco de status | `Pronto para UI` |

### 10. Execucoes do agente (`logs.agent_executions`)

| Campo | O que representa | Origem | Como usar na interface | Cuidado |
| --- | --- | --- | --- | --- |
| `id` | Identificador da execucao | `logs.agent_executions.id` | Chave e suporte | `So suporte/operacao` |
| `conversation_id` | Conversa relacionada | `logs.agent_executions.conversation_id` | Link para detalhe | `Pronto para UI` como drilldown |
| `trace_id` | Correlacao tecnica da execucao | `logs.agent_executions.trace_id` | Suporte tecnico, diagnostico | `So suporte/operacao` |
| `status` | Resultado (`SUCCESS`, `PARTIAL`, `FAILED`, `SKIPPED`) | `logs.agent_executions` | Badges, contadores, lista de falhas | `Pronto para UI` |
| `duration_ms` | Duracao da execucao | `logs.agent_executions` | KPI, tabela de falhas, detalhe | `Pronto para UI` |
| `tool_count` | Quantidade de tools usadas | `logs.agent_executions` | KPI e detalhe tecnico | `UI com contexto` |
| `retry_count` | Numero de tentativas | `logs.agent_executions` | Diagnostico | `UI com contexto` |
| `fallback_used` | Se usou plano B | `logs.agent_executions` | KPI e alerta de confiabilidade | `Pronto para UI` |
| `input_message_ids` | Mensagens de entrada da execucao | `logs.agent_executions` | Diagnostico | `So suporte/operacao` |
| `output_message_id` | Mensagem gerada pela execucao | `logs.agent_executions` | Diagnostico | `So suporte/operacao` |
| `error_summary` | Resumo do erro | `logs.agent_executions` | Tabela de falhas, suporte | `Pronto para UI` em tela tecnica |
| `created_at` | Quando a execucao ocorreu | `logs.agent_executions` | Timeline, lista de falhas | `Pronto para UI` |

Observacao:

- O endpoint de status do agente usa essa tabela, mas nao foi encontrado writer claro em `apps/api` fora de testes. A interface deve aceitar ausencia de dados sem quebrar.

### 11. Webhooks brutos (`app.raw_webhook_events`)

Esses dados existem no banco, mas nao devem virar UI operacional normal.

Campos relevantes:

- `provider`
- `event_name`
- `instance`
- `external_event_id`
- `external_message_id`
- `remote_jid`
- `trace_id`
- `payload_sanitized_json`
- `processing_status`
- `error_code`
- `error_message`
- `received_at`
- `processed_at`

Uso recomendado:

- debug interno
- auditoria de integracao
- investigacao de webhook quebrado

Classificacao:

- `So suporte/operacao` para os campos simples
- `Nao exibir` para `payload_sanitized_json` em UI comum

## Read models e metricas derivadas ja prontas para a interface

Esta secao e a mais importante para agentes de UI. Ela mostra o que ja chega pronto dos endpoints usados pelo `operator-web`.

### 1. Lista de conversas (`GET /api/conversations`)

Read model: `ConversationRead`

| Campo derivado | Origem real | Uso recomendado |
| --- | --- | --- |
| `client.id`, `client.display_name`, `client.whatsapp_jid`, `client.client_status`, `client.profile_summary`, `client.language_hint` | Join `app.conversations -> app.clients` | Tabela principal, badges, busca e contexto |
| `escort.id`, `escort.display_name` | Join `app.conversations -> app.escorts` | Coluna da acompanhante |
| `state`, `flow_type`, `handoff_status`, `pending_action`, `awaiting_input_type`, `awaiting_client_decision`, `urgency_profile`, `expected_amount`, `summary`, `last_handoff_at`, `last_message_at` | `app.conversations` | Filtros, badges, cards e filas |
| `last_message.direction`, `last_message.message_type`, `last_message.content_preview`, `last_message.created_at`, `last_message.delivery_status` | Lateral join com a ultima linha de `app.messages` por conversa; preview = `left(content_text, 240)` | Preview da lista, chips de tipo, indicador de entrega |

Cuidados:

- `content_preview` pode ser `null` para midia sem texto.
- A lista usa a ultima mensagem da conversa, nao o ultimo resumo.
- O campo de busca atual filtra cliente e trecho da ultima mensagem/resumo; nao assumir busca full-text completa.

### 2. Detalhe da conversa (`GET /api/conversations/{conversation_id}`)

Read model: `ConversationDetailRead`

Blocos entregues:

- `conversation`: mesmo contrato da lista com mais contexto visivel
- `messages`: ultimas 50 mensagens ordenadas por tempo do provedor/fallback local
- `handoff_events`: historico completo da conversa ordenado por `created_at DESC`
- `media`: lista de `app.media_assets` da modelo da conversa
- `agent_execution`: ultima linha de `logs.agent_executions` da conversa

Observacoes praticas:

- O bloco `media` do detalhe nao e "midia usada na conversa"; e o catalogo da modelo vinculada.
- `messages.trace_id` e `agent_execution.trace_id` sao dados de suporte, nao de UX primaria.
- A timeline usa `created_at` no read model, mas a selecao SQL respeita `provider_message_at` quando existe.

### 3. Dashboard principal (`GET /api/dashboard/summary`)

Read model: `DashboardSummaryRead`

| Metrica | Origem | Como usar |
| --- | --- | --- |
| `total_conversations` | `count(*)` em `app.conversations` | KPI geral |
| `active_conversations` | `app.conversations.last_message_at` nas ultimas 24h | Card de atividade |
| `new_conversations_today` | `app.conversations.created_at` no dia atual | Card de entrada nova |
| `conversations_by_state` | `count by state` em `app.conversations` | Barras, donuts, tabelas |
| `conversations_by_flow_type` | `count by flow_type` em `app.conversations` | Painel de fluxo |
| `conversations_by_handoff_status` | `count by handoff_status` em `app.conversations` | Painel de atendimento humano/IA |
| `handoffs_opened` | Contagem de `handoff_status = OPENED` | Card de urgencia |
| `handoffs_acknowledged` | Contagem de `handoff_status = ACKNOWLEDGED` | Card de acompanhamento |
| `media_pending` | `app.media_assets.approval_status = PENDING` | Card de aprovacao de midia |
| `media_without_category` | `app.media_assets.category` vazio/nulo | Higiene de catalogo |
| `schedule_slots_next_14d_total` | Slots com `starts_at` nos proximos 14 dias | Card de agenda |
| `schedule_slots_next_14d_by_status` | `count by status` em `app.schedule_slots` na janela | Tabela/resumo da agenda |
| `calendar_sync_pending` | `app.schedule_slots.calendar_sync_status = PENDING` | Alerta de sync |
| `calendar_sync_error` | `app.schedule_slots.calendar_sync_status = ERROR` | Alerta de erro |

### 4. Fila de prioridade (`GET /api/dashboard/queues`)

Read model: `ConversationQueueItemRead`

Filas derivadas atuais:

- `OPEN_HANDOFF`
- `ACKNOWLEDGED_HANDOFF`
- `CLIENT_WAITING_RESPONSE`
- `STALE_CONVERSATION`
- `UNDETERMINED_AGED`
- `NEGOTIATING_AWAITING_INPUT`
- `AWAITING_CLIENT_DECISION`
- `EXTERNAL_OPEN_HANDOFF`

Origem real:

- `app.conversations`
- `app.clients`
- agregacoes laterais em `app.messages` para ultimo inbound/outbound
- `app.handoff_events` para ultima abertura/reconhecimento

Campos principais:

| Campo | O que significa | Uso |
| --- | --- | --- |
| `queue_key`, `queue_label`, `queue_priority` | Tipo da fila e prioridade numerica | Ordenacao, tabs, chips |
| `conversation_id`, `drilldown_href` | Ponte para a conversa | CTA principal |
| `client_display_name`, `client_identifier` | Nome ou JID do cliente | Texto principal |
| `state`, `flow_type`, `handoff_status` | Estado atual da conversa | Contexto rapido |
| `relevant_at`, `age_seconds`, `age_source` | Momento-base e idade calculada | SLA, destaque temporal |
| `reason` | Explicacao textual da entrada na fila | Subtitulo do card |
| `source`, `window`, `sample_size` | Origem tecnica da regra e contexto da amostra | Suporte e debug de read model |

### 5. Resumo de handoffs (`GET /api/handoffs/summary`)

Read model: `HandoffSummaryRead`

| Campo | Origem | Uso |
| --- | --- | --- |
| `current_by_status` | `count by handoff_status` em `app.conversations` | Cards "abertos/agora/released" |
| `open_age_buckets` | Ultimo `handoff_opened` por conversa em aberto + bucket por idade | Tabela de SLA |
| `reasons` | `app.handoff_events.reason` para `handoff_opened` na janela de 7 dias | Ranking de motivos |
| `time_to_acknowledge` | Duracao entre `handoff_opened` e `handoff_acknowledged` | KPI semanal |
| `time_to_release` | Duracao entre `handoff_opened` e `handoff_released` | KPI semanal |

### 6. Agenda (`GET /api/schedule/slots`)

Read model: `ScheduleSlotRead`

Campos entregues:

- `id`
- `model_id`
- `starts_at`
- `ends_at`
- `status`
- `source`
- `external_event_id`
- `calendar_sync_status`
- `last_synced_at`
- `last_sync_error`

Faltas conhecidas para UX:

- o endpoint atual nao expoe `metadata_json.reason`, entao a tela de agenda ainda nao consegue mostrar o motivo do bloqueio manual;
- nao ha read model de agrupamento por modelo porque o MVP assume uma modelo ativa.

### 7. Catalogo de midias (`GET /api/media`)

Read model: `MediaRead`

Campos entregues:

- `id`
- `model_id`
- `media_type`
- `category`
- `approval_status`
- `send_constraints_json`
- `metadata_json`
- `created_at`
- `updated_at`

Uso:

- grid de galeria
- filtros por tipo e aprovacao
- cards com preview
- controles de aprovacao/revogacao
- classificacao por categoria

Cuidados:

- o conteudo binario vem de outro endpoint (`/api/media/{id}/content`), nunca de `storage_path`;
- `send_constraints_json` e `metadata_json` precisam de whitelisting antes de virar UI humana.

### 8. Resumo de uso de midias (`GET /api/media/usage-summary`)

Read model: `MediaUsageSummaryRead`

| Campo | Origem | Uso |
| --- | --- | --- |
| `pending` | `app.media_assets.approval_status = PENDING` | Card de aprovacao |
| `without_category` | `category` nula/vazia em `app.media_assets` | Card de higiene |
| `approved_by_category` | `APPROVED` agrupado por categoria em `app.media_assets` | Tabela de distribuicao |
| `most_used` | Join `app.messages.media_id -> app.media_assets` na janela de 7 dias | Ranking de midias mais enviadas |
| `send_failures` | Mesmo join, filtrando `app.messages.delivery_status = FAILED` | Ranking de falhas |
| `delivery_status_available` | Verifica se existe `delivery_status` suficiente nas mensagens com midia | Feature flag para exibir ou esconder falhas |

### 9. Comprovantes (`GET /api/receipts`)

Read model: `ReceiptRead`

Campos entregues:

- `id`
- `conversation_id`
- `client`
- `model`
- `message_id`
- `detected_amount`
- `expected_amount`
- `analysis_status`
- `tolerance_applied`
- `needs_review`
- `metadata_json`
- `drilldown_href`
- `created_at`
- `updated_at`

Uso:

- fila de revisao
- card de atencao no dashboard
- tabela financeira
- link direto para a conversa

### 10. Status (`GET /api/status/*`)

| Endpoint | Campo principal | Origem | Uso |
| --- | --- | --- | --- |
| `/status/health` | `status`, `database`, `checked_at` | consulta simples ao banco | saude basica |
| `/status/evolution` | `provider`, `instance`, `status`, `qr_code_ref`, `last_event_at`, `updated_at` | ultima linha de `app.integration_status` para `provider = evolution` | painel do WhatsApp |
| `/status/calendar` | `pending_slots`, `error_slots`, `last_synced_at`, `last_sync_error`, `status = LOCAL_CACHE_ONLY` | agregacao em `app.schedule_slots` | painel da agenda/sync |
| `/status/agent` | `total_executions`, `executions_by_status`, `failed_or_partial`, `duration`, `fallback_used`, `tool_failures`, `latest_failures` | agregacoes em `logs.agent_executions` na ultima janela de 24h | painel tecnico da IA |

## Dados que nao devem ser exibidos diretamente

Evitar expor estes campos em UI operacional comum:

- `app.media_assets.storage_path`
- `app.receipts.storage_path`
- `app.schedule_slots.sync_token_ref`
- `app.conversations.last_summarized_message_id`
- `app.messages.raw_event_id`
- `app.raw_webhook_events.payload_sanitized_json`
- `app.raw_webhook_events.external_event_id`
- `app.raw_webhook_events.external_message_id`
- `trace_id` em telas normais de operacao
- `metadata_json` bruto de qualquer tabela
- `preferences_json` bruto
- `risk_notes` em telas amplas

Motivo:

- sao campos tecnicos
- podem expor estrutura interna
- nao ajudam decisao operacional rapida
- alguns podem conter contexto sensivel demais para cards ou listas

## Dados que precisam de tratamento antes de exibir

| Dado | Tratamento minimo recomendado |
| --- | --- |
| `whatsapp_jid` | formatar ou mascarar conforme densidade da tela |
| `expected_amount`, `detected_amount`, `tolerance_applied` | formatar como moeda |
| `summary`, `profile_summary`, `reason`, `error_summary` | truncar com criterio e manter acesso ao texto completo |
| catalogo (`escort_services`, `escort_locations`) | renderizar como tabelas/listas tipadas; persona e regras de qualificacao ficam no system prompt da engenharia |
| `preferences_json` em `app.escorts` | editor chave/valor na UI; nao expor JSON bruto |
| `metadata_json`, `send_constraints_json` | extrair chaves explicitamente permitidas |
| `last_sync_error` | usar tooltip/expand, nao ocupar area primaria da tabela |
| `delivery_status` | mapear para labels humanas (`enviando`, `entregue`, `lida`, `falhou`) |
| `state`, `flow_type`, `handoff_status`, `analysis_status`, `approval_status` | sempre mapear enum para label de negocio |

## Sugestao de organizacao para refinamento da interface

### Dashboard

Usar blocos diferentes para tipos diferentes de dado:

- KPIs agregados: `DashboardSummaryRead`
- fila acionavel: `ConversationQueueItemRead`
- listas de excecao: conversas com `handoff_status`, `awaiting_client_decision`, `needs_review`
- higiene operacional: `media_pending`, `media_without_category`, `calendar_sync_error`

### Lista de conversas

Organizar em 4 camadas visuais:

- identidade: `client.display_name`, `whatsapp_jid`, `model.display_name`
- estado: `state`, `flow_type`, `handoff_status`
- contexto: `client_status`, `language_hint`, `urgency_profile`, `expected_amount`
- atividade: `last_message.content_preview`, `last_message_at`

### Detalhe da conversa

Separar em paineis:

- cabecalho operacional
- contexto do cliente
- resumo e estado estruturado da conversa
- timeline de mensagens
- historico de handoff
- diagnostico da ultima execucao da IA

### Agenda

Separar visualmente:

- periodo e filtros
- slots por dia
- badges de `status`
- badges de `calendar_sync_status`
- quando o read model permitir, incluir motivo do bloqueio manual

### Midias

Separar:

- fila de aprovacao
- galeria navegavel
- resumo de uso
- indicadores de qualidade do catalogo

### Modelos

Tratar como tela administrativa, nao como tela operacional comum:

- resumo da modelo ativa
- pendencias de cadastro
- persona, servicos e precos em secoes separadas

### Status do sistema

Separar saude de negocio e saude tecnica:

- negocio/operacao: Evolution, Calendar, handoffs em atraso
- tecnico: `logs.agent_executions`, falhas recentes, `trace_id`

## Priorizacao recomendada de dados para novas telas

Prioridade alta:

- `state`
- `flow_type`
- `handoff_status`
- `pending_action`
- `awaiting_input_type`
- `awaiting_client_decision`
- `last_message_at`
- `last_message.content_preview`
- `client_status`
- `urgency_profile`
- `expected_amount`
- `analysis_status`
- `needs_review`
- `approval_status`
- `calendar_sync_status`

Prioridade media:

- `profile_summary`
- `language_hint`
- `reason` de handoff
- `delivery_status`
- `last_sync_error`
- `tool_count`
- `fallback_used`

Prioridade baixa / suporte:

- `trace_id`
- `external_event_id`
- `external_message_id`
- `input_message_ids`
- `output_message_id`
- `updated_at` tecnico

## Resumo executivo

Para agentes de interface, a regra pratica e:

1. Comece pelos read models ja existentes.
2. Use as tabelas base apenas para entender semantica e restricoes.
3. Trate enums e valores monetarios antes de exibir.
4. Nao exponha paths, payloads, tokens ou JSON cru sem curadoria.
5. Considere `receipts` e `logs.agent_executions` como dados validos para UI, mas possivelmente vazios na operacao atual ate os writers estarem ligados.
