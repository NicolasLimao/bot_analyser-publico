# SPEC-007 — criação guiada por modelo

“Novo robô” e “Criar a partir de um modelo” abrem uma sequência de decisões curtas, com preenchimento à esquerda e prévia do fluxo à direita. A interface usa o sistema visual existente, com uma ação principal por etapa. O progresso é numérico e se adapta ao roteiro: 21 passos no modelo padrão e 15 no atendimento direto, incluindo as oito perguntas de regras da [SPEC-014](014-regras-guiadas.md). Durante as regras, a tela usa uma coluna com foco na pergunta, sem mapa/chat lateral.

## Modelos e personalização

- **Modelo padrão:** adapta a triagem do script fornecido: saudação com Empresa X e `{{contact_name}}`, Comercial/Comprar/Vender, Suporte, Financeiro, retorno ao início, transferências e mensagem de espera. Financeiro usa transferência direta nesta versão; departamento e atendente são escolhidos no destino, e as regras de horário, feriado, inatividade, despedida, avaliação e opções inválidas têm perguntas próprias antes da revisão.
- **Atendimento direto:** saudação, transferência para uma equipe, espera e parada.
- **Usar meu roteiro atual:** cópia independente do roteiro aberto, com novo ID e nome, mantendo os recursos da mesma conta.

Os modelos novos nunca copiam IDs de departamentos dos exemplos. O usuário escolhe entre departamentos ativos do catálogo atual. Uma seleção de departamento limpa o atendente anteriormente associado. A troca de modelo mantém as edições de cada base durante a sessão do assistente.

Nome, mensagens e opções chegam preenchidos. Ao continuar na identificação, a empresa substitui o nome anterior nos textos que ainda o contêm; mensagens personalizadas e variáveis são preservadas. A personalização apresenta uma mensagem por tela, todas as opções de um menu em uma etapa e um departamento por tela. Adicionar ou remover opções atualiza os passos dos destinos, preservando caminhos compartilhados. Textos auxiliares ficam recolhidos. Ao voltar ou trocar de modelo, as edições de cada base, inclusive o nome de empresa ainda não aplicado, permanecem na sessão.

Na revisão, “Revisar minhas respostas” permite abrir diretamente uma resposta e retornar à revisão após editar. Após criar o rascunho, o editor por caminhos permite adicionar ou remover opções, menus, mensagens e destinos. Novos menus e mensagens nesse editor também vêm preenchidos.

## Mapa e simulação

O painel permite alternar entre “Seu fluxo” e “Chat”, preservando a escolha ao avançar e ao alternar entre preenchimento e prévia no celular. O chat mostra a etapa em edição: mensagem e todas as opções do menu, inclusive as de outros grupos de preenchimento, ou o departamento de uma transferência. Sem etapa específica, mostra a entrada do roteiro. Alterações aparecem durante a digitação, sem mover o foco. A formatação do menu usa a mesma função da compilação; `{{contact_name}}` aparece como “Contato de teste” apenas na prévia. Mensagens vazias e destinos ainda não definidos recebem orientação. Essa visualização acompanha a edição; responder às opções continua disponível em “Testar conversa”.

O painel “Seu fluxo” permanece à direita durante a criação, com rolagem independente. As alterações aparecem imediatamente, inclusive a prévia do nome da empresa antes de continuar. A etapa em edição recebe destaque e é trazida para a área visível do painel sem mover o foco do formulário. O mapa deriva do mesmo Draft usado pela edição e compilação e mostra respostas, próximos passos e departamentos. Retornos e destinos compartilhados aparecem como referências. O mapa do editor permite abrir uma etapa; a expansão é limitada a seis níveis, com referência para continuar sem estreitar indefinidamente o conteúdo.

A última etapa apresenta a simulação já existente na área principal, com cliques, resposta digitada, retorno, transferência e parada. As regras de teste ficam em “Testar regras do atendimento”; no editor completo, continuam visíveis. Pendências são explícitas na revisão e não impedem guardar um rascunho editável. A geração mantém a validação anterior. Criar rascunho não publica na Digisac.

## Preservação e acessibilidade

Abrir o assistente guarda o roteiro atual, inclusive alterações ainda não salvas. Cancelar retorna a ele e devolve o foco. Criar guarda novamente o roteiro anterior, aplica o novo e apresenta a conclusão, com edição recolhida. O novo só substitui o rascunho persistido ao salvar. Falha de armazenamento mantém a edição aberta e mostra erro. Os dados temporários do assistente não sobrevivem ao recarregamento; o roteiro anterior sobrevive.

Na conclusão, **Ver fluxo completo** começa recolhido; a expansão mostra todas as etapas, com continuações separadas após seis níveis para manter a leitura. **Editar atendimento** reabre os caminhos e o chat. A prévia Fluxo/Chat durante o preenchimento permanece simultânea no desktop e alternável no celular.

As ações ficam nas abas **Rascunho** e **Exportar e enviar**, acessíveis também por setas, Home e End. A primeira guarda localmente; a segunda reúne JSON do robô, prévia técnica e envio. A preparação automática valida e compila, sem botão “Gerar prévia”. Pendências, preparação em andamento, falhas e ausência de conexão explicam as ações indisponíveis. Preparar arquivos nunca chama o endpoint de envio.

Cada transição foca o título. Botões indicam seleção, e uma barra de progresso rotulada acompanha a etapa atual; campos têm rótulos e erros usam alertas. O formulário tem até 600px, com ações no fluxo da página, sem rodapé sobreposto. Acima de 760px, preenchimento, opções e escolhas ficam à esquerda, com Fluxo/Chat simultaneamente à direita. Entre 761px e 1000px, as colunas são flexíveis e o espaçamento é reduzido para preservar essa composição em janelas menores. Até 760px, “Preencher etapa” e “Ver fluxo” alternam a área visível sem desmontar os campos nem perder respostas. A região rolável do mapa recebe foco por teclado.

## Evidência

`tests/e2e/guided-chat.spec.ts` cobre a alternância por clique e teclado, personalização em tempo real, preservação do foco e das respostas, mudança para submenu e transferência e menus copiados com sete opções, em desktop e celular.

`tests/guided-model.test.ts` verifica isolamento de cópia, paginação completa de menus com 20 opções, roteiro sem mensagens, substituição de empresa, variáveis e compilação após escolha explícita de departamentos. `tests/e2e/guided.spec.ts` cobre poucos campos por tela, foco por teclado, edição direta pela revisão, retorno, transferência, prévia ao vivo, destaque e rolagem da etapa atual, alternância responsiva sem perda de respostas, salvar/recarregar, exportação, troca de modelo, cancelamento e falha de armazenamento em desktop e celular. A validação inclui testes unitários/API, casos de navegador do assistente, criador e editor por caminhos, build, TypeScript e formatação. Não houve envio adicional à Digisac nesta alteração visual.

Extensão de 13/09/2026: cada passo de departamento oferece também Atendente opcional. O seletor depende de um departamento, lista somente usuários ativos explicitamente vinculados e preserva a opção de encaminhar para a equipe. A troca de departamento limpa o atendente anterior; seleções indisponíveis permanecem identificadas para correção. O mapa e a prévia mostram o atendente escolhido. O teste da prévia lateral confere filtragem, limpeza da seleção, nome no mapa e preservação ao alternar as áreas no celular.
