# Roadmap do Projeto Barra Vips

## 1. Resumo Executivo

Este roadmap transforma a documentacao local do Barra Vips em fases praticas para levar o produto ate um MVP pronto para producao assistida.

O caminho recomendado e construir primeiro a base operacional: contratos, banco, backend e read models. Em seguida, a interface de Fernando deve dar visibilidade sobre conversas, agenda, handoffs e status. Sobre essa base entra o agente LangGraph, conectado ao WhatsApp via Evolution API, com estado persistido, handoff duro, idempotencia, locks por conversa, observabilidade minima e testes criticos.

O MVP nao deve tentar escalar o negocio ainda. A meta e uma operacao confiavel com uma unica modelo ativa, um unico numero de WhatsApp, atendimento reativo, fluxo interno, fluxo externo com handoff imediato e capacidade humana de supervisao e rollback.

## 2. Premissas Confirmadas

- O MVP usa uma unica modelo ativa e um unico numero de WhatsApp ja existente.
- O atendimento e reativo: o agente nao inicia conversas, nao faz outbound e nao executa remarketing automatico.
- O agente impersona a modelo e nao se apresenta como IA, assistente, sistema ou automacao.
- O agente deve operar por WhatsApp via Evolution API.
- Postgres e a fonte central de dados operacionais, historico, estado, agenda local, logs e leitura da interface.
- Google Calendar e referencia visual humana; o agente e o backend leem disponibilidade pelo Postgres.
- Bloqueios de agenda devem gravar primeiro no Postgres, validar colisao e refletir no Calendar de forma idempotente.
- A interface operacional propria para Fernando faz parte do MVP e consome backend/read models, nao banco direto.
- Chatwoot fica no MVP como espelho, visibilidade complementar e origem preferencial de eventos de handoff, mas nao substitui a interface propria.
- A escalada operacional vai para a modelo, nao para Fernando.
- O MVP usa hard handoff: apos `handoff_opened`, o agente fica em silencio ate `handoff_released`.
- O fluxo externo/saida deve abrir handoff imediatamente ao ser classificado como `EXTERNAL`.
- O fluxo interno nao tem cobranca antecipada no MVP; o transbordo ocorre apos confirmacao de chegada com foto da portaria/fachada.
- O `conversation_id` e a chave canonica para checkpoint, memoria curta, debounce, lock, fila logica, trace e execucao do agente.
- LangGraph deve usar `PostgresSaver` desde o inicio, sempre com `thread_id = conversation_id`.
- Redis, MinIO/S3, WebSocket, SSE, Supabase Realtime, RAG e multiagente ficam fora do MVP.
- A stack confirmada inclui LangGraph, Claude Sonnet 4.6, Postgres/Supabase, Evolution API, Google Calendar, Chatwoot, Groq Whisper com fallback OpenAI Whisper, filesystem local para midia, LangFuse, Vercel e Portainer.
- Producao deve ter um unico artefato canonico versionado para Portainer/Swarm, inicialmente `infra/portainer-stack.yml`.
- Prompts, regras operacionais, contratos, migrations, testes, simuladores e evals devem ser versionados em git.
- O MVP so pode entrar em producao assistida quando fluxo interno, fluxo externo, handoff, visibilidade operacional, observabilidade minima, degradacao controlada e testes criticos estiverem prontos.

## 3. Fora de Escopo do MVP

- Multiplas modelos em paralelo: o MVP deve preservar a invariante de uma unica modelo ativa para reduzir risco operacional.
- Multiplos numeros com orquestracao avancada: a operacao inicial usa um numero existente e mede estabilidade antes de escalar.
- CRM completo dos contatos existentes: o MVP usa `app.clients` e perfil resumido, sem CRM robusto.
- Remarketing e outbound automatico: contradizem a premissa de agente reativo no MVP.
- IA administrativa madura: fica para expansao futura.
- Integracao bancaria formal: comprovantes sao apoio operacional apos handoff, nao conciliacao bancaria completa.
- Expansao para outros nichos: turismo, restaurantes, passagens, hospedagem e outros servicos ficam para fases posteriores.
- RAG/base de conhecimento: rejeitado como componente do MVP.
- Supabase Realtime, WebSocket ou SSE: polling de 10 a 30 segundos e suficiente para a interface inicial.
- MinIO/S3 e presigned URLs: filesystem local/volume Docker atende o MVP, com interface preparada para migracao futura.
- Redis: debounce, locks e filas logicas rodam em memoria por `conversation_id` enquanto houver instancia unica; evolucao futura pode usar Postgres ou Redis mediante evidencia.
- IA nativa do Chatwoot: Chatwoot e espelho/evento, nao motor de atendimento.
- Feature flags para desligar tools individuais: fora do MVP.
- Playground de IA com trace em tempo real no frontend operacional: fora do MVP.
- Operador enviar mensagem manual pelo painel proprio como se fosse a modelo: fora do MVP; a resposta manual da modelo ocorre pelo WhatsApp do numero operacional.
- Docker compose de producao duplicado com Portainer stack: deve existir um unico artefato canonico.

## 4. Fases do Roadmap

### Fase 1 - Consolidacao de arquitetura, contratos e banco

**Objetivo:**  
Materializar a base tecnica do MVP: monorepo, contratos versionados, migrations, schemas canonicos, invariantes de dados e configuracao minima de ambientes.

**Entregaveis:**
- Estrutura inicial do monorepo com `apps/api`, `apps/agent`, `apps/operator-web`, `packages/contracts`, `packages/observability`, `db/migrations`, `prompts`, `tests`, `scripts` e `infra`.
- Migrations SQL puro versionado para schemas `app`, `langgraph` e `logs`.
- Tabelas canonicas do MVP: `app.clients`, `app.escorts` e filhas (`escort_services`, `escort_locations`, `escort_preferences`, `escort_availability`), `app.conversations`, `app.messages`, `app.raw_webhook_events`, `app.handoff_events`, `app.integration_status`, `app.media_assets`, `app.receipts`, `app.schedule_slots` e `logs.agent_executions`.
- Indices, constraints e checks documentados, incluindo modelo ativa unica, anti-overlap de agenda e consistencia entre `state` e `handoff_status`.
- Schemas versionados em `packages/contracts` para Evolution, mensagem interna normalizada, read models, handoff, agenda, midia, receipts e tools do agente.
- Seeds minimos de desenvolvimento para uma modelo ativa e dados operacionais iniciais.
- Inventario inicial de secrets por ambiente.
- `infra/docker-compose.dev.yml` minimo para dependencias locais necessarias.

