# Decisoes Tecnicas e Praticas Analisadas

Este documento funciona como registro de decisoes e aprendizados vindos do projeto similar analisado.

## Decisoes consolidadas do MVP

- Agente unico com tools em LangGraph.
- Monorepo para backend, agente, interface, migrations, prompts, testes e scripts.
- Postgres como base principal de persistencia e leitura operacional.
- Interface operacional propria para Fernando.
- Frontend lendo backend/read models, nao banco direto.
- Evolution API para preservar numero existente.
- Google Calendar como referencia visual humana, com Postgres como fonte de leitura/reserva de agenda e write-through idempotente para bloqueios.
- Chatwoot como espelho, visibilidade e eventos de handoff.
- Groq Whisper como padrao de transcricao, com fallback OpenAI Whisper.
- Filesystem local/volume Docker para midia no MVP.
- LangFuse self-hosted para traces, custo e erros.
- Vercel para frontend.
- Portainer e um unico artefato Compose/Swarm versionado para agente/backend em producao.
- Padrao operacional de referencia: repositorio GitHub e stack Portainer/Swarm similar a `joana-backend`, com servico principal versionado e dependencias auxiliares explicitas.
- `docker-compose.dev.yml` deve ser minimo e voltado a dependencias locais, nao a reproduzir toda a operacao em containers.
- Redis fora do MVP.
- WebSocket, SSE e Supabase Realtime fora do MVP.
- MinIO/S3 fora do MVP.
- RAG/base de conhecimento fora do MVP.

## Praticas adotadas ou adaptadas

As respostas em `joana_producao/` vieram de projeto similar em producao. Praticas adotadas/adaptadas:

- persistencia bruta de webhook com sanitizacao de midia pesada;
- idempotencia antes de processar mensagem;
- debounce por conversa com limite de lote e flush por midia;
- marcador controlado para midia sem legenda;
- truncamento defensivo de texto inbound longo;
- grafo/orquestrador com etapas nomeadas e auditaveis;
- state estruturado com acao pendente e entrada esperada;
- estado formatado e injetado no prompt por placeholders explicitos;
- pre-checagens deterministicas em tools sensiveis;
- validacao pos-geracao em camadas;
- validacao de precos, duracao e valores contra dados canonicos;
- cache curto para dados operacionais da modelo ativa;
- envio de mensagens com status de entrega;
- pequeno intervalo entre baloes quando houver mais de uma mensagem;
- OAuth2 com refresh token para Google Calendar;
- sync incremental do Calendar com tratamento de `410 Gone`;
- atualizacao parcial de evento com `patch`;
- timeout explicito em transcricao;
- analise de comprovante com saida estruturada e temperatura baixa;
- read models paginados para frontend;
- polling simples no frontend em vez de realtime;
- endpoint autenticado para servir midia do filesystem;
- publicacao operacional por stack Portainer/Swarm com artefato de deploy versionado no repositorio;
- separacao entre compose dev minimo e artefato unico de producao;
- testes multi-turno com asserts por trace de tools;
- evals LLM-as-judge offline com rubricas por cenario;
- `trace_id` propagado desde o webhook;
- registro operacional fino de execucoes do agente.

Mapeamento de origem:

- `arquitetura_do_agente.txt`: orquestrador central, carregamento de contexto, extracao de estado, tools, validacao e trace.
- `Webhook.txt` e `entrada.txt`: handler Evolution, persistencia bruta, sanitizacao, idempotencia, riscos de auth ausente e processamento fire-and-forget.
- `debounce.txt`: debounce por `remoteJid`, limite de lote, flush por midia e lock por usuario.
- `estado_memoria.txt`: checkpoints, memoria progressiva, estado extraido e uso de dados internos no prompt sem revelar ao cliente.
- `frontend.txt` e `API_leitura.txt`: painel operacional, read models, paginacao e consumo via API.
- `handoff.txt`: pausa operacional e intervencao humana.
- `transcricao_midia.txt`: transcricao, fallback, midia e limites praticos.
- `testes_agente.txt`: testes massivos, multi-turno e LLM-as-judge.
- `observabilidade.txt`: tabela de execucoes, steps, status e erros.

