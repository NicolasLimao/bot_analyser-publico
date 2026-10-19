# SPEC-004 — criador local de demonstração

Status: criador local em React + TypeScript, servido por Node.js, com demonstração, cópia QA e conexão Digisac conforme a SPEC-005. O servidor escuta apenas em `127.0.0.1`; não é uma configuração de produção.

- `UI-01`: identificar permanentemente o catálogo fictício ou a cópia local dos departamentos inteiramente fictícios. A cópia não representa conexão nem revalidação ao vivo; não oferece atendentes.
- `UI-02`: editar nome do robô, mensagem e opções de menu, mensagens simples, transferências e próxima etapa; adicionar/remover etapas e opções sem perder o roteiro.
- `UI-03`: ao selecionar departamento, oferecer apenas atendentes ativos relacionados. Trocar o departamento limpa um atendente incompatível.
- `UI-04`: revisar pendências com o mesmo validador do backend. Salvar rascunho local mesmo incompleto; falhas de armazenamento devem ser visíveis. O rascunho é separado por conta e restaurado ao recarregar.
- `UI-05`: uma simulação local percorre menus, mensagens e transferências do roteiro. Ela serve à revisão do roteiro e não reproduz a execução interna da Digisac.
- `UI-06`: gerar uma prévia pela API, recarregando o catálogo no servidor. **Baixar prévia técnica** contém o envelope. **Exportar JSON do robô** baixa apenas o objeto `bot`, é experimental e fica desabilitado com catálogo fictício. Nenhum download publica na Digisac.
- `UI-07`: controles utilizáveis por teclado, campos com rótulos, foco visível e layout sem transbordamento horizontal em 390 px e desktop.
- `UI-08`: a preparação ocorre automaticamente após 400 ms sem alterações, com revalidação no servidor. Edição, troca de conta, conexão ou catálogo invalidam a resposta anterior; respostas atrasadas são descartadas. Exportação fica indisponível até a versão atual estar pronta. Falha de preparação oferece nova tentativa explícita e preserva o rascunho.
- `UI-09`: renomear qualquer tipo de etapa com nome opcional de até 80 caracteres. Manter o tipo como título e exibir o nome como subtítulo no índice/editor e junto ao tipo nos destinos. Salvar/restaurar esse nome; limpar o campo retorna à apresentação original.
- `UI-10`: duas caixas de seleção controlam a primeira mensagem e a parada por mensagem de atendente. Novos robôs começam com a primeira desmarcada e a segunda marcada. Alterar uma regra invalida a prévia e reinicia a simulação. As escolhas são salvas com o roteiro.
- `UI-11`: **Novo robô** guarda o roteiro atual, incluindo edições não salvas, antes de criar outro ID com mensagem e parada. Recarregar restaura o anterior enquanto o novo não for salvo; erro de armazenamento impede a criação e mantém o editor. Trocar de catálogo também guarda o rascunho atual por conta e restaura o da conta selecionada; erro de armazenamento impede a troca.
- `UI-12`: simular entrada com primeira mensagem ou posterior; permitir simular intervenção do atendente enquanto aguarda opção do menu, respeitando a regra marcada/desmarcada.
- `API-01`: bootstrap de demonstração retorna roteiro e catálogo sintéticos. O cliente não pode fornecer o catálogo usado na compilação.
- `API-02`: JSON inválido retorna 400, roteiro inválido retorna 422, corpo acima de 256 KiB retorna 413 e tipo de conteúdo diferente de JSON retorna 415.
- `API-03`: falha ao atualizar catálogo não libera prévia, não revela erros internos e mantém o rascunho no cliente. Requisições de escrita vindas de origem externa são recusadas.
- `API-04`: `profile=demo|qa` seleciona catálogos definidos no servidor. `profile=live` utiliza a conexão autenticada, conforme a SPEC-005. Perfil desconhecido retorna 400; roteiro de outra conta retorna 422. `snapshot` identifica uma cópia local e gera aviso `LOCAL_CATALOG_SNAPSHOT`. Não há inferência de vínculo usuário/departamento a partir das amostras fornecidas.
- `UI-13`: conectar com URL, usuário e senha carrega departamentos reais sem atendente fixo; a senha não é persistida. Desconectar e reconectar preservam o roteiro. Sessão expirada mantém o editor e permite novo login.
- `UI-14`: após gerar, o envio apresenta nome e instância antes da ação. Sucesso mostra ID quando disponível; resultado incerto exige conferir a plataforma. Exportar continua sendo um download independente. Recompilação e consulta atual de departamentos precedem o POST externo.

Decisão de execução: o responsável autorizou autonomia e dispensou aprovações futuras para decisões rotineiras. A interface será construída diretamente em código nesta entrega, sem rodada de aprovação visual. Isso não presume preferências permanentes de imagem/comp para outras tarefas.