**Tarefas principais:**
- Criar estrutura de diretorios do monorepo.
- Definir enums/checks para `state`, `flow_type`, `handoff_status`, `client_status`, direcao, role, tipos de mensagem, status de agenda, status de sync e status de receipt.
- Implementar `one_active_escort` com indice unico parcial em `app.escorts`.
- Implementar `schedule_slots_no_overlap` com `btree_gist` e `tstzrange`.
- Implementar unicidade de mensagens por `external_message_id` quando existir.
- Implementar invariantes entre `state`, `state_before_escalation` e `handoff_status`.
- Criar contratos Pydantic/JSON para payload minimo `messages.upsert`, evento `connection.update`, contrato normalizado interno e envelopes de API.
- Definir truncamento configuravel de texto inbound longo com flag operacional.
- Definir `trace_id` como campo obrigatorio nos contratos internos.
- Preparar seeds sem inventar precos reais: marcar campos comerciais ausentes como pendentes.

**Dependencias:**
- Decisao humana sobre regras comerciais reais da modelo: precos, duracoes, piso, servicos nao oferecidos, antecedencia minima e acrescimo de saida.
- Decisao sobre nomes canonicos de secrets por ambiente.
- Confirmacao do artefato canonico de producao caso a operacao prefira outro nome em vez de `infra/portainer-stack.yml`.

**Criterios de aceite:**
- Migrations aplicam do zero em ambiente `dev/test`.
- Tabelas, indices e constraints existem conforme documentos.
- Nao e possivel ter duas modelos ativas.
- Nao e possivel criar dois slots `BLOCKED` sobrepostos para a mesma modelo.
- Handoff aberto exige `state = ESCALADO` e `state_before_escalation` preenchido.
- Contratos versionados validam fixtures minimas de Evolution e read models.
- Seeds sobem uma operacao minima sem usar valores comerciais inventados.

**Riscos:**
- Regras comerciais incompletas bloqueiam testes realistas de negociacao.
- Secrets indefinidos atrasam integracoes reais.
- JSONs flexiveis demais podem esconder erro de contrato se nao houver validacao forte.

**Documentos de referencia:**
- `docs/contexto/01-escopo-mvp-e-roadmap.md`
- `docs/contexto/05-estado-memoria-e-modelo-de-dados.md`
- `docs/contexto/06-arquitetura-stack-e-repositorio.md`
- `docs/contexto/07-integracoes-canais-e-midia.md`
- `docs/contexto/08-interface-operacional-e-api.md`
- `docs/contexto/12-riscos-pendencias-e-ambiguidades.md`

### Fase 2 - Backend, read models e APIs operacionais

**Objetivo:**  
Criar o backend HTTP que recebe webhooks, expoe read models para a interface, protege endpoints operacionais e centraliza acesso ao Postgres.

**Entregaveis:**
- Backend operacional com autenticacao por `OPERATOR_API_KEY` nos endpoints `/api`.
- Webhooks separados em `/webhooks/evolution` e `/webhooks/chatwoot`, com secrets proprios.
- Endpoints minimos de conversas, agenda, midias, status e health.
- Read models paginados com envelope `{ items, total, page, page_size }`.
- Servico autenticado para midia por `GET /api/media/{media_id}/content`.
- Camada de repositorios/services para clientes, conversas, mensagens, agenda, handoff, midia e status de integracao.

**Tarefas principais:**
- Implementar `GET /api/conversations` com filtros por `status`, `handoff_status`, busca e paginacao.
- Implementar `GET /api/conversations/{conversation_id}` com conversa, mensagens recentes, eventos de handoff, midias relevantes e ultima execucao do agente.
- Implementar `POST /api/conversations/{conversation_id}/handoff/acknowledge`.
- Implementar `POST /api/conversations/{conversation_id}/handoff/release`.
- Implementar `GET /api/schedule/slots`, `POST /api/schedule/slots/block` e `POST /api/schedule/sync`.
- Implementar `GET /api/media`, `POST /api/media`, `PATCH /api/media/{media_id}` e `GET /api/media/{media_id}/content`.
- Validar MIME real e tamanho maximo antes de gravar upload de midia.
- Resolver caminho de midia somente pelo banco, nunca por path vindo do cliente.
- Implementar `GET /api/status/evolution`, `GET /api/status/calendar` e `GET /api/status/health`.
- Garantir CORS sem credenciais e sem exposicao de `OPERATOR_API_KEY` ao browser.

**Dependencias:**
- Fase 1 concluida.
- Definicao inicial de limites de upload e tipos de midia permitidos.
- Definicao de como o frontend fara proxy server-side para injetar `OPERATOR_API_KEY`.

**Criterios de aceite:**
- Endpoints retornam contratos versionados e passam testes de regressao de schema.
- Listas operacionais nao fazem N+1 para dados basicos de cliente, modelo e ultima mensagem.
- API bloqueia requisicoes sem `OPERATOR_API_KEY`.
- Webhooks nao compartilham autenticacao com a interface.
- Midia so e servida via backend autenticado e id resolvido no banco.
- Telas futuras conseguem montar lista de conversas sem chamada adicional por item.

**Riscos:**
- Read models pobres podem forcar frontend a multiplicar chamadas e degradar operacao.
- Falta de politica de permissao mais granular e aceitavel no MVP, mas vira risco se houver mais usuarios.
- Upload de midia sem validacao real pode criar risco operacional e de seguranca.

**Documentos de referencia:**
- `docs/contexto/05-estado-memoria-e-modelo-de-dados.md`
- `docs/contexto/06-arquitetura-stack-e-repositorio.md`
- `docs/contexto/08-interface-operacional-e-api.md`
- `docs/contexto/09-handoff-seguranca-e-robustez-operacional.md`

### Fase 3 - Interface operacional de Fernando

**Objetivo:**  
Entregar uma interface propria, simples e protegida para Fernando acompanhar estado real da operacao, sem depender de Google Calendar, Evolution ou Chatwoot como fonte primaria.

