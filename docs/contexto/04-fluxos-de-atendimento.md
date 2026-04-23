# Fluxos de Atendimento

Este documento descreve os fluxos funcionais do atendimento pelo WhatsApp e os gatilhos operacionais que mudam o estado da conversa.

## Determinacao do tipo de fluxo

A classificacao entre fluxo interno e fluxo de saida acontece durante a conversa, quando houver informacao suficiente.

Regras:

- se o cliente quiser ir ate a modelo, `flow_type` deve ser `INTERNAL`;
- se o cliente quiser que a modelo va ate ele, `flow_type` deve ser `EXTERNAL`;
- enquanto isso nao estiver claro, `flow_type` permanece `UNDETERMINED`;
- se necessario, o agente pergunta de forma natural para destravar a classificacao.

## Perfis por urgencia e disponibilidade

A ata original identificou quatro perfis de cliente por urgencia. Eles nao substituem `flow_type`; sao um eixo complementar para conduzir agenda e expectativa.

1. Imediato: cliente quer agora, esta perto ou consegue chegar em poucos minutos.
2. Agendado com antecedencia: cliente combina para outro horario ou outro dia.
3. Horario indefinido: cliente nao consegue marcar hora fixa e diz que avisara quando puder.
4. Horario estimado: cliente sabe aproximadamente quando estara disponivel.

Esses perfis devem orientar perguntas, follow-up permitido dentro da conversa ativa e estado operacional, sem criar outbound automatico de reengajamento no MVP.

## Fluxo A: interno

Fluxo em que o cliente se desloca ate o local da modelo.

Sequencia esperada:

1. Cliente entra em contato pelo WhatsApp.
2. Agente responde como a modelo.
3. Conversa e qualificada e negociada.
4. Cliente informa interesse e horario.
5. Agente consulta disponibilidade.
6. Agente pede que o cliente avise quando sair.
7. Quando o cliente diz que chegou, agente pede foto da portaria/fachada.
8. Com a confirmacao, ocorre transbordo para a modelo.
9. Pagamento acontece presencialmente.

Regra critica: no fluxo interno nao ha cobranca antecipada no MVP.

## Fluxo B: saida ou externo

Fluxo em que a modelo precisa se deslocar ate o cliente.

Sequencia esperada:

1. Cliente entra em contato.
2. Agente responde como a modelo e qualifica apenas o suficiente para entender a intencao.
3. Caso e identificado como saida.
4. Agente abre handoff imediatamente e entra em silencio.
5. Humano assume a conversa por causa da complexidade logistica e de seguranca.
6. Humano valida local, horario, contexto e risco territorial.
7. Humano orienta ou confirma o Pix do deslocamento/Uber, quando aplicavel.
8. Com Pix confirmado manualmente ou por comprovante registrado, o horario pode ser bloqueado.

Regra critica: no fluxo de saida, a classificacao como `EXTERNAL` e o gatilho de escalada. O comprovante/Pix e gatilho operacional de confirmacao depois que o caso ja esta em handoff.

Regra de seguranca: saidas envolvem risco logistico e territorial maior. Enderecos, bairros, moteis, festas, restaurantes e horarios exigem avaliacao humana. O agente nao deve assumir que consegue validar seguranca de local apenas por texto livre.

O agente pode coletar informacao minima para classificar o fluxo, mas nao deve conduzir a logistica da saida autonomamente.

## Comprovante

O comprovante do fluxo de saida e apoio operacional apos handoff. Ele nao substitui a avaliacao humana de seguranca e nao autoriza o agente a retomar a conversa automaticamente.

Quando houver comprovante registrado, ele deve ser tratado com tres estados:

- `VALID`
- `UNCERTAIN`
- `INVALID`

A analise deve usar saida estruturada, temperatura baixa e schema validado. O provedor deve seguir a stack principal, sem introduzir OpenRouter/Gemini apenas para OCR no MVP.

Politica para comprovante ilegivel:

- `VALID`: sinais compativeis com valor e contexto esperado;
- `UNCERTAIN`: imagem ruim, incompleta, cortada ou sem evidencia suficiente;
- `INVALID`: divergencia clara, inconsistencia relevante ou suspeita forte.

Fluxo operacional:

- no primeiro `UNCERTAIN`, a operacao pode pedir reenvio de forma curta e objetiva;
- se persistir `UNCERTAIN`, a operacao revisa manualmente;
- em `INVALID`, o sistema nao confirma nem bloqueia agenda automaticamente.

O comprovante deve ser comparado contra valor esperado estruturado:

- usar valor esperado configurado para o atendimento;
- permitir tolerancia configuravel;
- baseline inicial recomendado: 5% ou R$10, o que for maior;
- divergencia acima da tolerancia impede confirmacao automatica.

## Foto de chegada

No fluxo interno, a foto de portaria/fachada e sinal operacional para confirmar que o cliente chegou ao local. Apos essa confirmacao, o sistema executa transbordo para a modelo.

O agente deve tratar a imagem como entrada operacional e nao como conteudo livre para conversa.

## Agenda dentro dos fluxos

O agente consulta disponibilidade antes de confirmar.

Regras:

- `check_availability` consulta cache local no Postgres;
- `block_slot` registra bloqueio localmente em transacao, valida colisao no banco e reflete no Google Calendar de forma idempotente;
- se o Google Calendar estiver lento ou temporariamente indisponivel, a conversa deve continuar com degradacao controlada, sem confirmacao definitiva do horario ate sincronizacao ou revisao humana;
- bloqueios devem ser comparados no banco por intervalo, usando `OVERLAPS`, `tsrange` ou logica SQL equivalente;
- o agente nao consulta a API do Calendar em tempo real durante a conversa.

## Escalada funcional

Condicoes principais de escalada:

- saida: imediatamente apos classificar o fluxo como `EXTERNAL`;
- interno: apos confirmacao de chegada com foto da portaria/fachada;
- qualquer estado: apenas diante de necessidade operacional explicita.

A escalada vai para a modelo, nao para Fernando. Fernando e gestor da operacao e usuario principal da interface operacional.

## Mensagens picotadas e midia no fluxo

Mensagens fragmentadas sao comportamento normal no WhatsApp e devem ser tratadas como problema operacional do canal.

Regras funcionais:

- consolidar rajadas antes de acionar o agente;
- midia operacional relevante pode forcar flush imediato;
- midia sem legenda deve preservar marcador explicito, como `[imagem]`, `[audio]` ou `[comprovante]`;
- lote sem texto util, mas com midia, deve ser roteado para tool apropriada;
- lote vazio sem texto e sem midia util nao deve acionar LLM.
