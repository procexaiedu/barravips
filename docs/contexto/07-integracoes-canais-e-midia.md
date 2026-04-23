# Integracoes, Canais e Midia

Este documento consolida as dependencias externas, canal WhatsApp, audio, agenda, Chatwoot e tratamento de midia.

## Canal principal

O canal principal do MVP e WhatsApp, via Evolution API, usando inicialmente um numero ja existente.

A Evolution API atende ao requisito de preservar o numero atual, mas deve ser tratada como integracao funcional e operacionalmente fragil.

Restricao operacional da ata: numeros de WhatsApp sofrem risco de banimento por alto volume e por conteudo explicito. A mitigacao principal no MVP e combinar linguagem velada, validacao de saida, monitoramento de conexao e fallback operacional.

Mitigacoes:

- monitoramento de conexao;
- reconexao automatica com backoff exponencial;
- fallback operacional humano se indisponivel por janela relevante;
- cliente HTTP com timeout explicito;
- reutilizacao de conexao quando possivel;
- fechamento limpo no shutdown;
- planejamento de migracao futura para WhatsApp Cloud API se a operacao exigir estabilidade institucional maior.

## Webhook da Evolution API

Eventos minimos:

- `messages.upsert` para texto, imagem e audio;
- `connection.update` para monitoramento da conexao;
- `messages.update` para status de entrega e leitura quando util.

Regras:

- validar credencial compartilhada no header, como `apikey`, antes de processar;
- isolar trafego em rede Docker interna sempre que possivel;
- aceitar apenas origens operacionais esperadas;
- registrar `message_id` ja processados para idempotencia;
- validar payload com schema estruturado;
- sanitizar payload bruto antes de salvar logs;
- remover `base64`, thumbnails e campos pesados ou sensiveis;
- responder 200 apenas depois da persistencia minima de idempotencia e registro do evento;
- processamento pesado pode ser assincrono apos persistencia minima.

Contrato minimo para `messages.upsert`:

```json
{
  "event": "messages.upsert",
  "instance": "barra-vips-main",
  "data": {
    "key": {
      "remoteJid": "5521999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "MESSAGE_ID"
    },
    "pushName": "Cliente",
    "messageType": "conversation",
    "message": {
      "conversation": "texto do cliente"
    },
    "messageTimestamp": 1710000000
  }
}
```

Contrato interno normalizado, depois da validacao:

```json
{
  "trace_id": "uuid",
  "provider": "evolution",
  "event_name": "messages.upsert",
  "instance": "barra-vips-main",
  "remote_jid": "5521999999999@s.whatsapp.net",
  "external_message_id": "MESSAGE_ID",
  "from_me": false,
  "message_type": "text",
  "text": "texto do cliente",
  "media": null,
  "received_at": "2026-04-17T21:00:00Z",
  "raw_event_id": "uuid"
}
```

Payload malformado:

- se autenticacao falhar, responder `401`;
- se schema minimo falhar, persistir evento sanitizado quando possivel, marcar `FAILED` ou `SKIPPED` e responder `200` para evento nao recuperavel da Evolution;
- se persistencia minima falhar, responder erro para permitir retry externo;
- nunca enviar payload malformado ao agente.

Eventos `connection.update` devem atualizar `app.integration_status`. Diferente da Joana, nao devem ser apenas descartados por falta de `remoteJid`.

## Envio de mensagens pelo WhatsApp

Observacao de nomenclatura: o documento original usa "envio outbound pelo WhatsApp", mas isso nao significa prospeccao ativa. No MVP, o agente continua reativo. Aqui, "envio" significa resposta ou midia enviada ao cliente dentro de conversa existente.

Diretrizes:

- `sendText` e `sendMedia` nao devem fazer retry cego em erro transitorio, para evitar duplicidade visivel;
- falha de envio deve ser registrada e tratada como erro operacional;
- resposta persistida deve registrar `delivery_status`, iniciando em `PENDING`;
- eventos de loopback/status da Evolution devem atualizar status para `SENT`, `DELIVERED`, `READ` ou erro equivalente;
- se loopback nao chegar, mensagem enviada ainda deve aparecer no historico com status pendente ou incerto;
- midias sensiveis devem respeitar opcoes permitidas pela Evolution, como `viewOnce`, quando a regra exigir.

## Google Calendar

Google Calendar permanece como referencia visual e operacional da agenda, mas o agente nao consulta sua API em tempo real.

Diretrizes:

- manter tabela local de `slots` no Postgres;
- sincronizacoes periodicas atualizam o cache local;
- `check_availability` consulta somente Postgres;
- `block_slot` grava em Postgres em transacao e reflete no Calendar de forma idempotente;
- conversa deve continuar funcional diante de latencia temporaria do Google, mas sem confirmacao definitiva de horario enquanto a sincronizacao estiver pendente;
- checagem de colisao deve usar comparacao de intervalo no banco;
- para calendario pessoal da modelo, usar OAuth2 com `refresh_token` armazenado como secret;
- sincronizacao incremental deve persistir `nextSyncToken`;
- tratar `410 Gone` com resync completo;
- atualizacoes parciais de evento devem preferir `patch`;
- retries de criacao de evento devem ser idempotentes para nao duplicar bloqueios;
- falhas de reflexo no Calendar devem ficar visiveis em `calendar_sync_status` e em status operacional.