**Entregaveis:**
- Aplicacao `apps/operator-web` publicada em ambiente de teste.
- Rotas: `conversas`, `conversas/[id]`, `agenda`, `handoffs`, `modelos`, `midias` e `status`.
- Proxy server-side para chamadas ao backend com `OPERATOR_API_KEY`.
- Polling de 10 a 30 segundos para conversas, handoffs, agenda e status.
- Visualizacao diferenciada de mensagens inbound, agent, human e system.
- Acoes operacionais permitidas: reconhecer handoff, liberar handoff, consultar trace resumido, revisar midia/status operacional.

**Tarefas principais:**
- Criar layout operacional focado em leitura rapida: lista de conversas, estado, `flow_type`, `handoff_status`, ultima mensagem e pendencias.
- Criar detalhe de conversa com mensagens recentes, resumo incremental, estado estruturado, eventos de handoff e ultima execucao do agente.
- Criar tela de agenda com slots, origem, status e sync com Calendar.
- Criar tela de handoffs com filtros para `OPENED` e `ACKNOWLEDGED`.
- Criar tela de midias para listar, subir, aprovar, rejeitar, revogar e visualizar conteudo aprovado.
- Criar tela de status para Evolution, Calendar, health e jobs essenciais.
- Garantir que listas funcionem vazias.
- Bloquear no frontend qualquer fluxo de digitacao manual como modelo, pois isso esta fora do MVP.

**Dependencias:**
- Fase 2 com read models estaveis.
- URL base do backend por ambiente.
- Definicao de branding visual minimo, sem depender de decisao de produto que bloqueie o MVP.

**Criterios de aceite:**
- Fernando consegue ver conversas, estados, handoffs, agenda, midias e status sem acessar ferramentas externas.
- Interface nao acessa Postgres diretamente.
- `OPERATOR_API_KEY` nao aparece no codigo executado no browser.
- Handoff pode ser reconhecido e liberado pela interface, gravando evento em `app.handoff_events`.
- Estados vazios e erros de API aparecem de forma operacionalmente clara.
- Polling atualiza dados sem necessidade de WebSocket/SSE.

**Riscos:**
- Sem design de permissao granular, a interface e adequada apenas para usuario operacional unico.
- Excesso de acoes no painel pode transformar a interface em canal de atendimento, o que esta fora do MVP.
- Falta de visibilidade de erro nos jobs pode atrasar intervencao humana.

**Documentos de referencia:**
- `docs/contexto/00-visao-geral-e-onboarding.md`
- `docs/contexto/01-escopo-mvp-e-roadmap.md`
- `docs/contexto/08-interface-operacional-e-api.md`
- `docs/contexto/09-handoff-seguranca-e-robustez-operacional.md`

### Fase 4 - Pipeline de WhatsApp e Evolution API

**Objetivo:**  
Conectar o canal WhatsApp com persistencia segura, idempotencia, normalizacao de eventos, envio de respostas e monitoramento da instancia Evolution.

**Entregaveis:**
- `POST /webhooks/evolution` com autenticacao por header compartilhado.
- Suporte minimo a `messages.upsert`, `connection.update` e `messages.update`.
- Persistencia de eventos sanitizados em `app.raw_webhook_events`.
- Normalizacao para `app.messages` antes de qualquer processamento pesado.
- Idempotencia por `external_message_id`.
- Atualizacao de `app.integration_status` para eventos de conexao.
- Cliente Evolution para `sendText`, `sendMedia`, notificacao de handoff e status de entrega.
- Job in-process de recuperacao de mensagens inbound sem execucao terminal.

**Tarefas principais:**
- Validar segredo do webhook antes de processar payload.
- Validar schema minimo e sanitizar payload removendo `base64`, thumbnails e campos pesados/sensiveis.
- Persistir evento bruto sanitizado e chave de idempotencia.
- Resolver/criar `client` por `remote_jid`.
- Resolver/criar conversa ativa por `client_id + model_id`.
- Persistir `app.messages` com `direction`, `role`, `message_type`, `from_me`, `trace_id` e `raw_event_id`.
- Responder `200` ao final da persistencia minima, antes de debounce/agente.
- Processar passos pesados assincronamente dentro do processo.
- Registrar `fromMe` como mensagem humana/manual ou eco, sem disparar resposta automatica.
- Atualizar `delivery_status` por loopback/status quando disponivel.
- Evitar retry cego em `sendText` e `sendMedia`.

**Dependencias:**
- Fases 1 e 2.
- Credenciais e URL da Evolution API.
- Definicao da instancia `barra-vips-main` ou nome operacional equivalente.
- Definicao de politica de rede Docker interna quando aplicavel.

**Criterios de aceite:**
- Payload real ou fixture de `messages.upsert` gera `raw_webhook_event`, `client`, `conversation` e `message`.
- Reenvio do mesmo `external_message_id` nao duplica mensagem nem execucao.
- `connection.update` atualiza `app.integration_status` e aparece em `/api/status/evolution`.
- Payload malformado nao chega ao agente.
- Falha de autenticacao retorna `401`.
- Persistencia minima falhando retorna erro para permitir retry externo.
- Evento autenticado mas nao recuperavel e marcado como `FAILED` ou `SKIPPED` sem quebrar o webhook.
- Job de recuperacao encontra mensagens sem execucao terminal e reprocessa respeitando idempotencia.

**Riscos:**
- Evolution API e operacionalmente fragil e pode sofrer desconexao ou banimento do numero.
- Nao ha reconciliacao automatica para perda de evento inbound no MVP.
- Retry incorreto de envio pode gerar duplicidade visivel para cliente.

**Documentos de referencia:**
- `docs/contexto/06-arquitetura-stack-e-repositorio.md`
- `docs/contexto/07-integracoes-canais-e-midia.md`
- `docs/contexto/09-handoff-seguranca-e-robustez-operacional.md`
- `docs/contexto/10-observabilidade-testes-e-producao-assistida.md`

### Fase 5 - Estado conversacional, memoria e agente LangGraph

**Objetivo:**  
Implementar o agente unico com tools, estado estruturado, memoria persistente, prompts versionados, validacao de saida e rastreabilidade por trace.

**Entregaveis:**
- Grafo LangGraph em `apps/agent`.
- `PostgresSaver` configurado no schema `langgraph`.
- Execucao sempre com `thread_id = conversation_id`.
- Estado estruturado com `state`, `flow_type`, `pending_action`, `awaiting_input_type`, `awaiting_client_decision`, `urgency_profile`, `expected_amount` e `handoff_status`.
- Prompts versionados em `prompts/persona`, `prompts/system` e `prompts/tools`.
- Validadores deterministicos de saida.
- Tools iniciais: consulta de perfil, atualizacao de estado, consulta de agenda, bloqueio de slot, selecao/envio de midia, analise de comprovante, abertura de handoff e registro operacional.
- Registro em `logs.agent_executions`.