## Praticas rejeitadas no MVP

Nao copiar para o MVP:

- webhook da Evolution sem autenticacao;
- deduplicacao apenas em memoria com TTL;
- fila global singleton para todos os usuarios;
- lock por cadeia de Promises;
- transcricao de audio dentro do handler do webhook com mutacao do payload;
- duas tabelas paralelas para historico de mensagens;
- prompt principal armazenado em tabela de banco;
- validador LLM em toda chamada de tool;
- logs completos de `intermediate_steps` duplicados no Postgres quando LangFuse ja cobre tracing;
- regex como gatilho principal de handoff;
- handoff stateless, sem pausa persistente do agente;
- retry cego em `sendText` ou `sendMedia`;
- FFmpeg/chunking de audio longo;
- fallback de transcricao como string magica misturada ao texto;
- OpenRouter/Gemini como dependencia adicional para OCR;
- Supabase Realtime, WebSocket ou SSE como requisito inicial da interface;
- intervencao manual por prefixo textual como `[SISTEMA:]`;
- feature flags para desligar tools individuais;
- view materializada para lista de conversas antes de medir gargalo real;
- presigned URLs/MinIO como dependencia do MVP;
- playground de IA com trace em tempo real no frontend operacional;
- RAG/base de conhecimento como componente do MVP.
- copiar a presenca de Redis na stack da Joana sem necessidade medida no Barra Vips.
- manter `docker-compose.prod.yml` e `portainer-stack.yml` duplicando a mesma configuracao de producao.
- containerizar backend/agente/frontend no desenvolvimento local antes de haver ganho pratico claro.

## Praticas para investigar apenas com evidencia

- Mover etapas pos-persistencia do webhook para background se o P95 de persistencia ameacar timeout da Evolution.
- Usar heuristicas de intencao como pre-filtro barato apos validar em conversas reais.
- Habilitar simulacao de "digitando" se latencia real comportar.
- Criar views materializadas se listagem de conversas ficar lenta.
- Migrar midia para MinIO/S3 com URLs assinadas se filesystem virar gargalo.
- Usar evaluator-optimizer no caminho sincrono apenas se ganho compensar latencia.
- Introduzir Redis se multiplas instancias, filas distribuidas ou locks distribuidos se tornarem necessidade real.
- Separar API, agente e worker em servicos distintos no Portainer apenas se houver ganho operacional claro sobre uma stack inicial mais simples.
- Adicionar LangFuse, Evolution, Chatwoot ou outros servicos ao compose local apenas se o fluxo de teste exigir instancia local propria.

## Reconciliacao com desenho anterior em n8n

O desenho anterior com subagentes deve ser reinterpretado:

- subagentes de agendamento, CRM e closer viram tools do agente unico;
- CRM deixa de ser fluxo separado e vira atualizacao do perfil do cliente;
- logs de intermediate steps deixam de ser no dedicado e passam para tracing observavel;
- modelagem de lead e cliente pode ser unificada em `clients` com status operacional.

## Decisoes que devem virar ADRs se o projeto crescer

- Agente unico com tools versus multiagente.
- Evolution API agora e possivel migracao para WhatsApp Cloud API.
- Postgres/Supabase como base central de leitura.
- Filesystem local para midia no MVP.
- Ausencia de Redis no MVP.
- Topologia da stack Portainer/Swarm: servico unico de aplicacao versus API/agente/worker separados.
- Nome do artefato canonico de producao, caso a operacao prefira `docker-compose.prod.yml` em vez de `portainer-stack.yml`; nao manter os dois com conteudo duplicado.
- Chatwoot como espelho e evento, nao canal principal.
- Hard handoff com pausa persistente.
- Prompt versionado em git, nao em tabela do banco.
