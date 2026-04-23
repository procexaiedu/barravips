# Handoff, Seguranca e Robustez Operacional

Este documento consolida transbordo humano, pausa formal do agente, seguranca de entrada e estrategias de erro.

## Modelo de handoff

Foi adotado hard handoff.

Isso significa:

- quando a condicao de escalada e atingida, o agente executa o transbordo e entra em silencio imediatamente;
- a conversa muda para estado operacional de handoff aberto;
- a modelo assume a conversa apenas apos receber sinal operacional correspondente;
- a IA nao retoma automaticamente por tempo, troca de dia ou nova mensagem do cliente.

## Quem recebe a escalada

A escalada vai para a modelo, nao para Fernando.

Fernando usa a interface operacional propria para visibilidade e gestao, mas nao e o destino primario da escalada conversacional.

## Condicoes principais

- Saida: imediatamente ao classificar o fluxo como `EXTERNAL`.
- Interno: apos confirmacao de chegada com foto da portaria/fachada.
- Qualquer estado: apenas quando houver necessidade operacional explicita.

No fluxo de saida, o agente pode coletar informacao minima para classificar a intencao. Ele nao deve validar autonomamente endereco, logistica, seguranca territorial ou Pix do deslocamento. Depois de `handoff_opened`, comprovante e confirmacao de Pix viram eventos operacionais do humano/sistema, nao autorizacao para o agente retomar sozinho.

## Eventos operacionais

O handoff deve ser tratado com eventos explicitos:

- `handoff_opened`: agente escalou e congelou sua atuacao;
- `handoff_acknowledged`: modelo ou operacao confirmou que assumiu;
- `handoff_released`: conversa foi devolvida formalmente para atuacao automatica.

## Desfecho do handoff

Decisao adiada: o MVP inicial nao precisa implementar agora um contrato de desfecho do handoff/atendimento, mas isso deve ser discutido antes de automatizar cliente recorrente, CRM ou metricas de fechamento.

Regra conceitual ja definida:

- handoff nao e sinonimo de fechamento;
- `handoff_opened`, `handoff_acknowledged` e `handoff_released` indicam transbordo e devolucao operacional, nao venda concluida;
- `client_status = RETURNING` deve representar cliente que ja fechou atendimento antes, nao apenas cliente que ja conversou ou passou por handoff;
- `VIP` fica como classificacao futura por recorrencia e/ou ticket, sem threshold definido neste momento;
- `BLOCKED` nao deve ser aplicado automaticamente neste corte; o sistema pode apenas sugerir revisao humana.

Quando essa discussao voltar, o sistema precisa de um desfecho operacional explicito, por exemplo `CLOSED`, `NOT_CLOSED`, `CANCELLED`, `NO_SHOW` ou equivalente. A modelagem final ainda nao esta decidida: pode ser um novo evento, metadata em evento de handoff, tabela propria de atendimento ou outro contrato operacional. A decisao deve preservar auditoria e permitir que o agente reconheca com seguranca um cliente que voltou depois de ja ter fechado.

## Pausa formal do agente

A pausa do agente nao deve depender de inferencia conversacional.

Regra do MVP:

- apos `handoff_opened`, agente fica bloqueado;
- novas mensagens sao registradas no historico;
- novas mensagens nao geram resposta automatica;
- retomada so ocorre por evento explicito de liberacao operacional.

No estado do agente deve existir `handoff_status` com valores equivalentes a:

- `NONE`
- `OPENED`
- `ACKNOWLEDGED`
- `RELEASED`

Quando `handoff_status` estiver aberto, o fluxo automatico nao responde; apenas registra entrada e encerra o ciclo.

## Canais e registro

A conversa precisa permanecer visivel para a modelo, com suporte operacional por:

- Chatwoot;
- registro do evento de escalada;
- notificacao automatica em grupo de WhatsApp operacional.

Quando `handoff_opened` for registrado, o sistema envia mensagem de aviso ao grupo via Evolution API. O envio e fire-and-forget **apos** o commit do evento, via `asyncio.create_task`: o handoff permanece vinculante mesmo que a notificacao falhe.