**Tarefas principais:**
- Implementar no inicial de interceptacao para `handoff_status` aberto, falha de audio ja sinalizada, lote vazio, cliente `BLOCKED` e mensagem `fromMe`/eco.
- Implementar carregamento de contexto da modelo ativa, cliente, conversa, resumo e ultimas 10 trocas.
- Implementar extracao/atualizacao estruturada de estado sem depender de texto livre.
- Implementar memoria de curto prazo com `messages` + `summary`.
- Implementar memoria de longo prazo em perfil unico por cliente.
- Garantir que perfil/memoria nao apareca explicitamente na resposta ao cliente.
- Implementar validacao de maximo 300 caracteres por mensagem, maximo 2 mensagens por turno, sem markdown/listas, sem autoidentificacao como IA, sem linguagem explicita excessiva e sem valores fora do estado operacional.
- Implementar retry limitado de geracao e fallback curto seguro.
- Registrar etapas de contexto, decisao, tools, validacao, envio e resultado.

**Dependencias:**
- Fases 1, 2 e 4.
- Prompts de persona com dados reais da modelo.
- Regras comerciais reais para impedir valores inventados.
- Configuracao de Claude Sonnet 4.6 e credenciais de observabilidade.

**Criterios de aceite:**
- Teste direto do grafo prova `thread_id = conversation_id`.
- Uma conversa multi-turno preserva memoria e estado.
- O agente nao responde quando handoff esta `OPENED` ou `ACKNOWLEDGED`.
- Saida final passa validadores deterministicos.
- Resposta nao revela termos internos como prompt, tool, LangGraph, webhook, trace ou banco.
- Valores, duracoes, descontos e condicoes so aparecem se vierem de estado/regras.
- `logs.agent_executions` registra status, duracao, tools, retries, fallback e `trace_id`.

**Riscos:**
- Persona real incompleta gera respostas inconsistentes.
- Regras comerciais ausentes impedem negociacao segura.
- Validador LLM no caminho sincrono pode quebrar latencia se usado sem seletividade.
- Checkpoints sem limpeza periodica podem acumular dados alem da politica.

**Documentos de referencia:**
- `docs/contexto/02-regras-de-negocio-e-operacao.md`
- `docs/contexto/03-persona-tom-e-politica-de-resposta.md`
- `docs/contexto/04-fluxos-de-atendimento.md`
- `docs/contexto/05-estado-memoria-e-modelo-de-dados.md`
- `docs/contexto/06-arquitetura-stack-e-repositorio.md`
- `docs/contexto/10-observabilidade-testes-e-producao-assistida.md`

### Fase 6 - Fluxos interno e externo

**Objetivo:**  
Implementar os dois caminhos operacionais obrigatorios do MVP: interno e saida, mantendo uma operacao unica com classificacao por `flow_type`.

**Entregaveis:**
- Classificacao estruturada de `flow_type`: `UNDETERMINED`, `INTERNAL` e `EXTERNAL`.
- Fluxo interno com qualificacao, negociacao, consulta de disponibilidade, bloqueio quando aplicavel, pedido de aviso de saida, foto de chegada e escalada para modelo.
- Fluxo externo com coleta minima, classificacao `EXTERNAL`, abertura imediata de handoff e silencio do agente.
- Tratamento de perfis de urgencia como eixo complementar: `IMMEDIATE`, `SCHEDULED`, `UNDEFINED_TIME` e `ESTIMATED_TIME`.
- Analise de comprovante com `VALID`, `UNCERTAIN` e `INVALID` como apoio operacional apos handoff.
- Tratamento de foto de chegada como entrada operacional.

**Tarefas principais:**
- Implementar pergunta natural para destravar `flow_type` quando necessario.
- Implementar transicoes `NOVO -> QUALIFICANDO`, `QUALIFICANDO -> NEGOCIANDO`, `NEGOCIANDO -> CONFIRMADO`, `CONFIRMADO -> ESCALADO` e qualquer estado para `ESCALADO` somente por necessidade operacional explicita.
- Implementar `QUALIFICANDO/NEGOCIANDO -> ESCALADO` imediatamente ao classificar `EXTERNAL`.
- Implementar `check_availability` lendo somente `app.schedule_slots`.
- Implementar `block_slot` com transacao, anti-overlap e reflexo idempotente no Calendar.
- Impedir confirmacao definitiva se Calendar estiver pendente/erro quando a regra exigir sincronizacao ou revisao humana.
- Implementar comprovante como apoio apos handoff, comparando `expected_amount` e tolerancia configuravel.
- Implementar politica de `UNCERTAIN`: primeiro reenvio curto, persistencia do incerto encaminha revisao manual.
- Implementar negacao curta para pedido fora do escopo sem escalar apenas por quebra de persona.

**Dependencias:**
- Fases 1, 4 e 5.
- Regras comerciais reais por modelo.
- Procedimento humano para seguranca territorial no fluxo externo.
- Definicao de tolerancia de comprovante se a recomendacao inicial de 5% ou R$10 precisar ser ajustada.

**Criterios de aceite:**
- Fluxo interno simulado chega a `CONFIRMADO` apenas apos horario, duracao e valor aceitavel no estado operacional.
- Fluxo interno abre handoff apos foto de chegada.
- Fluxo externo abre `handoff_opened` no mesmo ciclo em que `flow_type` vira `EXTERNAL`.
- Apos `EXTERNAL`, novas mensagens sao registradas mas nao recebem resposta automatica.
- O agente nao valida seguranca territorial, endereco, Pix ou logistica da saida autonomamente.
- Comprovante `INVALID` nao confirma nem bloqueia agenda automaticamente.
- Cliente suspeito continua recebendo resposta dentro das regras de linguagem e seguranca.

**Riscos:**
- Regras dos perfis de urgencia ainda precisam virar transicoes e prompts testaveis.
- Politica de atraso, reagendamento, cancelamento e no-show ainda nao esta detalhada.
- Seguranca territorial permanece humana e precisa de procedimento operacional claro.

