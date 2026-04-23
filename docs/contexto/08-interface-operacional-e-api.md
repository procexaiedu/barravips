# Interface Operacional e API

Este documento especifica a interface operacional propria para Fernando e os read models do backend.

## Papel da interface

A interface operacional de Fernando deve ser simples, protegida e orientada a leitura rapida do estado real da operacao.

Ela deve:

- dar visibilidade operacional centralizada;
- permitir consulta de conversas, agenda, handoffs e registros relevantes;
- servir como camada principal de leitura para Fernando no dia a dia;
- consumir dados do Postgres por backend/read models;
- nao depender de Google Calendar, Evolution API ou Chatwoot como fonte primaria de leitura.

Fernando e gestor da operacao, referencia de negocio e usuario principal da interface. A escalada operacional do atendimento vai para a modelo, nao para Fernando.

## Fonte de dados

Regra arquitetural:

- Postgres e a base central de dados operacionais consumida pela interface;
- frontend nao acessa banco diretamente;
- frontend consome endpoints do backend;
- integracoes externas alimentam ou refletem eventos do sistema, mas nao compoem diretamente o estado principal exibido.

## Diretrizes de API

- Endpoints de lista devem usar paginacao explicita com envelope consistente, como `{ items, total, page, page_size }`.
- Listas operacionais devem evitar N+1.
- Consultas devem trazer dados de cliente, conversa e ultima mensagem em joins ou agregacoes adequadas.
- Lista de conversas deve ter indice compativel com `conversation_id` e `created_at DESC`.
- `GET /api/conversations` deve retornar o suficiente para montar a lista sem chamadas adicionais por item.
- `GET /api/conversations/{id}` deve retornar conversa, mensagens recentes, estado, handoff e metadados necessarios para acao operacional.
- `GET /api/status/evolution` deve ler ultimo estado persistido de conexao da Evolution.
- `GET /api/media/{id}/content` deve servir midia do filesystem local via backend autenticado.
- O backend deve resolver caminho da midia pelo banco, nunca por path vindo do cliente.
- Uploads de midia devem validar tipo e tamanho antes de escrever em disco.

## Endpoints minimos do MVP

Todos os endpoints operacionais usam `OPERATOR_API_KEY`. Webhooks de integracao usam segredo proprio e nao compartilham a autenticacao da interface.

### Conversas

- `GET /api/conversations?status=&handoff_status=&q=&page=&page_size=`
- `GET /api/conversations/{conversation_id}`
- `POST /api/conversations/{conversation_id}/handoff/release`
- `POST /api/conversations/{conversation_id}/handoff/acknowledge`

