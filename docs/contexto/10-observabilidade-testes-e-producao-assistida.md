# Observabilidade, Testes e Producao Assistida

Este documento define observabilidade minima, estrategia de testes/evals e criterios para expor o MVP a uso real assistido.

## Observabilidade minima

O MVP precisa permitir reconstruir decisoes do agente, tools chamadas, tempo gasto e resultado de cada etapa critica.

Metricas minimas:

- tempo ate primeira resposta;
- latencia total por conversa;
- latencia por etapa critica;
- taxa de escalada por tipo de fluxo;
- taxa de colisao entre resposta automatica e atuacao humana;
- taxa de comprovante aceito, incerto e invalido;
- taxa de reenvio de comprovante;
- taxa de confirmacao por fluxo;
- taxa de intervencao corretiva humana;
- taxa de falha/retry na validacao de saida;
- tokens e custo por conversa;
- falhas de webhook;
- retries de integracao;
- mensagens descartadas por idempotencia.

## Stack observavel

- LangFuse self-hosted como padrao do MVP para traces, spans, tokens, custo e erros.
- Logs estruturados no aplicativo para correlacao com traces.
- `trace_id` nasce na entrada do webhook.
- `trace_id` deve ser propagado por buffer, agente, tools e envio WhatsApp.
- Traces devem carregar tags de ambiente, como `dev`, `test` ou `prod`.
- Deve existir registro operacional fino no Postgres, correlacionado ao LangFuse por `trace_id`.
- Nao duplicar conteudo bruto de conversa em logs se LangFuse ja cobre tracing.

Tabela operacional recomendada:

- `logs.agent_executions`
- campos: `conversation_id`, `trace_id`, `status`, `duration_ms`, `tool_count`, `retry_count`, `fallback_used`, `created_at`

Status minimo:

- `SUCCESS`: execucao completa;
- `PARTIAL`: houve fallback ou degradacao controlada;
- `FAILED`: nenhuma resposta automatica segura foi enviada.

## Sistema de testes

Antes de producao assistida, o projeto deve possuir:

- suite de conversas simuladas cobrindo fluxo interno e saida;
- cenarios de negociacao com piso;
- cenarios de cliente recorrente;
- cenarios multilingues em portugues, ingles e espanhol;
- testes de prompt injection;
- testes de handoff;
- testes de comprovante ilegivel;
- testes de divergencia de valor.
- testes de saida devem validar que `EXTERNAL` abre handoff imediato e bloqueia resposta automatica posterior.

## Estrategia de testes

- Testes do agente devem invocar o grafo diretamente, com `conversation_id` isolado.
- Testes do agente devem verificar que o grafo recebe `thread_id = conversation_id`.
- Testes do agente nao devem depender do webhook nem do debounce.
- Testes de integracao devem passar por webhook, persistencia, idempotencia e debounce.
- Janela de debounce deve ser reduzida por configuracao de teste.
- Conversas multi-turno devem enviar apenas a nova mensagem do cliente em cada turno.
- Testes multi-turno devem provar que memoria e checkpoint funcionam.
- Testes de concorrencia devem provar isolamento entre dois `remote_jid` distintos processados ao mesmo tempo.
- Testes de debounce devem provar que mensagens rapidas do mesmo `remote_jid` viram um unico lote e uma unica execucao do agente.
- Asserts deterministicos devem priorizar estado estruturado e trace de tool calls.
- Texto exato do LLM nao deve ser assert principal.
- Smoke tests de webhook devem validar payloads compativeis com Evolution.
- Smoke tests devem provar persistencia e ausencia de duplicidade.

Tipos de teste copiados/adaptados da Joana:

