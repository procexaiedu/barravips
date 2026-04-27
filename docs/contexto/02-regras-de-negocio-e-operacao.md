# Regras de Negocio e Operacao

Este documento consolida premissas de negocio, comportamento operacional e regras que nao dependem diretamente da implementacao tecnica.

## Premissas centrais

### O agente e reativo

O agente nao inicia conversas. Ele apenas responde quando o cliente envia mensagem.

Implicacoes:

- sem outbound automatico;
- sem recuperacao automatica de conversa morta;
- sem reguas de reengajamento no MVP.

### O agente impersona a modelo

O agente deve agir como se fosse a propria modelo.

Implicacoes:

- nao se apresenta como IA;
- nao se apresenta como assistente;
- precisa sustentar persona coerente;
- deve evitar sinais de automacao;
- responde no tom esperado daquela pessoa especifica.

### Persona nao e inventada do zero

A persona e baseada em uma pessoa real ja existente na operacao, com perfil anunciado e caracteristicas conhecidas.

Implicacoes:

- o sistema deve carregar contexto real da modelo;
- nao deve criar backstory arbitrario;
- deve ter deflexoes para perguntas sensiveis ou fora do territorio seguro.

### O agente nao escala por quebra de persona

Se a conversa entra em terreno sensivel ou desconfortavel para a persona, o agente nao escala apenas por isso. Ele deve desviar, responder com naturalidade e redirecionar para o fluxo.

### Cliente suspeito continua recebendo resposta

Mesmo quando o cliente aparenta baixa intencao de compra, o agente responde normalmente. Nao ha filtro comportamental agressivo no MVP.

### Pedido fora do escopo e negado

Se o cliente pedir algo que a modelo nao faz, o agente nega diretamente, com tom curto, natural e coerente com a persona.

### Negociacao existe, mas tem limite

A negociacao pode existir, mas precisa respeitar piso configurado pela engenharia no system prompt. O exemplo discutido no contexto original foi 15%, mas o valor e por acompanhante, nao global.

Valores, descontos, duracoes e condicoes comerciais nao devem ser inventados no texto do LLM; devem vir de catalogo (`app.escort_services`, `app.escort_locations`) lido por tool. Os pisos e regras de negociacao ficam no system prompt definido pela engenharia, fora do alcance do operador.

## Disponibilidade e agenda operacional

O Google Calendar permanece como referencia visual e operacional para Fernando/modelo. Para o agente e para o sistema, a leitura de disponibilidade deve acontecer pelo Postgres, por meio de uma tabela local de slots sincronizada.

Regra canonica:

- Calendar e referencia visual humana, nao fonte de leitura do sistema;
- Postgres e fonte de leitura do agente, backend e interface;
- `check_availability` consulta somente Postgres;
- bloqueios feitos pelo sistema devem usar logica write-through: gravar em transacao no Postgres, validar colisao no banco (via `EXCLUDE USING gist` em `app.schedule_slots`) e refletir no Calendar de forma idempotente.

### AUTO_BLOCK pelo agente

O bloqueio automatico durante negociacao (para impedir que o horario seja oferecido simultaneamente a outro cliente) deve ser executado pelo proprio agente via tool dedicada, nao como acao operacional humana. A tool cria slot `source=AUTO_BLOCK` com TTL curto; se a conversa evoluir para `CONFIRMADO`, o slot permanece; se expirar ou o cliente recusar, o slot e liberado.

Se o Calendar estiver lento ou indisponivel, o bloqueio local permanece como protecao com status de sincronizacao pendente/erro. O agente pode continuar a conversa, mas nao deve confirmar o horario como definitivo antes da sincronizacao ou revisao humana.

Quando um horario estiver bloqueado, o agente deve usar desculpas curtas, naturais e contextualizadas por faixa de horario, sem depender de uma tabela fixa rigida.

Exemplos de racional:

- madrugada: balada ou indisponibilidade no momento;
- manha: descanso ou comecando o dia;
- fim de tarde: salao ou preparacao;
- noite: compromisso compativel com a persona;
- outros horarios: justificativa curta e coerente.

## Horario de operacao

A diretriz inicial do MVP e operar 24/7.

Justificativas:

