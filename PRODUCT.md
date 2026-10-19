# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + TypeScript para a interface e Node.js + TypeScript para o backend, conforme recomendação aceita pelo responsável. Hospedagem ainda não definida. O núcleo é independente de frameworks. Funciona localmente com login Digisac, consulta de departamentos e criação por POST; implantação de produção permanece pendente.

## Users

Clientes que configuram um robô de atendimento para sua conta Digisac, selecionando departamentos e atendentes existentes. O responsável pelo projeto também revisa fluxos e configura robôs com frequência. O formato exato de um piloto interno ainda não foi definido.

## Product Purpose

Criar robôs V3 por roteiro estruturado e regras de geração fixas, reduzindo ambiguidades presentes no preenchimento de Word. A interface precisa permitir entender e revisar o atendimento antes da exportação.

## Operating Context

Hoje os clientes preenchem um Word e a criação é manual na Digisac. A atividade mais frequente é criar um robô novo no modelo V3. O construtor consulta departamentos e usuários da conta conectada e mantém referências por ID. O login e o envelope de departamentos usam as amostras fornecidas pelo responsável. Em 13/09/2026, o diagnóstico registrou a segunda página de uma consulta real com 60 usuários. Após ajustar os vínculos repetidos e referências a departamentos ausentes, o responsável confirmou que a conexão funcionou. Essa confirmação cobre a conta testada, sem homologação geral da integração.

## Capabilities and Constraints

- Núcleo inicial: menus, submenus, mensagens, transferências para departamento com atendente opcional e parada do robô.
- A geração estruturada não utiliza IA. Tipos não suportados devem ser diagnosticados.
- Os exemplos de demonstração são sintéticos e identificados na interface; não representam uma conta conectada.
- A prévia V3 é experimental e não homologada. Gerar arquivo não é publicar na plataforma.
- Feriados e horário são políticas opcionais de entrada que usam a configuração Digisac; avisos param o robô e mantêm o chamado aberto. A ordem é primeira mensagem → feriado → horário → roteiro. Editor e assistente compartilham regras, revisão e simulação. Retorno local 0 pode ser acrescentado sem sobrescrever opções. A opção de inatividade do contato usa o evento Chamado inativo e o prazo da empresa, consultável e alterável na etapa conectada por uma ação explícita com releitura e confirmação; o prazo é compartilhado pela conta e não faz parte do roteiro. A consulta real com a autenticação fornecida retornou 403; o ciclo real ainda exige homologação. No evento: se a mensagem foi enviada pelo atendente, envia aviso e fecha o chamado; falso fica sem ligação. A mensagem opcional após fechar usa o evento de fechamento, compartilha a entrada persistente e tem simulação manual/automática; a avaliação após fechar permite selecionar um recurso da conta e sempre é a última ação; lembretes seguem pendentes; Word, legado, documentação Word e persistência compartilhada ficam apenas como ideias, sem implementação prevista; a execução real das novas políticas ainda requer homologação.
- Login aceita nome da instância ou URL, com verificação prévia da página sem credenciais. O nome consulta os cinco finais `digisac.me`, `digisac.app`, `digisac.co`, `digisac.chat` e `digisac.io`; múltiplos resultados exigem escolha. Usuário e senha são enviados somente ao endereço encontrado ou escolhido; o token fica na memória do backend. A sessão expira em até oito horas e exige reconexão, preservando a edição.
- No modo conectado, transferências permitem departamento e atendente opcional vinculado, com revalidação no servidor antes do envio. Departamentos e equipe mostra também usuários sem vínculo e arquivados. Catálogos fictício e QA local continuam disponíveis para edição sem conexão.
- A primeira visita apresenta a conexão Digisac. Depois, duas opções com descrição: criar a partir de um modelo ou montar manualmente. O editor só aparece após a escolha; rascunhos salvos podem ser retomados. A demonstração é uma entrada secundária identificada. Sessão expirada volta ao login e preserva a edição para reconectar. Na área de trabalho, a conexão continua no menu lateral.
- Os temas claro e escuro acompanham inicialmente o sistema; a escolha explícita fica no navegador e vale para toda a interface.
- Exportar baixa o arquivo; enviar cria o robô na instância exibida após nova validação dos departamentos. Resultado incerto orienta conferir a plataforma. O envio não ativa canais.
- Rascunhos ficam separados por conta no navegador. Desconexão e expiração preservam o roteiro. O fluxo conectado tem testes automatizados com API simulada. O responsável confirmou nesta sessão o envio pelo frontend e o funcionamento do roteiro na Digisac; essa evidência manual é limitada ao roteiro testado, sem homologação geral do gerador.

