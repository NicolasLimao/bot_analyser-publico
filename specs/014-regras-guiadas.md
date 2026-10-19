# SPEC-014 — configuração guiada das regras

Em 14/10/2026, o responsável solicitou reduzir a quantidade de informações simultâneas e tornar a configuração clara para clientes sem conhecimento técnico, seguindo o percurso guiado da criação do robô.

## Referências consultadas

- [GOV.UK — Question pages](https://design-system.service.gov.uk/patterns/question-pages/): começar com uma pergunta por página, permitir voltar, usar título e ação de continuar, preservar respostas e apresentar somente informações necessárias.
- [HubSpot — Create workflows](https://knowledge.hubspot.com/workflows/create-workflows): criação organizada em passos, com configuração de gatilhos, ações e revisão antes da ativação.
- [Landbot — How to build a bot](https://help.landbot.io/article/jmyarmlbih-getting-started-build-a-bot): construção por blocos, modelos como ponto de partida e configuração do próximo passo no contexto da conversa.

A adaptação para este produto é uma decisão de design: perguntas em linguagem de atendimento e revisão editável. O objetivo é facilitar decisões para clientes, sem exigir que montem condições técnicas em um diagrama.

## Percurso

O editor apresenta uma área compacta com a quantidade de regras ativas, indicação de pendências e **Configurar regras**. Essa ação abre uma tela própria. A criação por modelo incorpora as mesmas oito perguntas ao percurso, antes da revisão:

1. Início somente na primeira mensagem.
2. Feriados.
3. Horário de atendimento.
4. Aviso para opção inválida.
5. Parada quando o atendente responder.
6. Encerramento quando o contato não responder à equipe.
7. Despedida após fechamento.
8. Avaliação após fechamento.

Cada tela tem uma pergunta, descrição curta, escolhas **Sim / Não** e **Voltar / Continuar**. Mensagens e seleção de avaliação aparecem somente quando necessárias. Ajuda complementar fica em um elemento expansível. Durante as regras, a interface usa uma coluna central, sem mapa, chat ou controles de outras regras.

A revisão mostra uma linha por regra com sua consequência e **Alterar**. Corrigir uma escolha retorna diretamente à revisão. Pendências de mensagem ou avaliação aparecem como **Falta completar**. É possível concluir a configuração com pendências para continuar a edição; geração, exportação e envio seguem bloqueados pelo validador existente.

## Preservação e acessibilidade

- O mesmo roteiro alimenta o editor, a criação guiada, a revisão e a simulação. Os contratos e valores iniciais das regras permanecem os existentes.
- Voltar, avançar e desativar preservam os textos e o ID da avaliação. Abrir uma pergunta não modifica o roteiro.
- No editor, **Voltar ao robô** mantém as escolhas na edição atual; **Salvar rascunho** mantém a persistência existente no navegador. O assistente por modelo mantém seu próprio rascunho até criar.
- Diagnósticos de regras no editor abrem a pergunta correspondente.
- O título recebe foco após cada transição. Radios usam controles nativos, agrupamento e legenda; os campos mantêm rótulos, descrição de erro e `aria-invalid`. A conclusão retorna o foco ao botão de configuração.
- Desktop e celular usam o mesmo percurso, nos temas claro/escuro, com ações no fluxo da página e sem depender de hover.

## Verificação

Os testes de navegador exercitam avanço/retorno, teclado, campos condicionais, revisão com alteração direta, pendências, conclusão parcial, rascunho salvo/reaberto, simulação, avaliação indisponível e expiração da sessão. As regressões de regras foram adaptadas para percorrer a configuração visível ao cliente.

Os testes locais cobrem a interface e os contratos já implementados. A homologação das regras na Digisac continua seguindo as SPEC-008 a SPEC-013.

Verificação final em 14/10/2026: formatação, TypeScript e build aprovados; **90 testes de domínio/API e 70 cenários de navegador aprovados**, em Chrome desktop/celular. A primeira rodada completa identificou a perda da preferência Seu fluxo/Chat ao passar pelas regras; a prévia passou a ficar oculta sem perder seu estado, com regressão específica. Capturas de configuração manual e por modelo revisadas, inclusive tema escuro, sem overflow horizontal nas larguras testadas. Evidências locais: `.impeccable/review/rules-wizard-*.png` e `guided-rules-*.png`. Nenhum robô real foi enviado à Digisac nesta alteração de interface.
