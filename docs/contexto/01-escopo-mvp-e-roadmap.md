# Escopo MVP e Roadmap

Este documento define o escopo do MVP, os limites explicitos do projeto e as expansoes planejadas para fases futuras.

O agente continua sendo parte central do produto, mesmo que a sequencia de implementacao comece por backend, banco, contratos de dados e read models.

## Dentro do escopo

- 1 modelo.
- 1 numero de WhatsApp ja existente.
- Atendimento reativo via WhatsApp.
- Impersonacao da modelo.
- Reconhecimento de cliente recorrente por numero.
- Historico de conversa por cliente.
- Consulta de disponibilidade.
- Negociacao dentro de limites configuraveis.
- Fluxo interno, quando o cliente vai ate a modelo.
- Fluxo externo/saida, com handoff imediato quando a modelo precisa ir ate o cliente.
- Registro ou analise de comprovante por imagem como apoio operacional apos handoff.
- Transbordo para a modelo.
- Registro operacional minimo.
- Interface operacional propria para Fernando.
- Read models no backend consumindo Postgres.
- Observabilidade minima com traces, logs e metricas.
- Testes e evals basicos antes da producao assistida.

## Fora do escopo

- Multiplas modelos em paralelo.
- Multiplos numeros com orquestracao avancada.
- CRM completo dos 15 mil contatos.
- Remarketing.
- Outbound automatico.
- IA administrativa madura.
- Integracao bancaria formal.
- Automacoes complexas de gestao.
- Expansao para outros nichos do negocio.
- RAG/base de conhecimento como componente do MVP.
- Supabase Realtime, WebSocket ou SSE como requisito inicial da interface.
- MinIO/S3 como dependencia inicial para midia.
- Redis para debounce, locks ou estado transitorio no MVP.
- IA nativa do Chatwoot.
- Feature flags para desligar tools individuais.
- Playground de IA com trace em tempo real dentro do frontend operacional.

## Sequencia de implementacao recomendada

1. Consolidar backend, banco, contratos de dados e read models.
2. Desenvolver a interface operacional de Fernando sobre esses dados.
3. Integrar o agente sobre a base ja estruturada.
4. Conectar integracoes externas.
5. Endurecer operacao, observabilidade, testes e criterios de producao assistida.

Essa sequencia nao significa deixar o agente para depois. O agente deve orientar desde o inicio o desenho dos estados, eventos, entidades, read models e contratos.

## Criterio minimo para producao assistida

O MVP so deve ser exposto a uso real assistido quando:

- o fluxo interno estiver estavel;
- o fluxo de saida estiver estavel;
- o fluxo de saida abrir handoff imediato ao classificar `EXTERNAL`;
- o handoff nao gerar duplicidade de resposta;
- os testes criticos estiverem passando;
- a operacao tiver visibilidade suficiente para intervir rapidamente;
- existirem registros operacionais para reconstruir decisoes do agente;
- falhas de integracao tiverem degradacao controlada.

## Roadmap futuro

Fases posteriores podem incluir:

- multiplas modelos;
- multiplos numeros;
- IA administrativa por grupo/WhatsApp;
- CRM mais robusto;
- remarketing;
- analise automatica de conversas de vendedores;
- site proprio da agencia;
- plataforma propria de turismo de luxo;
- ensaios fotograficos com IA e tratamento de metadados;
- outbound automatico;
- expansao para outros nichos do ecossistema do negocio;
- migracao de midia para MinIO/S3;
- migracao futura para WhatsApp Cloud API;
- RBAC ou autenticacao mais granular;
- filas, locks distribuidos ou Redis caso multiplas instancias exijam;
- views materializadas se as listagens operacionais ficarem lentas.

## Ambiguidade a resolver

O documento original usa a expressao "um unico fluxo funcional de ponta a ponta", mas tambem exige estabilidade do fluxo interno e do fluxo de saida antes da producao assistida. A leitura recomendada e que o MVP tem uma operacao unica, mas precisa suportar dois caminhos operacionais principais: interno e saida.

## Fases registradas na ata

A ata original registrou uma sequencia macro de evolucao:

1. Validar com uma modelo de teste.
2. Replicar para outras modelos.
3. Construir site proprio.
4. Expandir para turismo, restaurantes, passagens, hospedagem e outros servicos.

O contexto consolidado atual preserva essa direcao, mas estreitou o MVP para uma unica modelo ativa e uma unica operacao confiavel antes de qualquer escala.