## Evidence on Hand


## Product Principles

- A interface usa as cores da Empresa-Exemplo, conforme solicitado: ciano nas ações, azul-marinho na navegação e superfícies claras. Tons derivados preservam contraste de texto, foco e controles; cores de status mantêm significado próprio.
- A montagem principal reúne nome, mensagem, opções e continuação dentro do menu. Parar e transferir são escolhas da ramificação, sem exigir blocos soltos na interface.
- O chat lateral permite validar imediatamente o menu e percorrer respostas. No celular, edição e teste alternam sem perda de estado.
- As regras do atendimento são configuradas em oito perguntas com escolhas Sim/Não, campos condicionais e ajuda recolhida. O editor mostra uma entrada compacta para esse percurso; a criação por modelo inclui as mesmas perguntas antes da revisão. Durante as regras, a tela foca o formulário em uma coluna. O resumo permite corrigir cada regra diretamente, preservando mensagens e seleção ao voltar ou desativar. Contrato: [SPEC-014](specs/014-regras-guiadas.md).

- O assistente guiado mantém uma decisão por tela: identificação, uma mensagem, as opções de um menu ou um departamento. Os menus permitem adicionar e remover opções na mesma etapa, mantendo de 1 a 20 opções. Novas opções recebem uma transferência com departamento a escolher; a remoção retira caminhos exclusivos e preserva destinos compartilhados. O total de etapas acompanha essas mudanças. No desktop, preenchimento e prévia aparecem simultaneamente, à esquerda e à direita. A prévia começa no Chat, com a mensagem e todas as opções, e oferece Seu fluxo como segunda opção para ver o mapa e a etapa em edição. No celular, preenchimento e prévia alternam sem perda de respostas. A revisão permite corrigir uma resposta diretamente; a simulação interativa ocupa um passo próprio. A edição por caminhos permite expandir o atendimento após criar o rascunho. Modelos novos exigem seleção explícita de departamentos; cópias preservam recursos da mesma conta.

- Uma única representação do roteiro alimenta edição, prévia e compilação.
- Após a montagem, o fluxo completo e a edição ficam recolhidos. As abas Rascunho e Exportar e enviar separam persistência local, downloads e criação na conta conectada. A prévia técnica é preparada automaticamente e invalidada ao editar. Recusas explícitas por nome repetido orientam renomear, preservando o roteiro; resultado incerto impede novo envio mesmo após edição. Os testes de duplicidade usam fixtures sintéticas, ainda sem confirmação do payload real.
- Identificar recursos por ID e validar os vínculos no servidor.
- Manter rascunhos editáveis quando houver pendências.
- Distinguir demonstração, validação estrutural e homologação real.
- Desenvolver com especificações, TDD, quality gates e guardrails em código.

## Escopo acordado — 09/10/2026

Ordem: avaliação após fechamento (incremento atual), lembretes por falta de resposta ao robô, tratamento de respostas inválidas e fechamento como destino de um caminho. Os demais recursos futuros mencionados nas análises ficam apenas como ideias, sem implementação prevista. Avaliação sempre por último: toda mensagem convencional do pós-fechamento a antecede; não há continuação após `SEND_QUESTION`.

O responsável escolheu avançar com respostas inválidas enquanto os lembretes aguardam uma exportação completa. O editor e o assistente permitem ativar um aviso para opções inválidas nos menus, seguido da reapresentação do mesmo menu. A configuração preserva a comparação exata e não trata avaliações nem contextos de parada. A composição experimental de espera por resposta e condições ainda requer confirmação por exportação e execução na Digisac; testes locais não homologam essa integração. Contrato: [SPEC-013](specs/013-respostas-invalidas.md).