## Chatwoot

Chatwoot permanece no escopo do MVP com papel delimitado:

- espelho de mensagens de entrada e saida;
- painel de visibilidade para operacao;
- registro de handoff e intervencoes;
- origem preferencial do evento `handoff_released` por webhook de acao/estado operacional.

Chatwoot nao substitui a interface operacional propria de Fernando e nao e canal principal de resposta da modelo no MVP. IA nativa do Chatwoot nao deve ser usada.

## Audio do cliente

Audios recebidos devem ser transcritos e repassados ao agente como texto.

Diretrizes:

- usar Groq Whisper como provedor padrao por custo e velocidade;
- fallback preferencial para OpenAI Whisper API;
- clientes de transcricao devem ter timeout explicito;
- falha de transcricao retorna sinal estruturado para o agente pedir texto ao cliente;
- nao misturar falha como string magica no conteudo;
- nao introduzir segundo LLM apenas para limpar transcricao;
- nao adicionar FFmpeg/chunking no MVP, salvo se audios longos reais se tornarem problema medido.

## Mensagens picotadas e debounce

O MVP nao deve usar Redis para juntar mensagens curtas. O buffer deve ser implementado em codigo com debounce por conversa usando `asyncio`.

Decisao de isolamento: todo buffer, timer, lote pendente e lock deve ser indexado por `conversation_id`. O `remote_jid` serve para resolver o cliente; depois da persistencia minima, a aplicacao deve trabalhar com `conversation_id` como chave canonica.

Diretrizes:

- janela inicial recomendada de 8 segundos, configuravel;
- novas mensagens dentro da janela reiniciam timer;
- lote consolidado segue para processamento unico;
- limite maximo de mensagens acumuladas por conversa;
- midia operacionalmente relevante pode forcar flush imediato;
- midia sem legenda deve preservar marcador explicito;
- no maximo uma execucao ativa por conversa;
- novas mensagens durante processamento entram na fila logica da conversa;
- em instancia unica, `asyncio.Lock` por conversa e suficiente;
- conversas distintas podem processar em paralelo, desde que cada uma tenha lock proprio;
- no futuro, com multiplas instancias, lock deve migrar para mecanismo distribuido como `pg_advisory_lock`.

Redis fica fora do MVP. So deve entrar se houver necessidade real de multiplas instancias, filas distribuidas, cache de sessao distribuido ou locks distribuidos que o Postgres nao resolva de forma aceitavel.

Pratica copiada da Joana com ajuste:

- manter `Map`/dicionario em memoria por conversa enquanto houver instancia unica;
- usar estruturas equivalentes a `buffers[conversation_id]` e `locks[conversation_id]`;
- juntar textos com quebra de linha para preservar ordem;
- atualizar metadados pelo ultimo payload do lote;
- forcar flush ao receber midia;
- impor limite de lote;
- nao mutar o payload bruto salvo, apenas criar um objeto normalizado consolidado;
- registrar no Postgres quais mensagens de entrada formaram o lote processado.

Config inicial:

- `DEBOUNCE_WINDOW_SECONDS=8`
- `DEBOUNCE_MAX_MESSAGES=10`
- `MAX_INBOUND_TEXT_CHARS=4000`
- `PROCESSING_LOCK_SCOPE=conversation_id`

## Banco de midia

No MVP:

- arquivos ficam em filesystem local/volume Docker local;
- Postgres guarda catalogo, metadados, aprovacao e status operacional;
- aplicacao resolve caminho fisico pelo identificador no banco;
- interface de acesso deve permitir migracao futura para MinIO/S3 sem reescrever logica do agente.

Cada midia relevante deve ter pelo menos:

- modelo associada;
- tipo de arquivo;
- categoria;
- caminho interno de armazenamento;
- status de aprovacao;
- restricoes de envio;
- timestamps de criacao e atualizacao.

## Regras de envio e selecao de midia

Tipos relevantes:

- fotos da modelo;
- videos de visualizacao unica;
- foto de fachada/portaria recebida do cliente;
- comprovante por imagem;
- audios.

Regras:

- fotos e videos da modelo vem de banco pre-definido por modelo;
- agente so envia foto ou video quando cliente pedir explicitamente;
- videos devem sustentar narrativa de material pessoal e contextual;
- escolha de midia nao deve ficar livre no texto do agente;
- selecao deve ser deterministica e registrada em tool propria.

Ordem de selecao:

1. Filtrar por modelo, tipo solicitado e midia aprovada.
2. Se houver contexto util, filtrar tambem por categoria.
3. Excluir midias ja enviadas para aquele cliente.
4. Entre elegiveis, priorizar a menos usada globalmente.
5. Se todas ja foram enviadas, repetir a mais antiga.

Catalogo pode permitir categorias como:

- casual;
- elegante;
- sensual leve;
- ambiente.

## Publicacao de midia

No MVP, entrada de novas midias e manual:

1. Operacao adiciona arquivo ao acervo local.
2. Operacao revisa e aprova.
3. Somente depois a midia fica elegivel para uso automatico.

MinIO/S3 e URLs assinadas ficam para futuro se filesystem local virar gargalo operacional.