**Documentos de referencia:**
- `docs/contexto/02-regras-de-negocio-e-operacao.md`
- `docs/contexto/04-fluxos-de-atendimento.md`
- `docs/contexto/05-estado-memoria-e-modelo-de-dados.md`
- `docs/contexto/09-handoff-seguranca-e-robustez-operacional.md`
- `docs/contexto/12-riscos-pendencias-e-ambiguidades.md`

### Fase 7 - Handoff, seguranca, idempotencia e concorrencia

**Objetivo:**  
Endurecer os pontos que impedem duplicidade de resposta, mistura de conversas, escalada insegura e falhas silenciosas.

**Entregaveis:**
- Maquina de estados de handoff com eventos explicitos.
- Pausa persistente do agente para `OPENED` e `ACKNOWLEDGED`.
- Notificacao operacional de handoff via grupo WhatsApp.
- Debounce em memoria por `conversation_id`.
- Lock local por conversa com `asyncio.Lock`.
- Fila logica por conversa para mensagens recebidas durante processamento.
- Idempotencia de webhook, mensagens, handoff e envio.
- Matriz de degradacao implementada para componentes criticos.

**Tarefas principais:**
- Implementar transicoes `NONE -> OPENED`, `OPENED -> ACKNOWLEDGED`, `ACKNOWLEDGED -> RELEASED`, `OPENED -> RELEASED` por acao explicita e `RELEASED -> OPENED`.
- Registrar toda transicao em `app.handoff_events`.
- Guardar `state_before_escalation` ao abrir handoff e restaurar no release.
- Enviar notificacao fire-and-forget apos commit de `handoff_opened`.
- Marcar `metadata_json.notification_failed=true` em update best-effort se a notificacao falhar.
- Tratar `fromMe` apos handoff como atuacao humana/manual e possivel `ACKNOWLEDGED`.
- Implementar debounce configuravel com baseline `DEBOUNCE_WINDOW_SECONDS=8`, `DEBOUNCE_MAX_MESSAGES=10`, `MAX_INBOUND_TEXT_CHARS=4000` e `PROCESSING_LOCK_SCOPE=conversation_id`.
- Garantir no maximo uma execucao ativa por conversa.
- Registrar quais mensagens formaram cada lote processado.
- Implementar retries/fallbacks conforme matriz: LLM, Evolution, Postgres, Calendar, Whisper, Chatwoot e LangFuse.

**Dependencias:**
- Fases 4, 5 e 6.
- `HANDOFF_NOTIFICATION_GROUP_JID`.
- `OPERATOR_UI_BASE_URL`.
- Politica de mascaramento de numero/nome na notificacao.
- Webhook Chatwoot ou acao operacional equivalente para release.

**Criterios de aceite:**
- Handoff aberto bloqueia resposta automatica mesmo com nova mensagem do cliente.
- Mensagem `fromMe` nao dispara agente.
- Transicao invalida de handoff falha de forma visivel na API/interface e logs.
- Dois clientes processam em paralelo sem misturar `conversation_id`, `thread_id`, buffers, locks ou traces.
- Varias mensagens rapidas do mesmo cliente viram um unico lote e uma unica execucao.
- Falha na notificacao do grupo nao desfaz o handoff.
- Nao existe resposta duplicada entre agente e humano nos testes criticos.

**Riscos:**
- Instancia unica e premissa do MVP; multiplas replicas exigem lock distribuido antes de escalar.
- Se Chatwoot nao emitir evento confiavel de release, a interface propria precisa cobrir a liberacao manual.
- Fila em memoria pode perder pendencias em crash; o job de recuperacao reduz, mas nao elimina, o risco.

**Documentos de referencia:**
- `docs/contexto/05-estado-memoria-e-modelo-de-dados.md`
- `docs/contexto/07-integracoes-canais-e-midia.md`
- `docs/contexto/09-handoff-seguranca-e-robustez-operacional.md`
- `docs/contexto/10-observabilidade-testes-e-producao-assistida.md`
- `docs/contexto/11-decisoes-tecnicas-e-praticas-analisadas.md`

### Fase 8 - Integracoes de agenda, midia, audio e Chatwoot

**Objetivo:**  
Completar as integracoes externas do MVP sem transformar ferramentas externas em fonte primaria de estado.

**Entregaveis:**
- Sincronizacao Google Calendar -> `app.schedule_slots`.
- Write-through idempotente de bloqueios para Calendar.
- Tratamento de `nextSyncToken` e `410 Gone`.
- Transcricao de audio com Groq Whisper e fallback OpenAI Whisper.
- Catalogo de midia aprovado em filesystem local/volume Docker e `app.media_assets`.
- Tool deterministica de selecao/envio de midia.
- Integracao Chatwoot como espelho, eventos de handoff e visibilidade complementar.

**Tarefas principais:**
- Implementar job/script de sync incremental do Calendar.
- Persistir `calendar_sync_status`, `last_synced_at` e `last_sync_error`.
- Implementar `block_slot` com evento Calendar idempotente.
- Implementar timeout explicito em clientes Google, Evolution, Whisper e Chatwoot.
- Implementar fallback de audio: se transcricao falhar, sinal estruturado para o agente pedir texto ao cliente.
- Evitar FFmpeg/chunking no MVP salvo problema medido com audios longos reais.
- Implementar upload, aprovacao, rejeicao, revogacao e restricoes de midia.
- Selecionar midia por modelo, tipo, categoria, historico de envio e menor uso global.
- Registrar envio de midia em `app.messages.media_id`.
- Implementar webhook Chatwoot para `handoff_acknowledged` e `handoff_released` quando disponivel.

**Dependencias:**
- Fases 1, 2, 4 e 7.
- OAuth2 Google Calendar com refresh token armazenado como secret.
- Credenciais Groq e OpenAI Whisper fallback.
- Definicao de diretorio/volume local de midias.
- Configuracao Chatwoot e mapeamento de eventos.

**Criterios de aceite:**
- `check_availability` nunca consulta Calendar em tempo real.
- Slots sincronizados aparecem na interface com origem e status.
- Bloqueio local impede colisao mesmo se Calendar estiver lento.
- Falha de Calendar deixa status pendente/erro visivel e impede confirmacao definitiva quando aplicavel.
- Audio transcrito chega ao agente como texto normalizado; falha nao vira string magica no conteudo.
- Agente so envia foto/video quando cliente pede explicitamente.
- Midia nao aprovada nunca fica elegivel para envio automatico.
- Chatwoot falhando nao interrompe conversa, mas registra erro.