Em caso de falha da notificacao:

- o erro e logado de forma estruturada;
- um `UPDATE` best-effort (fora da transacao original) marca `metadata_json.notification_failed=true` no `handoff_opened` correspondente;
- **nao** e criado um tipo de evento `handoff_notification_failed`; a falha fica rastreavel pela flag e pelo log.

Configuracao por variavel de ambiente:

- `HANDOFF_NOTIFICATION_GROUP_JID`: JID do grupo operacional;
- `OPERATOR_UI_BASE_URL`: URL base da interface operacional para deep-link no texto;
- politica de mascaramento do numero/nome: flag de configuracao (nao template completo).

O template de texto da notificacao fica **fixo no codigo** da aplicacao, nao em variavel de ambiente. Templates multilinha em env var sao fragei em Portainer/Docker e dificultam review. O template base deve:

- identificar o contexto (chegada confirmada ou saida identificada);
- mostrar numero mascarado ou nome do cliente conforme a politica;
- incluir deep-link para a conversa na interface operacional.

Prioridade para liberacao do handoff:

- acao/estado no Chatwoot com webhook para o sistema;
- fallback operacional por acao manual no grupo de WhatsApp, se necessario.

Decisao do MVP: a modelo responde manualmente pelo WhatsApp do proprio numero operacional, usando o canal humano ja existente. Chatwoot fica como espelho, painel auxiliar e origem preferencial de eventos de reconhecimento/liberacao, mas nao como canal principal de digitacao da modelo.

Quando uma mensagem `fromMe` chegar apos `handoff_opened`, ela deve ser registrada como atuacao humana/manual e nao deve disparar resposta automatica. Esse evento pode mover `handoff_status` para `ACKNOWLEDGED` quando ainda estiver `OPENED`.

## Evitar resposta duplicada

Regra critica: a modelo so deve responder manualmente depois de receber o sinal de transbordo.

Isso evita colisao entre agente e humano.

O sistema deve observar:

- `handoff_status`;
- eventos de handoff;
- mensagens `fromMe`;
- status de entrega;
- acoes manuais refletidas pelo Chatwoot quando aplicavel.

## Seguranca do webhook

O webhook da Evolution API e superficie critica.

Diretrizes:

- validar credencial compartilhada antes de qualquer processamento;
- isolar trafego em rede Docker interna sempre que possivel;
- aceitar apenas origens operacionais esperadas;
- validar payload por schema;
- persistir idempotencia antes de responder 200;
- sanitizar payload bruto antes de persistir;
- remover `base64`, `jpegThumbnail` e equivalentes;
- classificar erros transitorios e permanentes;
- usar logs estruturados por tentativa.

## Contrato de entrada

Antes de chegar ao agente:

- payload deve ser validado;
- texto muito longo deve ser truncado por limite configuravel;
- truncamento deve gerar flag operacional;
- midia deve ser baixada/processada fora da janela critica quando possivel;
- evento minimo deve ser persistido para evitar perda em crash.

## Estrategia de erro e retry

Padrao geral: retry -> fallback -> degradacao controlada.

Diretrizes por componente:

- LLM principal: ate 2 retries com backoff exponencial antes de fallback ou mensagem curta segura;
- Evolution API: reconexao automatica com backoff e fila de pendencias persistida quando necessario;
- Postgres: retries curtos para falhas transitorias e alerta critico se persistirem;
- Google Calendar: retries limitados e continuidade da conversa quando agenda exigir verificacao posterior;
- Groq Whisper: 1 retry e fallback para OpenAI Whisper ou pedido curto para cliente digitar;
- Chatwoot: falhas nao interrompem conversa; erro deve ser logado e tratado assincronamente.

## Matriz de degradacao formalizada

Esta matriz e o contrato minimo de resiliencia do MVP. Cada linha deve ter teste associado em `tests/integration/` antes da producao assistida.