- Tipo A, injecao massiva de webhooks: valida recebimento, autenticacao, persistencia, idempotencia, debounce reduzido e ausencia de crash. Diferente da Joana, nao basta olhar logs manualmente; o teste deve consultar `app.raw_webhook_events`, `app.messages` e `logs.agent_executions`.
- Tipo B, conversa multi-turno: envia apenas a nova mensagem por turno contra o grafo ou endpoint de teste, provando memoria, checkpoint e estado estruturado.
- Tipo C, concorrencia entre conversas: envia eventos simultaneos de dois `remote_jid` diferentes e prova que eles geram `conversation_id`, `thread_id`, buffers, locks e traces separados.
- Tipo D, debounce por conversa: envia varias mensagens rapidas do mesmo `remote_jid` e prova que elas formam um lote unico, com apenas uma execucao do agente para aquele `conversation_id`.
- Tipo E, eval offline: usa LLM-as-judge com rubrica por cenario, sem bloquear o caminho sincrono de producao.
- Tipo F, regressao de contratos: valida schemas JSON/Pydantic para Evolution, Chatwoot e read models.

Asserts recomendados:

- estado final da conversa;
- `flow_type`;
- `handoff_status`;
- tools chamadas no trace;
- mensagens enviadas ou bloqueadas;
- status de entrega persistido;
- eventos de handoff gerados;
- `thread_id` igual ao `conversation_id`;
- ausencia de mistura de mensagens entre conversas simultaneas;
- ausencia de termos internos na resposta final;
- ausencia de resposta automatica quando handoff esta aberto.

## Evals LLM-as-judge

Evals devem rodar preferencialmente offline/CI.

Diretrizes:

- usar rubricas por cenario;
- usar modelo auxiliar;
- passar contexto operacional separado da resposta;
- incluir `expected_amount`, regras de preco, idioma esperado e trace de tools;
- nao colocar evaluator-optimizer no caminho sincrono sem evidencia de ganho que compense latencia.

Rubricas minimas:

- persona natural, discreta e sem cara de bot;
- resposta curta e direcional;
- nao expor termos internos como webhook, tool, LangGraph, banco, prompt ou trace;
- nao prometer disponibilidade sem checar agenda;
- nao fechar valor abaixo do piso configurado;
- nao tratar fluxo `EXTERNAL` como se fosse seguro sem humano;
- pedir texto quando audio falhar, sem mencionar erro tecnico;
- negar pedido fora do escopo com naturalidade;
- manter idioma do cliente quando for portugues, ingles ou espanhol.

## Criterio minimo de pronto

O MVP so deve ser exposto a uso real assistido quando:

- fluxo interno estiver estavel;
- fluxo de saida estiver estavel;
- fluxo de saida estiver abrindo handoff imediato sem resposta duplicada;
- handoff nao gerar duplicidade;
- testes criticos estiverem passando;
- operacao tiver visibilidade suficiente para intervir rapidamente;
- Evolution API tiver monitoramento de conexao;
- falhas de envio estiverem registradas e visiveis;
- logs/traces permitirem depurar decisoes do agente;
- politica minima de retencao estiver ativa;
- prompts e regras estiverem versionados.

## Producao assistida

Producao assistida significa uso real com capacidade humana de supervisao, intervencao e rollback.

Durante essa fase, medir especialmente:

- qualidade da persona sob pressao;
- tempo de resposta percebido;
- colisao agente/humano;
- comprovantes `UNCERTAIN`;
- negociacoes no piso;
- uso de memoria de cliente recorrente;
- falhas da Evolution API;
- custo por conversa;
- necessidade real de Redis, filas, views materializadas ou armazenamento externo de midia.

## Calibracao com experiencia real

A ata registra uma recomendacao pratica: Fernando deveria experimentar o proprio atendimento como cliente para observar o que funciona e o que nao funciona nas respostas atuais. Essa experiencia pode virar material de calibracao, desde que seja transformada em fixtures, rubricas ou exemplos anonimizados.

Usos recomendados:

- criar exemplos negativos de conversa;
- identificar pontos de abandono;
- calibrar tom velado;
- validar objetividade e direcionalidade;
- gerar cenarios de eval para cliente serio, cliente vulgar, cliente desconfiado e cliente indeciso.