**Riscos:**
- Refresh token do Calendar e ponto operacional sensivel.
- Filesystem local resolve o MVP, mas pode virar gargalo quando houver volume maior de midia.
- Chatwoot pode nao refletir todas as intervencoes no tempo esperado.

**Documentos de referencia:**
- `docs/contexto/02-regras-de-negocio-e-operacao.md`
- `docs/contexto/04-fluxos-de-atendimento.md`
- `docs/contexto/07-integracoes-canais-e-midia.md`
- `docs/contexto/08-interface-operacional-e-api.md`
- `docs/contexto/09-handoff-seguranca-e-robustez-operacional.md`

### Fase 9 - Observabilidade, testes e evals

**Objetivo:**  
Criar evidencia objetiva de estabilidade funcional, seguranca operacional e qualidade conversacional antes de uso real assistido.

**Entregaveis:**
- LangFuse self-hosted integrado com traces, spans, tokens, custo e erros.
- Logs estruturados com `trace_id` propagado do webhook ao envio.
- `logs.agent_executions` preenchido para cada execucao terminal ou skip relevante.
- Simulador de payloads Evolution em `scripts/simulate_webhook`.
- Testes de agente, integracao, debounce, concorrencia, handoff, contratos e evals offline.
- Fixtures anonimizadas iniciais.
- Rubricas LLM-as-judge versionadas.
- Jobs de retencao e limpeza minima.

**Tarefas principais:**
- Instrumentar latencia total, latencia por etapa, tempo ate primeira resposta, taxa de handoff por fluxo, colisao agente/humano, comprovantes, confirmacao, retries, tokens/custo, webhook e idempotencia.
- Criar testes diretos do grafo com `conversation_id` isolado.
- Criar testes multi-turno provando memoria, checkpoint e estado estruturado.
- Criar testes de fluxo externo validando `EXTERNAL` -> handoff imediato -> silencio.
- Criar testes de fluxo interno ate foto de chegada e escalada.
- Criar testes de negociacao com piso configurado.
- Criar testes de cliente recorrente.
- Criar testes multilingues em portugues, ingles e espanhol.
- Criar testes de prompt injection.
- Criar testes de comprovante `VALID`, `UNCERTAIN` e `INVALID`.
- Criar testes de concorrencia com dois `remote_jid` distintos.
- Criar testes de debounce com janela reduzida.
- Criar regressao de contratos para Evolution, Chatwoot e read models.
- Criar jobs de retencao para raw webhook, comprovantes, checkpoints, logs/traces e dados de cliente conforme politica documentada.

**Dependencias:**
- Fases 1 a 8.
- Dataset inicial de exemplos reais ou simulados anonimizados.
- Decisao sobre rubricas iniciais e casos negativos.
- Infra LangFuse disponivel ou configuracao de fallback desligado para testes locais.

**Criterios de aceite:**
- Testes criticos passam em ambiente `dev/test`.
- Evals offline rodam com rubricas minimas.
- Asserts focam estado estruturado, trace de tools e ausencia de violacoes, nao texto exato do LLM.
- Traces permitem reconstruir decisao, tools chamadas, tempo gasto e resultado.
- Logs nao duplicam conteudo bruto de conversa quando LangFuse ja cobre trace.
- Politica minima de retencao esta automatizada.
- Falhas de integracao aparecem em status operacional ou logs estruturados.

**Riscos:**
- Sem fixtures reais, os evals podem nao capturar tom e situacoes de abandono.
- LLM-as-judge mal calibrado pode aprovar respostas fracas.
- Observabilidade insuficiente dificulta diagnostico durante producao assistida.

**Documentos de referencia:**
- `docs/contexto/03-persona-tom-e-politica-de-resposta.md`
- `docs/contexto/04-fluxos-de-atendimento.md`
- `docs/contexto/05-estado-memoria-e-modelo-de-dados.md`
- `docs/contexto/09-handoff-seguranca-e-robustez-operacional.md`
- `docs/contexto/10-observabilidade-testes-e-producao-assistida.md`
- `docs/contexto/12-riscos-pendencias-e-ambiguidades.md`

### Fase 10 - Producao assistida

**Objetivo:**  
Colocar o MVP em uso real controlado, com supervisao humana, capacidade de intervencao, rollback e medicao de riscos antes de qualquer escala.

**Entregaveis:**
- Frontend operacional publicado na Vercel.
- Backend/agente publicados via Portainer/Swarm.
- Artefato canonico de producao versionado em `infra/portainer-stack.yml` ou substituto unico decidido.
- Secrets de producao configurados.
- Runbook de operacao assistida, rollback e contingencia basica.
- Checklist de entrada em producao assistida.
- Monitoramento de Evolution, Calendar, handoff, agente, custos e erros.
- Relatorio inicial de calibracao apos uso real.

**Tarefas principais:**
- Criar imagem/tag versionada da aplicacao.
- Configurar stack Portainer com uma replica inicial, volume local de midia, rede interna e publicacao externa apenas do endpoint necessario.
- Configurar frontend com proxy server-side seguro.
- Validar webhook real da Evolution.
- Validar envio de mensagem real controlada.
- Validar handoff real para grupo operacional e visibilidade na interface.
- Validar Chatwoot como espelho/evento quando aplicavel.
- Executar smoke tests com numero real antes de abrir para clientes.
- Rodar checklist diario durante a fase assistida.
- Medir qualidade de persona, latencia percebida, colisao agente/humano, comprovantes incertos, negociacao no piso, cliente recorrente, falhas Evolution e custo por conversa.

**Dependencias:**
- Fases 1 a 9 aprovadas.
- Credenciais finais de Evolution, Google, Chatwoot, LangFuse, LLM e Whisper.
- Modelo ativa cadastrada com persona, regras comerciais, midias aprovadas e agenda conectada.
- Procedimento humano de seguranca territorial para saidas.
- Fernando ou responsavel operacional disponivel para supervisao e rollback.

**Criterios de aceite:**
- Fluxo interno esta estavel em teste real controlado.
- Fluxo externo esta estavel e abre handoff imediato ao classificar `EXTERNAL`.
- Handoff nao gera duplicidade de resposta.
- Interface operacional permite intervir rapidamente.
- Evolution tem status visivel e falhas de envio registradas.
- Logs/traces permitem depurar decisoes do agente.
- Testes criticos e smoke tests passam antes da abertura.
- Existe rollback pratico do frontend e da stack operacional.
- Falhas de integracao tem degradacao controlada conforme matriz.

