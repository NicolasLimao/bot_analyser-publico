# SPEC-003 — prévia técnica V3

Status: experimental, baseada na exportação local; não homologada para importação. Entradas válidas retornam `status: preview`; inválidas retornam `status: invalid`, sem objeto `bot`. O retorno sempre contém `importReady: false`, mesmo com catálogo de origem real. Não existe publicação direta neste incremento.

O compilador transforma apenas os tipos de SPEC-001. Usa `START_NODE`, `TRIGGER_NODE`, `MESSAGE_NODE`, `TRANSFER_TICKET_NODE` e `DEAD_END_NODE`, observados no exemplo. Um menu gera mensagem com `answers` no grafo e regras `MESSAGE_RECEIVED` com igualdade em `contexts`. `defaultContexts` é serializado como string JSON, derivado desses contextos; condições usam a representação observada `{{message_text}}`.

Critérios:

- `V3-01`: a mesma entrada e catálogo produzem a mesma prévia, independentemente da ordem das etapas no array. IDs locais são derivados de namespace/conta/roteiro/elemento, sem copiar IDs de outro robô.
- `V3-02`: preservar textos e variáveis; produzir a mesma mensagem de menu em ambas as representações, incluindo suas opções.
- `V3-03`: toda conexão do grafo e `SET_CONTEXT` aponta para elemento existente; opções visuais e regras apontam para os mesmos destinos.
- `V3-04`: recursos de transferência vêm do catálogo por ID. `contexts` e `flowJson` mantêm os objetos dos recursos; nas ações `TRANSFER_TICKET` de `defaultContexts`, `department` e, quando selecionado, `user` são strings contendo seus IDs. Sem atendente fixo, omitir `user` na ação e manter `user: null` no nó visual. Não copiar metadados, e-mails ou credenciais dos exemplos reais.
- `V3-05`: validação precede geração; entrada inválida retorna diagnóstico, sem objeto `bot`.
- `V3-06`: declarar limitações: catálogo simulado quando aplicável, perfil não homologado, recursos representados apenas por ID/nome/conta e ausência das regras globais nesta etapa.

O objeto experimental inclui `id`, `name`, `accountId`, `data`, `contexts`, `flowJson`, `settings` e `defaultContexts`. O envelope de importação definitivo, metadados de versão e campos completos dos recursos ainda dependem de homologação. A presença de JSON estruturalmente coerente não comprova equivalência com o robô completo do Morro dos Anjos.

Atualização: o perfil `digisac-v3-observed-triage-0.3` implementa as duas políticas opcionais de `behavior`. `firstMessageOnly` acrescenta `CONDITION_NODE`, `$and` sobre `is_first_ticket_message == "true"` e saídas `OUTPUT_TRUE`/`OUTPUT_FALSE` para a entrada/parada. `stopOnAttendantMessage` acrescenta `PERSISTENT_START_NODE`, gatilho `USER_MESSAGE_SENT` e parada própria vinculada a `@EVERY`. Grafo, contextos do editor e regras serializadas representam os mesmos destinos. A simulação e os testes cobrem as quatro combinações. Os novos IDs são derivados desse perfil. A homologação na plataforma continua pendente.


## Ampliação de entrada — perfil 0.4

O perfil `digisac-v3-observed-triage-0.4` inclui as políticas opcionais da [SPEC-008](008-politicas-de-entrada.md). As condições `is_holiday` e `is_company_open` usam `$and`/`$eq` e destinos explícitos. A mensagem de feriado usa `SEND_HOLIDAY_MESSAGE_NODE` e a ação `SEND_MESSAGE` com `@botOnHoliday`, observadas na amostra amostra de desenvolvimento não distribuída. Fora do horário, um `MESSAGE_NODE` envia o texto do roteiro. Ambos seguem para `DEAD_END_NODE`, sem fechamento do chamado. Os eventos persistentes são acumulados, preservando a parada por atendente.

A ordem de entrada gerada é primeira mensagem → feriado → horário → roteiro. Os retornos locais apontam diretamente para a etapa, sem repetir condições de entrada. A versão do perfil participa da geração determinística dos IDs; ao recompilar, os IDs diferem do perfil 0.3. Regras desativadas preservam a semântica anterior, não os identificadores entre versões do perfil. `importReady: false` e a limitação de homologação continuam vigentes.

## Inatividade do chamado — perfil 0.5

O perfil `digisac-v3-observed-triage-0.5` acrescenta a [SPEC-010](010-inatividade-chamado.md): evento persistente `TICKET_INACTIVE`, condição `is_message_from_me == "true"`, mensagem configurável e `CLOSE_TICKET_NODE`/`CLOSE_TICKET` com `ticketTopics: []`. A saída falsa não tem destino nem ação alternativa. Uma única entrada persistente serve os eventos habilitados. O prazo pertence à configuração da empresa; não gera `BOT_INACTIVE` nem temporizador local. Os IDs mudam com a versão do perfil; `importReady: false` permanece.

## Mensagem após fechamento — perfil 0.6

O perfil `digisac-v3-observed-triage-0.6` acrescenta a [SPEC-011](011-mensagem-pos-fechamento.md): evento persistente `TICKET_CLOSED` com uma única regra que aponta para a mensagem configurada. A mensagem contém apenas `SEND_MESSAGE`, sem novo fechamento ou avaliação. Compartilha a entrada persistente com as regras anteriores. Fechamentos automáticos dependem do disparo do evento na plataforma; a simulação local representa esse cenário, sem homologá-lo. IDs são derivados do novo perfil e `importReady: false` permanece.

## Avaliação após fechamento — perfil 0.7

O perfil `digisac-v3-observed-triage-0.7` implementa a [SPEC-012](012-avaliacao-pos-fechamento.md). Uma única sequência de `TICKET_CLOSED` envia a mensagem convencional opcional e depois `SEND_QUESTION`, sempre como última ação. Grafo/editor mantêm o objeto da avaliação selecionada; execução serializa seu ID. Sem mensagem, o evento aponta diretamente para a avaliação. O recurso é consultado na conta e revalidado antes do envio. A consulta real e o ciclo na plataforma ainda exigem homologação; `importReady: false` permanece.

## Respostas inválidas — perfil 0.8

O perfil `digisac-v3-observed-triage-0.8` implementa a [SPEC-013](013-respostas-invalidas.md). Menus com a regra ativa aguardam resposta e encaminham o texto para condições de igualdade; a última saída falsa envia um aviso e reapresenta o mesmo menu. Não adiciona contingência global nem ações após a avaliação. A composição de `waitForResponse: true`, saída `OUTPUT` e `MESSAGE_RECEIVED` é uma inferência ainda não observada nas exportações locais, sinalizada por `MENU_RESPONSE_MAPPING_NOT_HOMOLOGATED`; a reexportação e o teste reais permanecem necessários. `importReady: false` continua em vigor.
