# SPEC-009 — preparação para inatividade no robô


## Evidências e pendências

O [manual oficial de inatividade](https://digisac.gitbook.io/manual-digisac-2-0/mais-opcoes/robos/fluxograma/como-configurar-mensagem-de-inatividade), consultado em 25/09/2026, descreve o gatilho de inatividade dentro do robô com tempo em minutos ou horas, de zero a três tentativas e mensagens iguais ou diferentes. A ação seguinte pode ser configurada no fluxograma. Isso documenta controles da plataforma, não o contrato JSON nem os instantes de disparo.

As duas referências locais examinadas (`JSON amostra de desenvolvimento não distribuída` e `exportação de referência não distribuída`) contêm parâmetros em `flowJson` e em `defaultContexts.@EVERY.triggers.BOT_INACTIVE[0].data`, mas uma entrada de `contexts.@EVERY.triggers` não identifica seu evento. Nenhuma conecta uma saída ao gatilho de inatividade. Portanto, não são evidência suficiente de uma representação completa e coerente a gerar.

Para concluir o recurso, são necessários:

- Exportação de um robô salvo/publicado na Digisac que esclareça a representação do evento no editor e a continuação escolhida.
- Teste do início e reinício da contagem, intervalos, tentativas e resultado após o último lembrete.
- Teste de convivência com resposta do contato, transferência, mensagem do atendente e fechamento.

Não se presume fechamento após 30 minutos. A confirmação do responsável de que a criação atual funcionou não homologa temporizadores ainda não implementados.

## Incremento entregue

`serializeContexts` recebe os contextos internos e, opcionalmente, um mapa de parâmetros por referência de regra. Preserva esses parâmetros em `defaultContexts`, sem acrescentar um campo hipotético à representação do editor. Regras sem parâmetros continuam com `data: {}`. O compilador atual utiliza esse mesmo caminho sem fornecer parâmetros adicionais.

O serializador rejeita IDs de contexto duplicados, eventos duplicados dentro de um contexto, eventos sem identificação e parâmetros associados a regras ausentes. Isso impede descarte silencioso por sobrescrita na conversão de listas em objetos. Várias regras do mesmo evento devem estar na mesma lista de regras; eventos diferentes coexistem em `@EVERY`.

Essa função é interna: não é importador, validador completo de exportações ou homologação de `BOT_INACTIVE`. Seus testes usam contextos sintéticos explicitamente identificados. O formato do rascunho, a interface, os IDs gerados e `importReady: false` permanecem iguais.

## Aceitação

- Parâmetros de uma regra sobrevivem à serialização sem contaminar outras regras ou eventos.
- Valores zero e falso são preservados, assim como a ordem das mensagens.
- Condições, ações, alternativas e conversão de recursos para IDs permanecem equivalentes.
- Entradas não são modificadas; ambiguidades de identidade e parâmetros sem regra provocam erro.
- As 16 combinações das políticas existentes geram saídas idênticas às anteriores ao incremento.

Verificação local deste incremento: 68 testes de domínio/API aprovados, incluindo seis novos casos do serializador; formatação, TypeScript e build aprovados. Comparação byte a byte das 16 saídas com a base `6a41138` aprovada. Não houve mudança visual nem execução dos testes de navegador nesta etapa. Nenhum robô foi enviado à Digisac durante estas verificações.