**Riscos:**
- Banimento, perda ou troca do numero WhatsApp ainda nao tem politica de contingencia definida.
- Uso real pode revelar lacunas de tom, negociacao ou seguranca territorial.
- Instabilidade da Evolution pode exigir fallback humano frequente.
- Custos reais podem divergir de estimativas historicas e precisam ser medidos.

**Documentos de referencia:**
- `docs/contexto/01-escopo-mvp-e-roadmap.md`
- `docs/contexto/06-arquitetura-stack-e-repositorio.md`
- `docs/contexto/07-integracoes-canais-e-midia.md`
- `docs/contexto/09-handoff-seguranca-e-robustez-operacional.md`
- `docs/contexto/10-observabilidade-testes-e-producao-assistida.md`
- `docs/contexto/12-riscos-pendencias-e-ambiguidades.md`

### Fase 11 - Pos-MVP

**Objetivo:**  
Expandir somente depois de estabilidade medida em producao assistida, priorizando complexidades que resolvam gargalos reais.

**Entregaveis:**
- ADRs para decisoes que precisam ser revisitadas.
- Roadmap de escala baseado em metricas reais.
- Backlog de multiplas modelos, multiplos numeros, CRM, remarketing, outbound e automacoes administrativas.
- Plano de migracao de midia, locks, filas e realtime se houver gargalo medido.

**Tarefas principais:**
- Avaliar suporte a multiplas modelos e ativacao/offboarding com seguranca.
- Avaliar multiplos numeros e possivel migracao futura para WhatsApp Cloud API.
- Avaliar CRM robusto e recuperacao de contatos existentes.
- Avaliar remarketing e outbound automatico com politicas de risco e opt-in.
- Avaliar Redis ou locks distribuidos se houver multiplas instancias.
- Avaliar MinIO/S3 e URLs assinadas se filesystem local virar gargalo.
- Avaliar WebSocket/SSE/Supabase Realtime se polling nao atender.
- Avaliar RBAC se houver multiplos usuarios ou auditoria fina.
- Avaliar views materializadas se listagens ficarem lentas.
- Avaliar separacao API/agente/worker se timeout ou throughput exigir.
- Avaliar site proprio, turismo de luxo e outros nichos apenas apos estabilizar o core.

**Dependencias:**
- Dados reais da producao assistida.
- Evidencia de gargalo operacional ou tecnico.
- ADRs para mudancas estruturais.

**Criterios de aceite:**
- Nenhuma expansao entra sem justificativa baseada em metricas, incidentes ou necessidade operacional clara.
- Decisoes futuras preservam rastreabilidade por ADR.
- Mudancas de escala nao quebram hard handoff, isolamento por conversa e fonte central no Postgres.

**Riscos:**
- Expandir antes da estabilidade pode multiplicar falhas de persona, handoff e agenda.
- Introduzir Redis, MinIO/S3, realtime ou multi-servicos sem evidencia aumenta complexidade operacional.
- CRM/outbound podem mudar o perfil de risco do WhatsApp e do negocio.

**Documentos de referencia:**
- `docs/contexto/01-escopo-mvp-e-roadmap.md`
- `docs/contexto/06-arquitetura-stack-e-repositorio.md`
- `docs/contexto/11-decisoes-tecnicas-e-praticas-analisadas.md`
- `docs/contexto/12-riscos-pendencias-e-ambiguidades.md`

## 5. Backlog Priorizado

- **P0:** obrigatorio para producao assistida
- **P1:** importante, mas pode vir logo depois do MVP
- **P2:** expansao futura

### P0

- Materializar monorepo, migrations, schemas `app/langgraph/logs` e constraints canonicas.
- Criar contratos versionados para Evolution, mensagens internas, read models, handoff, agenda, midia, receipts e tools.
- Implementar backend com read models, autenticacao operacional e endpoints minimos.
- Implementar interface operacional propria com conversas, detalhe, agenda, handoffs, midias e status.
- Implementar webhook Evolution com autenticacao, schema, sanitizacao, persistencia minima e idempotencia.
- Implementar persistencia de `clients`, `conversations`, `messages`, `raw_webhook_events` e `integration_status`.
- Implementar envio de resposta via Evolution com status de entrega e sem retry cego.
- Implementar debounce, fila logica e lock por `conversation_id`.
- Implementar agente LangGraph unico com `PostgresSaver` e `thread_id = conversation_id`.
- Implementar prompts versionados, validacao de saida e fallback seguro.
- Implementar estado conversacional e memoria curta/longa conforme modelo documentado.
- Implementar fluxo interno completo ate handoff por foto de chegada.
- Implementar fluxo externo com handoff imediato ao classificar `EXTERNAL`.
- Implementar hard handoff com pausa persistente, eventos e release explicito.
- Implementar tratamento de `fromMe` sem disparar resposta automatica.
- Implementar notificacao operacional de handoff ao grupo WhatsApp.
- Implementar agenda local no Postgres, `check_availability`, `block_slot` e sync Calendar minimo.
- Implementar catalogo de midia aprovado e envio deterministico quando solicitado.
- Implementar transcricao de audio com fallback e erro estruturado.
- Implementar Chatwoot como espelho/evento de handoff quando disponivel.
- Implementar observabilidade minima com LangFuse, `trace_id`, logs estruturados e `logs.agent_executions`.
- Implementar simulador Evolution, testes criticos, regressao de contratos e evals offline minimos.
- Implementar politica minima de retencao e limpeza automatica.
- Criar artefato canonico de producao e runbook de producao assistida.
- Cadastrar modelo ativa com persona real, regras comerciais, agenda, midias e secrets.

### P1

- Refinar read models com indicadores de comprovante, chegada pendente, status de envio recente e erros de sync.
- Melhorar UX operacional da interface com filtros, busca, indicadores de risco e links de trace.
- Formalizar procedimento de seguranca territorial para saidas.
- Formalizar politica de atraso, reagendamento, cancelamento e no-show.
- Enriquecer fixtures/evals com conversas reais anonimizadas.
- Calibrar rubricas LLM-as-judge com exemplos negativos reais.
- Implementar ou melhorar jobs de reprocessamento, retencao e sync incremental.
- Adicionar dashboards de custo por conversa, taxa de handoff, falhas de Evolution e colisao agente/humano.
- Criar ADRs para decisoes estruturais do MVP.
- Avaliar se `pg_advisory_lock` e necessario antes de multiplas instancias.
- Melhorar suporte a Chatwoot para eventos confiaveis de acknowledge/release.

