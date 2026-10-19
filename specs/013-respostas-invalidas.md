# SPEC-013 — resposta inválida nos menus

Em 09/10/2026, o responsável escolheu avançar com respostas inválidas enquanto os lembretes aguardam a amostra da plataforma.

## Contrato

Extensão opcional do roteiro versão 1: `behavior.invalidReply?: { enabled: boolean, message: string }`. Ausente significa desativado. Mensagem limitada a 4000 caracteres, preservada ao desativar, copiar e personalizar a empresa. Texto vazio é salvável; se ativo, bloqueia geração/exportação/envio com `INVALID_REPLY_MESSAGE_REQUIRED`. Tipos incorretos e campos desconhecidos são recusados.

A regra vale para todos os menus e submenus que aguardam uma escolha. A comparação continua exata: `01`, `1 ` e `1` são respostas distintas. Uma escolha válida segue seu destino sem aviso. Uma resposta inválida envia uma única mensagem configurada, reapresenta o mesmo menu e aguarda outra escolha. Não há limite de tentativas nem transferência/fechamento automático por erro. Retorno `0` funciona somente quando cadastrado como opção naquele menu.

Parada do robô, avisos de entrada, fechamento e avaliação não recebem essa regra. Uma transferência que continue explicitamente para outro menu deixa esse menu sujeito à regra; não se presume interrupção automática só pela transferência. A configuração de parada por mensagem do atendente continua controlando essa interrupção. Não são acrescentadas regras globais em `@EVERY` nem em `@FALLBACK`.

## Geração experimental — perfil 0.8

Com a regra ativa, cada menu é representado como `MESSAGE_NODE` com seu texto e opções visíveis no texto, `answers: []`, `hasAnswers: false` e `waitForResponse: true`. Em `contexts` e `defaultContexts`, `ENTER_CONTEXT` envia o menu; `MESSAGE_RECEIVED` encaminha a resposta para uma cadeia de condições locais.

Cada `CONDITION_NODE` compara `message_text` com uma opção usando `$and`/`$eq`. Verdadeiro segue para o destino dessa opção; falso segue para a próxima comparação. O último falso envia o aviso e retorna ao menu atual. Somente a próxima mensagem recebida reinicia as comparações. Uma alternativa em cada regra de opção seria incorreta: enviaria avisos para todas as opções que não correspondem, mesmo quando uma escolha é válida.

Grafo, contextos do editor e regras serializadas compartilham os destinos e as condições. IDs são determinísticos por conta/roteiro/menu/opção no novo perfil. Regra desativada conserva a geração anterior dentro do perfil; IDs diferem dos perfis anteriores. A seleção da avaliação continua sendo a última ação de pós-fechamento.

## Evidência e limites

As amostras locais demonstram mensagens, comparações exatas, condições, saídas verdadeira/falsa e retorno por `SET_CONTEXT`. O [manual oficial de fluxograma](https://digisac.gitbook.io/manual-digisac-2-0/mais-opcoes/robos/fluxograma), consultado em 09/10/2026, descreve condições com dois ramos, mas não documenta seu contrato JSON.

**A composição de espera por resposta com condições é uma inferência de implementação, não uma exportação observada.** As amostras existentes têm `waitForResponse: false`; o mapeamento de `true` para a saída `OUTPUT`/evento `MESSAGE_RECEIVED` ainda precisa ser confirmado por uma exportação real. Também é necessário confirmar que `message_text` preserva o texto recebido durante as transições automáticas. O gerador declara `MENU_RESPONSE_MAPPING_NOT_HOMOLOGATED` e mantém `importReady: false`. Testes locais comprovam o contrato implementado, não a aceitação nem execução real da Digisac.

## Interface e aceitação

Editor e assistente compartilham **Ao responder aos menus → Responder quando a opção for inválida**, aviso editável, pendência de preenchimento e resumo na revisão/mapa. O chat diferencia aviso do robô de diagnóstico local; com a regra desativada, conserva o diagnóstico anterior. Com mensagem pendente, mostra a pendência sem inventar resposta do robô.

Testes cobrem persistência, cópia, personalização, validação, exportação, repetição no menu correto, respostas inválidas repetidas, escolha válida depois do erro, retorno local, parada por atendente e convivência com entrada/inatividade/pós-fechamento/avaliação. A interpretação independente das regras cobre 64 combinações das outras políticas. Nenhum login, envio ou alteração de robô real faz parte das verificações locais.

## Verificação local — 09/10/2026

Formatação, TypeScript e build aprovados; **90 testes de domínio/API e 64 cenários de navegador aprovados** na suíte completa, em Chrome desktop/celular. A primeira rodada focal encontrou navegação incorreta no novo teste (aba de salvamento e catálogo fictício); após corrigir a preparação, os quatro casos focais passaram e a suíte completa passou. Capturas do componente revisadas em desktop/celular; revisão visual independente: ship, sem correções materiais. Nenhum robô foi enviado à Digisac; os limites de integração acima permanecem.