- o custo marginal de responder fora do horario comercial e baixo;
- perder lead por ausencia de resposta e mais caro;
- o tom da persona pode variar por contexto temporal;
- o sistema nao deve bloquear atendimento automatico por horario no MVP.

Observacao da ata: a operacao humana descrita tinha horarios praticos diferentes por contexto, com maior restricao em dias uteis e operacao mais ampla em fins de semana e eventos. A diretriz consolidada para o agente no MVP e mais simples: responder 24/7, sem prometer disponibilidade da modelo fora das regras de agenda.

## Escala, sazonalidade e operacao humana

A ata registra uma operacao sazonal:

- baixa temporada: 4 a 8 modelos ativas;
- alta temporada: 10 a 15 modelos ou mais;
- picos ligados a carnaval, Rock in Rio, Reveillon e eventos grandes no Rio de Janeiro;
- cada vendedor gerencia aproximadamente 3 a 5 modelos, variando por experiencia;
- a gestao manual por telefones fisicos e uma dor central de escala.

No MVP, esses numeros servem como contexto de produto e roadmap, nao como requisito imediato de suporte multi-modelo.

## Sinais comportamentais de qualidade do cliente

A ata registra sinais usados por Fernando para diferenciar clientes com maior ou menor chance de fechar.

Sinais de maior intencao:

- cliente educado;
- conversa objetiva;
- perguntas sobre endereco, valor, disponibilidade e condicoes praticas;
- baixa vulgaridade;
- decisao orientada a agenda.

Sinais de baixa intencao ou risco:

- excesso de emojis;
- insistencia em conteudo explicito;
- comentarios agressivos ou vulgares;
- comportamento de teste sem avancar para decisao.

Decisao consolidada do MVP: esses sinais podem influenciar conducao, tom e necessidade de cautela, mas nao devem virar filtro agressivo automatico. Cliente suspeito continua recebendo resposta, dentro das regras de seguranca e linguagem.

## Local e contexto operacional da modelo

O local ativo da modelo nao deve ser texto estatico embutido no prompt.

Regras:

- deve existir versao operacional ativa do local por modelo;
- quando endereco ou flat mudar, a operacao atualiza essa versao;
- o agente consulta o dado apenas quando o fluxo exigir;
- o atendimento deve registrar snapshot do contexto usado na confirmacao, quando aplicavel.

No MVP, a manutencao do local atual e responsabilidade humana autorizada, nao da IA.

## Onboarding de modelo

Toda nova modelo deve passar por checklist minimo antes de entrar em producao:

- cadastro da identidade operacional;
- persona real consolidada;
- idiomas suportados;
- regras comerciais;
- agenda conectada;
- refresh token OAuth2 do Google Calendar gerado, armazenado em secret e testado;
- midia revisada e aprovada;
- contexto operacional minimo publicado;
- testes simulados minimos antes da ativacao.

## Offboarding de modelo

Quando uma modelo sair da operacao:

- ela deixa de receber novos atendimentos automaticos;
- suas midias deixam de ser elegiveis para uso;
- o historico e preservado para rastreabilidade e auditoria;
- acessos operacionais sao revogados;
- politicas futuras de retencao e anonimizacao podem ser aplicadas sem apagar historico imediatamente.

## Politica de dados e retencao

Regras iniciais do MVP:

- historico bruto de conversa: manter por 90 dias; depois resumir e remover mensagens raw quando apropriado;
- comprovantes em imagem: manter por 30 dias; depois excluir imagem e preservar apenas metadados essenciais;
- payload bruto de webhook em `app.raw_webhook_events`: manter por 30 dias;
- `messages.payload_json` deve conter somente metadados operacionais normalizados, nao o payload bruto da Evolution;
- dados cadastrais de cliente: manter enquanto houver atividade; anonimizar se inativo por mais de 12 meses;
- checkpoints do LangGraph: manter por 7 dias com limpeza automatica;
- registros em `logs.agent_executions`: manter por 30 dias, sem conteudo bruto de conversa;
- logs e traces operacionais: manter por 30 dias, com rotacao definida.

Deve existir job periodico de limpeza e anonimizacao. A retencao precisa ser automatica, nao dependente de acao manual recorrente.