Envelope de lista:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 25
}
```

Item minimo de conversa:

```json
{
  "id": "uuid",
  "client": {
    "id": "uuid",
    "display_name": "Cliente",
    "whatsapp_jid": "5521999999999@s.whatsapp.net"
  },
  "model": {
    "id": "uuid",
    "display_name": "Modelo"
  },
  "state": "NEGOCIANDO",
  "flow_type": "INTERNAL",
  "handoff_status": "NONE",
  "pending_action": null,
  "awaiting_input_type": null,
  "last_message": {
    "direction": "INBOUND",
    "message_type": "text",
    "content_preview": "Queria ver horario hoje",
    "created_at": "2026-04-17T21:00:00Z",
    "delivery_status": null
  },
  "last_message_at": "2026-04-17T21:00:00Z"
}
```

Detalhe minimo:

```json
{
  "conversation": {},
  "messages": [],
  "handoff_events": [],
  "media": [],
  "agent_execution": {
    "trace_id": "uuid",
    "status": "SUCCESS",
    "duration_ms": 3200,
    "tool_count": 2
  }
}
```

### Agenda

- `GET /api/schedule/slots?from=&to=&status=`
- `POST /api/schedule/slots/block`
- `POST /api/schedule/sync`

### Midias

- `GET /api/media?model_id=&type=&approval_status=&page=&page_size=`
- `POST /api/media`: upload valida MIME real do arquivo (nao apenas extensao ou `Content-Type` declarado) e tamanho maximo configuravel antes de escrever em disco
- `PATCH /api/media/{media_id}`: semantica de patch parcial; apenas campos explicitamente enviados sao atualizados, demais permanecem inalterados
- `GET /api/media/{media_id}/content`

### Status

- `GET /api/status/evolution`
- `GET /api/status/calendar`
- `GET /api/status/health`

### Webhooks

- `POST /webhooks/evolution`
- `POST /webhooks/chatwoot`

Webhooks nao pertencem ao namespace `/api` operacional para deixar autenticacao, logs e rate limits separados.

## Diretrizes de frontend

- Frontend consome apenas backend/read models.
- MVP nao precisa de WebSocket, SSE ou Supabase Realtime.
- Polling de 10 a 30 segundos e suficiente para conversas, handoffs, agenda e status Evolution.
- Telas de lista devem funcionar com dados vazios sem quebrar.
- Mensagens inbound e outbound devem ser visualmente diferenciadas.
- Deve haver rotulo claro para cliente versus modelo/agente.

Rotas recomendadas:

- `conversas`
- `conversas/[id]`
- `agenda`
- `handoffs`
- `modelos`
- `midias`
- `status`

## Autenticacao operacional

O backend operacional nao deve ficar publico sem autenticacao.

Diretriz inicial do MVP:

- como ha um unico usuario operacional, a opcao simples aceitavel e `OPERATOR_API_KEY` em header protegido por secret;
- a chave e **server-only**: ela nunca deve aparecer em codigo que roda no browser. O frontend Next.js consome apenas suas proprias API routes (ou Server Components), que atuam como proxy e injetam o header `OPERATOR_API_KEY` no servidor antes de chamar o backend;
- o backend configura CORS com `allow_credentials=False`, ja que a autenticacao nao usa cookies nem credenciais de sessao;
- Supabase Auth ou RBAC completo ficam para fase posterior;
- autenticacao do webhook da Evolution e separada da autenticacao da interface.

## Read models recomendados

Os read models devem favorecer operacao rapida, nao normalizacao pura para a tela.

Conversas:

- cliente;
- modelo;
- ultima mensagem;
- estado atual;
- `flow_type`;
- `handoff_status`;
- `pending_action`;
- data da ultima atividade;
- indicador de comprovante/chegada pendente;
- status de envio recente quando houver.

Detalhe da conversa:

- mensagens recentes;
- resumo incremental;
- estado estruturado;
- metadados de cliente;
- eventos de handoff;
- midias relevantes;
- traces ou links operacionais quando disponiveis.

Agenda:

- slots por periodo;
- origem do slot;
- status;
- status de sincronizacao com Calendar;
- referencia externa do Calendar;
- ultima sincronizacao.

Midias:

- modelo;
- categoria;
- tipo;
- aprovacao;
- restricoes;
- historico resumido de uso.

Status:

- conexao Evolution;
- ultima sincronizacao Calendar;
- pendencias ou erros recentes de sincronizacao Calendar;
- saude basica do backend;
- status observavel de jobs essenciais.

## Relacao com Chatwoot

Chatwoot fornece espelho e visibilidade complementar, mas nao substitui a interface propria.

A interface propria deve ser a referencia primaria para Fernando porque:

- le diretamente do Postgres;
- reflete o estado operacional consolidado;
- nao depende de interpretacao de uma ferramenta externa;
- pode expor read models desenhados para a operacao Barra Vips.

## Intervencao operacional

O painel proprio pode liberar ou reconhecer handoff, mas nao deve virar canal principal de conversa no MVP.

A digitacao manual da modelo acontece pelo WhatsApp do proprio numero operacional. Nem o painel proprio nem o Chatwoot devem ser tratados como canal principal para a modelo responder o cliente no MVP.

Intervencoes permitidas:

- reconhecer que a modelo assumiu (`handoff_acknowledged`);
- liberar a automacao depois da devolucao formal (`handoff_released`);
- marcar nota operacional interna;
- revisar status de comprovante ou chegada;
- consultar trace resumido de uma execucao.

Intervencoes fora do MVP:

- operador Fernando enviar mensagem manual como se fosse a modelo;
- playground de IA com trace em tempo real para uso operacional;
- edicao livre de prompt em producao pelo painel.
