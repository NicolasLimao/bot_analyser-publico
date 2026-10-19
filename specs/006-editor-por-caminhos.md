# SPEC-006 — editor por caminhos

O feedback do responsável pede nome, mensagem, opções e encadeamento no próprio menu. A edição por caminhos é o modo inicial; conexões individuais continuam disponíveis em “Editar conexões avançadas” para rascunhos complexos e diagnósticos. A preferência de visualização é guardada no navegador. Nenhuma conversão de esquema ou migração de rascunho é necessária.

Cada opção reúne resposta, texto e próximo passo. Escolher menu, mensagem ou transferência cria e conecta a etapa imediatamente. “Parar o robô aqui” usa uma parada interna sem exigir um bloco separado na interface. O chamado permanece aberto. Novos submenus têm mensagem e duas opções preenchidas, com parada como destino. Mensagens e novas opções também recebem sugestões editáveis; departamentos continuam exigindo escolha explícita.

Substituir um destino ou remover uma opção elimina somente seu trecho que perdeu referências, mantendo destinos compartilhados e etapas preexistentes de outros caminhos. Desfazer recupera alterações no editor por caminhos (até 40 estados); a pilha é local à edição aberta, não persistente. Alterações externas ao editor reiniciam a sequência. O botão de remoção mantém pelo menos uma opção no menu.

Destinos existentes podem ser reutilizados, inclusive retorno ao menu inicial. Etapas compartilhadas são identificadas; cada etapa aparece expandida uma vez por renderização. Retornos e ramificações a partir de quatro níveis mostram referência com “Abrir esta etapa”; o editor oferece volta ao início. Isso limita repetição e estreitamento sem remover partes do fluxo. Diagnósticos podem abrir as conexões avançadas para localizar etapas inacessíveis ou referências incompletas.

O chat acompanha o menu ao editar mensagem/opções ou usar “Testar este menu”. Permite clicar numa opção ou digitar a resposta exata, mostra transferência e parada, e avisa quando não há correspondência. `{{contact_name}}` aparece como “Contato de teste” somente na simulação. Testar um submenu é identificado e oferece “Testar desde o início”. A simulação é local; não envia mensagens reais nem emula integralmente a Digisac.

No desktop, o chat fica à direita e acompanha a rolagem do editor. Até 1.000 px, “Montar roteiro” e “Testar conversa” alternam as áreas preservando edição e conversa. A ação de testar um menu abre a conversa no celular.

Evidência: testes do modelo verificam substituição, compartilhamento e retorno; Playwright monta Comercial → Comprar/QA ou Vender/submenu, desfaz remoção, testa respostas válidas/inválidas, salva, recarrega e exporta JSON em desktop/celular. O modo avançado mantém os testes anteriores, incluindo login e envio com API simulada.

O assistente guiado está especificado em [SPEC-007](007-criacao-guiada.md). O editor oferece “Ver mapa do fluxo”, com abertura das etapas por referência, mantendo autenticação e publicação existentes.