| Componente | Estrategia de retry | Fallback | Visibilidade |
| --- | --- | --- | --- |
| Claude Sonnet 4.6 | 2 retries, backoff exponencial | mensagem curta segura + abrir handoff se critico | trace em LangFuse + `logs.agent_executions.error_summary` |
| Evolution API (send) | retry com backoff | fila de pendencias persistida | `logs.agent_executions.retry_count` |
| Evolution API (reconnect) | reconexao automatica exponencial | estado `DISCONNECTED`/`QR_REQUIRED` em `app.integration_status` | `GET /api/status/evolution` |
| Webhook Evolution (inbound) perda de evento | idempotencia por `external_message_id` protege duplicacoes | **nao ha reconciliacao automatica no MVP; perda deve ser tratada como risco operacional monitorado** | log de saude + alerta manual |
| Postgres transitorio | retries curtos | alerta critico se persistir | log estruturado + monitoramento |
| Google Calendar (leitura/sync) | Postgres e fonte, Calendar e espelho | sync falha nao bloqueia agente | `calendar_sync_status` por slot |
| Google Calendar (write-through) | retries limitados | slot fica `PENDING`/`ERROR`, agente nao confirma como definitivo | `last_sync_error` + `GET /api/status/calendar` |
| Groq Whisper | 1 retry | OpenAI Whisper como fallback | log estruturado |
| OpenAI Whisper | 1 retry | pedir ao cliente para digitar | log estruturado |
| Chatwoot | sem retry sincrono | falha nao interrompe conversa | log assincrono |
| LangFuse | sem retry sincrono | falha nao interrompe conversa | log estruturado |
| Webhook secret invalido | nenhum | `401` e log de seguranca | log de seguranca |
| Webhook schema invalido | nenhum | `422`; **a persistencia em `app.raw_webhook_events` acontece APOS autenticacao bem-sucedida E sanitizacao minima**, para evitar poluicao com lixo nao autenticado | log estruturado |

## Latencia e SLA

Metas iniciais:

- tempo total de resposta, incluindo debounce, abaixo de 15 segundos;
- tempo de processamento interno, sem debounce, abaixo de 5 segundos;
- P95 de resposta abaixo de 20 segundos;
- processamento acima do esperado deve ficar visivel na observabilidade.

Diretrizes:

- debounce de 8 segundos faz parte intencional da experiencia;
- leituras de memoria e tools devem priorizar paralelismo quando nao houver dependencia;
- indicador de "digitando" e opcional e nao substitui correcao estrutural de latencia.

## Concorrencia por conversa

Deve existir no maximo uma execucao ativa por conversa.

O isolamento operacional deve usar `conversation_id` como chave. Isso inclui lock, fila logica, debounce, checkpoint do LangGraph, trace de execucao e consulta do estado atual da conversa.

Regras:

- conversas distintas podem ser processadas em paralelo;
- a mesma conversa nao pode ter duas execucoes simultaneas do agente;
- novas mensagens da mesma conversa durante processamento entram na fila logica da propria conversa;
- o grafo deve ser invocado com `thread_id = conversation_id`;
- `remote_jid` identifica o cliente na entrada, mas nao deve substituir `conversation_id` dentro do agente.

Em instancia unica, lock local por conversa com `asyncio.Lock` e suficiente. Em expansao futura, lock deve migrar para mecanismo distribuido, preferencialmente Postgres, antes de introduzir Redis sem necessidade medida.

## Maquina de estados do handoff

Transicoes permitidas:

- `NONE` -> `OPENED`: agente classificou condicao de escalada.
- `OPENED` -> `ACKNOWLEDGED`: modelo respondeu manualmente, Chatwoot sinalizou atendimento ou operador reconheceu.
- `ACKNOWLEDGED` -> `RELEASED`: evento explicito devolveu a conversa para automacao.
- `OPENED` -> `RELEASED`: permitido apenas por acao operacional explicita quando a escalada foi aberta por engano.
- `RELEASED` -> `OPENED`: nova condicao de escalada ocorreu depois da devolucao.

Regras:

- `OPENED` e `ACKNOWLEDGED` bloqueiam resposta automatica;
- `RELEASED` permite nova resposta automatica, mas nao apaga eventos anteriores;
- toda transicao grava linha em `app.handoff_events`;
- transicao invalida deve falhar de forma visivel na interface operacional e nos logs.