### P2

- Multiplas modelos.
- Multiplos numeros.
- CRM robusto dos contatos existentes.
- Remarketing.
- Outbound automatico.
- IA administrativa madura.
- RBAC e autenticacao granular.
- Redis para filas, locks ou cache distribuido se houver necessidade medida.
- MinIO/S3 e URLs assinadas.
- WhatsApp Cloud API.
- WebSocket, SSE ou Supabase Realtime.
- Views materializadas.
- Separacao API/agente/worker em servicos distintos.
- Site proprio da agencia.
- Plataforma propria de turismo de luxo.
- Ensaios fotograficos com IA e tratamento de metadados.
- Expansao para outros nichos do ecossistema.

## 6. Marcos de Prontidao

- Banco e migrations aplicam do zero com tabelas, indices e constraints do MVP.
- Uma unica modelo ativa esta cadastrada com persona, servicos, precos, agenda e midias aprovadas.
- Contratos versionados validam payloads Evolution, Chatwoot, read models e tools.
- Backend responde endpoints minimos com autenticacao operacional.
- Interface operacional mostra conversas, detalhe, agenda, handoffs, midias e status.
- Webhook Evolution recebe eventos reais, autentica, sanitiza, persiste e deduplica.
- `connection.update` atualiza status visivel da Evolution.
- `messages.upsert` real cria cliente, conversa e mensagem sem duplicar.
- Debounce consolida mensagens rapidas por conversa.
- Lock garante uma execucao ativa por `conversation_id`.
- Agente responde com estado persistido e `thread_id = conversation_id`.
- Fluxo interno passa de ponta a ponta em teste controlado.
- Fluxo externo classificado como `EXTERNAL` abre handoff imediato.
- Handoff aberto bloqueia resposta automatica posterior.
- Mensagem `fromMe` nao dispara agente e pode reconhecer handoff.
- Notificacao de handoff chega ao grupo operacional ou falha fica rastreavel.
- Agenda local bloqueia colisao e reflete Calendar de forma idempotente.
- Midias aprovadas podem ser enviadas por tool deterministica.
- Audio inbound transcreve ou pede texto com erro estruturado.
- Logs e traces permitem reconstruir decisao, tools, latencia, retries e custo.
- Testes criticos de agente, webhook, idempotencia, debounce, concorrencia, handoff, contratos e evals passam.
- Retencao minima esta automatizada.
- Stack de producao e frontend tem rollback pratico.
- Producao assistida e autorizada por checklist operacional.

## 7. Riscos e Pendencias

- Regras comerciais detalhadas por modelo ainda precisam ser preenchidas por Fernando.
- Valores, duracoes, servicos nao oferecidos, antecedencia minima, limite diario e acrescimo de saida nao podem ser inventados pelo LLM.
- Politica de atraso, reagendamento, cancelamento e no-show ainda nao esta detalhada.
- Criterio de cliente recorrente ainda esta conceitual.
- Regras para os quatro perfis de urgencia precisam virar transicoes, prompts e testes.
- Seguranca territorial para saidas permanece humana no MVP, mas precisa de procedimento operacional claro.
- Politica de contingencia para banimento, perda ou troca do numero WhatsApp nao esta definida.
- Contratos JSON/Pydantic iniciais ja existem em `packages/contracts`.
- Migrations canonicas iniciais existem como SQL puro versionado em `db/migrations`.
- Estrutura de monorepo ja esta materializada.
- Politica de secrets por ambiente precisa ser definida.
- Stack de producao, nomes de servicos, imagens, tags, volumes, rede Traefik e rollback precisam ser materializados.
- `infra/docker-compose.dev.yml` minimo de desenvolvimento ja esta definido.
- Jobs de retencao, sync Calendar e reprocessamento precisam de desenho concreto.
- Simulador de payloads Evolution precisa ser criado.
- Dataset inicial de fixtures/evals ainda nao existe.
- Evolution API tem risco operacional de desconexao e banimento.
- Perda de evento inbound nao tem reconciliacao automatica no MVP.
- Instancia unica suporta lock local; multiplas replicas exigem nova decisao tecnica.
- Filesystem local para midia e aceitavel no MVP, mas pode virar gargalo futuro.
- Observabilidade insuficiente impediria producao assistida segura.

## 8. Perguntas em Aberto

- Quais sao os precos, duracoes, piso de negociacao, acrescimo de saida e condicoes comerciais da modelo ativa?
- Quais servicos sao explicitamente nao oferecidos pela modelo?
- Existe antecedencia minima, limite diario ou restricoes de horario que precisam entrar em `app.escort_availability`?
- Qual e o procedimento humano exato para avaliar seguranca territorial em saidas?
- Qual politica operacional vale para atraso, reagendamento, cancelamento e no-show?
- Como classificar `NEW`, `RETURNING`, `VIP` e `BLOCKED` na pratica inicial?
- Qual numero/nome deve aparecer mascarado na notificacao de handoff?
- Qual e o JID do grupo operacional para `HANDOFF_NOTIFICATION_GROUP_JID`?
- Qual sera a URL final de `OPERATOR_UI_BASE_URL`?
- Quais secrets canonicos serao usados em `dev/test` e `prod`?
- Qual limite maximo de upload e quais MIME types serao aceitos para midias?
- Chatwoot emitira evento confiavel para `handoff_released` ou a interface propria sera o fallback principal?
- Qual sera o procedimento de contingencia se o numero WhatsApp for banido, desconectado ou trocado?
- Quais conversas reais podem ser anonimizadas para fixtures e evals?
- O artefato canonico de producao sera `infra/portainer-stack.yml` ou outro nome unico escolhido pela operacao?

## 9. Proximo Passo Recomendado

Com a fundacao tecnica inicial e a API operacional da Fase 2 implementadas, o proximo passo do roadmap e a Fase 3: interface operacional de Fernando consumindo os read models ja expostos.

Em paralelo, Fernando ainda deve preencher as regras comerciais da modelo ativa, pois sem esses dados o agente nao pode negociar, confirmar valores ou validar comprovantes com seguranca.
