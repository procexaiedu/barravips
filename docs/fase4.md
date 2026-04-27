# Handoff Codex — Fase 4: Evolution API / WhatsApp

## Contexto do projeto

Estamos desenvolvendo o MVP do Barra Vips. A Fase 4 conecta o canal WhatsApp via Evolution API com persistência segura, idempotência, normalização de eventos, envio de respostas e monitoramento da instância.

Premissas importantes:
- MVP com uma única modelo ativa.
- Um único número de WhatsApp.
- Atendimento reativo; sem outbound/remarketing.
- Postgres é a fonte central.
- Interface operacional própria é a fonte de visibilidade para Fernando.
- Não introduzir Redis, filas distribuídas, Celery, WebSocket, SSE ou overengineering nesta fase.
- Não fazer retry cego de envio.
- Não implementar reconexão automática agressiva.

## Estado atual conhecido

A Fase 4 já está parcialmente implementada.

Antes de codar, audite estes arquivos:
- `apps/api/src/barra_vips_api/main.py`
- testes relacionados a `test_evolution_webhook.py`
- contratos em `packages/contracts`, se existirem
- migrations relacionadas a:
  - `app.raw_webhook_events`
  - `app.integration_status`
  - `app.messages`
  - `app.conversations`
  - `app.clients`

Já existe, segundo análise anterior:
- `/webhooks/evolution`
- validação por `apikey`
- sanitização de payload
- persistência em `app.raw_webhook_events`
- idempotência por `external_message_id`
- mapeamento de `connection.update` para `app.integration_status`
- testes cobrindo parte do webhook

Não reimplemente do zero. Continue a partir do que já existe.

## Decisões confirmadas

- QR Code aparece apenas no setup inicial.
- QR Code não deve ser salvo em banco como base64.
- Usar token curto + buffer em memória para armazenar temporariamente o QR.
- Se o backend reiniciar, perder o QR é aceitável.
- A interface deve mostrar push/alerta visual quando o WhatsApp cair.
- Para o MVP, `delivery_status` deve ser apenas:
  - `PENDING`
  - `SENT`
  - `FAILED`
- Adiar `DELIVERED` e `READ`.
- Adiar job de recovery.
- Adiar fila persistida.
- Adiar retries distribuídos.
- Adiar circuit breaker completo para Fase 7.
- Reconexão deve ser manual, não automática agressiva.

## Escopo da implementação agora

### 1. QR Code end-to-end

Implementar suporte ao evento `qrcode.updated` / `QRCODE_UPDATED` da Evolution API.

Regras:
- Extrair o base64 do QR.
- Não persistir o base64 em `raw_webhook_events`.
- Sanitizar payload antes de salvar evento bruto.
- Armazenar QR temporariamente em memória com token UUID curto.
- Expiração sugerida: 60 segundos.
- Atualizar `app.integration_status.qr_code_ref` com o token.
- Nunca logar o base64.
- Limpar referência quando status virar `CONNECTED`.

Criar endpoint operator-only:

- `GET /api/integrations/evolution/qr`
  - Retorna base64 do QR atual.
  - Retorna 404 se não houver QR ativo ou se token expirou.
  - Não deve ser cacheável.

Criar endpoint operator-only:

- `POST /api/integrations/evolution/connect`
  - Chama `instance/connect` na Evolution.
  - Serve para gerar QR manualmente.
  - Não deve ficar tentando reconectar em loop.

### 2. Interface/status

Se já existir tela `/status`, adicionar bloco de conexão WhatsApp nela.
Se fizer mais sentido no código atual, criar rota `/conexao`.

A UI deve:
- Mostrar status atual da Evolution.
- Mostrar QR quando disponível.
- Fazer refresh curto, por exemplo 5s, apenas enquanto houver QR pendente.
- Mostrar orientação operacional simples:
  “Abra WhatsApp → Aparelhos conectados → Conectar aparelho → escaneie o QR”.
- Esconder QR quando status for `CONNECTED`.
- Mostrar alerta visual/push na interface quando status for desconectado ou exigir QR.

Não transformar isso em painel complexo.

### 3. Cliente Evolution outbound mínimo

Criar cliente simples, não genérico demais:

- `send_text(jid, text) -> { external_message_id, status }`
- `send_media(...) -> { external_message_id, status }`

Regras:
- Timeout explícito.
- Sem retry automático.
- Em sucesso, registrar status `SENT`.
- Em erro, registrar status `FAILED`.
- Logar erro de forma estruturada, sem vazar payload sensível.
- Não criar fila persistida de envio nesta fase.

### 4. `messages.update` simples

Implementar apenas atualização de `delivery_status` para:
- `SENT`
- `FAILED`

Adiar:
- `DELIVERED`
- `READ`

### 5. Enriquecer `/api/status/evolution`

Adicionar, se ainda não existir:
- `last_event_at`
- status atual
- se está conectado
- idade do QR atual, quando houver
- quando conectou pela última vez, se disponível

## Fora de escopo nesta etapa

Não implementar agora:
- job in-process de recovery
- fila persistida de mensagens pendentes
- retries distribuídos
- circuit breaker completo
- polling ativo para reconciliar mensagens perdidas
- `DELIVERED` e `READ`
- Redis
- Celery
- WebSocket/SSE
- reconexão automática agressiva
- refatoração ampla sem necessidade

## Critérios de aceite

- Evento `qrcode.updated` gera QR acessível na interface sem salvar base64 no banco.
- Base64 do QR não aparece em logs nem em `raw_webhook_events`.
- `GET /api/integrations/evolution/qr` retorna QR válido enquanto token estiver ativo.
- `POST /api/integrations/evolution/connect` dispara conexão manual.
- Status Evolution mostra QR pendente, conectado e erro de forma clara.
- `send_text` e `send_media` funcionam com timeout e sem retry.
- Falha de envio vira `delivery_status='FAILED'`.
- Sucesso de envio vira `delivery_status='SENT'`.
- `messages.update` não quebra o webhook.
- Testes existentes continuam passando.
- Novos testes cobrem QR, sanitização, endpoint QR, connect manual e delivery status simples.

## Forma de trabalho esperada

Antes de editar:
1. Audite o código existente.
2. Liste o que já existe e o que falta.
3. Proponha um plano pequeno de alteração.
4. Depois implemente em commits/patches pequenos.
5. Rode os testes relevantes.
6. Não faça refatoração ampla sem necessidade.