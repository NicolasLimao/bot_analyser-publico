---
name: bot_analyser
description: Interface de operação para escrever, revisar e experimentar roteiros de atendimento.
colors:
  ink: "#0f172a"
  muted: "#475569"
  line: "#d5dde7"
  accent: "#006b82"
  side: "#070c14"
  focus: "#007c96"
  surface: "#ffffff"
  canvas: "#f3f5f9"
  brand-hover: "#19cff5"
  field-border: "#8494a7"
  secondary-hover: "#eaf6ff"
  secondary-hover-border: "#8494a7"
  control-hover: "#eaf6ff"
  field-hover-border: "#64748b"
  field-focus-border: "#007c96"
  nav-text: "#c1cfe0"
  nav-current: "#2f435e"
  nav-hover: "#1b2b40"
  step-selected: "#eaf6ff"
  step-selected-border: "#007c96"
  badge-bg: "#eaf6ff"
  badge-text: "#006b82"
  badge-border: "#d5dde7"
  notice-bg: "#eaf6ff"
  notice-text: "#475569"
  conversation-bg: "#f3f5f9"
  bubble-bot: "#eaf6ff"
  bubble-user: "#09a8c9"
  diagnostic-text: "#815838"
  diagnostic-hover: "#fff4df"
  brand: "#09a8c9"
  on-brand: "#070c14"
  field-hover: "#64748b"
  soft: "#eaf6ff"
  soft-hover: "#d8f1fa"
  selected-border: "#007c96"
  nav-accent: "#53dbf7"
  nav-line: "#40536b"
  on-dark: "#ffffff"
  conversation: "#f3f5f9"
  success: "#20704b"
  warning: "#986319"
  danger: "#a63d32"
  danger-hover: "#812b23"
  warning-text: "#815838"
  warning-soft: "#fff4df"
typography:
  entry-heading:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  entry-choice:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 600
  headline:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "1.8rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 650
  editor-title:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 650
    letterSpacing: "-0.02em"
  subtitle:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 650
  body:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 550
    lineHeight: 1.4
  button:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
  chat:
    fontFamily: "'Segoe UI', system-ui, sans-serif"
    fontSize: "0.77rem"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  compact: "5px"
  field: "6px"
  control: "7px"
  symbol: "8px"
  round: "50%"
spacing:
  gap-tight: "6px"
  gap-control: "8px"
  gap-copy: "12px"
  gap-form: "14px"
  inset-mobile: "18px"
  gap-section: "20px"
  inset-workspace: "30px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-text:
    textColor: "{colors.accent}"
    padding: "8px 0"
  button-icon:
    textColor: "{colors.muted}"
    rounded: "{rounded.compact}"
    padding: "5px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 11px"
  navigation:
    textColor: "{colors.nav-text}"
    rounded: "{rounded.control}"
    padding: "10px"
  navigation-current:
    backgroundColor: "{colors.nav-current}"
    textColor: "{colors.surface}"
  demo-badge:
    backgroundColor: "{colors.badge-bg}"
    textColor: "{colors.badge-text}"
    rounded: "{rounded.compact}"
    padding: "5px 9px"
  step-selected:
    backgroundColor: "{colors.step-selected}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 8px"
  conversation:
    backgroundColor: "{colors.conversation-bg}"
    textColor: "{colors.ink}"
    padding: "20px 18px"
  diagnostic:
    textColor: "{colors.diagnostic-text}"
    padding: "10px 4px"
---

# Design System: bot_analyser

## Overview

**Creative North Star: "Mesa de revisão"**

O sistema aproxima a configuração de atendimento de uma ficha de trabalho: texto legível, campos familiares e estados que ajudam a conferir o que foi escrito. Azul-marinho ancora a navegação; superfícies claras e divisórias discretas organizam o trabalho sem competir com o conteúdo.

A densidade é própria de uma ferramenta de operação. Títulos contidos, espaços locais e variações tonais tornam edição, contexto e retorno distinguíveis. A direção registra a implementação desta entrega; não representa preferências permanentes do responsável. A composição do criador está documentada em `.impeccable/surfaces/creator.md`.

**Key Characteristics:**

- Navegação azul-marinho e área de trabalho clara.
- Hierarquia pela tipografia, pelo espaço e por divisórias.
- Controles familiares, com foco visível e estados curtos.
- Retorno textual junto ao estado e à ação correspondente.
- Superfícies planas, sem sombras decorativas.

Fonte normativa de implementação: `web/src/styles.css`; componentes e estados: `web/src/App.tsx`. As cores estão centralizadas em variáveis CSS semânticas na raiz; o frontmatter também mantém nomes descritivos de componentes que referenciam esses mesmos valores.

## Colors

O tema escuro usa os mesmos papéis semânticos em `:root[data-theme='dark']`: canvas `#0d1723`, surface `#142131`, ink `#e6edf5`, muted `#a9b9cb`, line `#304255`, accent/focus `#64d8ef` e field-border `#6e839b`. Sucesso, aviso e erro recebem tons claros adequados ao fundo escuro. A marca ciano e a navegação azul-marinho permanecem. Textos sobre navegação usam `on-dark`, sem depender da cor da superfície.

A primeira visita acompanha a preferência do sistema. O botão de tema alterna claro/escuro e guarda a escolha no navegador; a preferência vale para conexão, escolhas, editor, assistente, conversa e recursos. `color-scheme`, placeholders, foco e a cor do navegador acompanham o tema.

A paleta foi adaptada das cores públicas do [site da Empresa-Exemplo](https://www.empresa-exemplo.com.br/) em 12/09/2026, com referência à [folha de estilos](https://www.empresa-exemplo.com.br/build/assets/app.css). Ciano, azul-marinho, branco e cinza claro organizam ação, navegação e leitura. Os tokens brand, brand-hover, side, canvas, soft, ink e nav-text usam valores observados no site; accent, focus e bordas são derivados para contraste na ferramenta. Verde permanece apenas como indicação semântica de sucesso, e tons de terra/vermelho distinguem pendências e ações destrutivas.

### Primary

- **Ciano de ação — brand:** preenche ações principais e respostas do contato com texto escuro on-brand; brand-hover clareia o botão ao passar o ponteiro. **Ciano de leitura — accent:** links, seleção, cursor de texto e checkbox sobre superfícies claras.
- **Azul-marinho — side:** base da navegação. nav-text, nav-current e nav-hover mantêm os estados dentro dessa superfície.
- **Ciano de foco — focus:** contorno de teclado. field-focus-border reforça o foco no campo.
- **Azul claro de seleção — step-selected:** identifica a etapa ativa, combinado com step-selected-border.
- **Ciano de resposta — bubble-user:** diferencia a resposta simulada da mensagem do robô.

### Neutral

- **Tinta azul-marinho — ink:** texto principal.
- **Texto de apoio — muted:** descrições, metadados, rodapé e subtítulo da conversa.
- **Papel de trabalho — canvas:** fundo geral e índice de etapas.
- **Branco de edição — surface:** campos, editor e botões secundários.
- **Linha azul-acinzentada — line:** divisórias da área de trabalho. field-border é a borda dos controles.
- **Papel de conversa — conversation-bg:** área de simulação; bubble-bot colore a mensagem recebida.
- **Azul informativo — badge-bg / badge-text / badge-border:** identifica a demonstração; notice-bg e notice-text sustentam o aviso explicativo.
- **Terra de revisão — diagnostic-text:** pendências acionáveis; diagnostic-hover marca a linha sob o ponteiro.

**The Estado Legível Rule.** Cor acompanha texto, ícone ou seleção semântica; a identificação de demonstração e os diagnósticos permanecem escritos.

## Typography

**Display Font:** não há família de display separada.
**Body Font:** Segoe UI, com system-ui e sans-serif como alternativas.
**Label/Mono Font:** rótulos usam a mesma família; trechos de variável usam o elemento code com a fonte monoespaçada nativa do navegador.

O sistema usa uma única família de interface. A escala é ajustada por papel e densidade, sem razão modular declarada; pesos intermediários dão ênfase sem aumentar muito os títulos.

### Hierarchy

- **Headline:** título de página; usa headline e cai para (1.65rem) até o breakpoint compacto.
- **Title:** cabeçalhos de seção usam title. O título da etapa usa editor-title e cai para (1.2rem) no celular.
- **Subtitle:** subtítulos menores e título da conversa.
- **Body:** base da raiz de (16px); parágrafos usam entrelinha de (1.6), com tamanhos locais menores nas descrições. Texto de resultado limita a leitura a (65ch) e notas de catálogo a (75ch).
- **Label:** rótulos acima dos campos, sem caixa alta forçada. Rótulos internos de opções usam (0.72rem).
- **Chat:** mensagens de conversa usam chat; metadados da conversa são menores (0.66rem).
- **Números:** o contador do índice usa algarismos tabulares.

## Layout

A entrada tem composição própria, documentada em `.impeccable/surfaces/entry.md`: conexão antes do editor, seguida de duas escolhas de criação. Cabeçalho com marca e tema, formulário de até 420px e escolhas de até 660px; margens laterais de 20px no celular. As escolhas são linhas inteiras clicáveis, separadas por divisórias, com título e descrição. O menu lateral aparece apenas na área de trabalho. Uma sessão de edição aberta é retomada ao recarregar a mesma aba, mantendo os rascunhos por conta.

O campo de endereço aceita nome da instância ou URL. Ao sair do campo, a verificação apresenta progresso, endereço encontrado ou erro no próprio grupo do endereço. Somente quando há vários resultados surge uma seleção obrigatória. A ação principal continua sendo conectar; a busca não acrescenta outro botão ao formulário.

O shell desktop usa navegação fixa na rolagem, com largura (218px) e altura de viewport, seguida por área flexível. A área principal tem margens internas horizontais (30px), barra superior (66px) e título separado do trabalho.

O construtor inicia no editor por caminhos: ficha flexível e conversa à direita, em `minmax(0, 1fr) minmax(300px, 360px)`. A ficha tem padding (24px); a conversa (20px 16px), posição sticky a (16px) do topo e altura máxima `calc(100vh - 32px)`, com rolagem própria. Nome, mensagem, opções e próximos passos ficam reunidos no menu. Revisão e resultado seguem abaixo. Essa composição é uma solução do criador, não um requisito para toda nova tela.

Até 1000px, “Montar roteiro” e “Testar conversa” alternam a área visível, preservando a edição e a conversa. A faixa de alternância acompanha o topo; a ficha usa padding (18px 12px), e o chat perde a posição sticky. No modo por caminhos, o histórico tem altura mínima (220px), máxima (390px) e rolagem interna para apresentar a nova troca de mensagens.

A ficha anterior de três colunas permanece em “Editar conexões avançadas”: índice (210px), editor flexível com mínimo (300px) e conversa (285px). Editor e conversa compartilham bordas, sem cartões elevados. O editor avançado tem padding (25px 26px), a conversa (20px 18px), e a pilha de campos usa gap-form. Os ajustes de construtor na tabela abaixo descrevem esse modo avançado; navegação e margens continuam comuns aos dois modos.

| Condição observada | Comportamento |
| --- | --- |
| A partir de 1650px | Margens laterais de 44px; construtor 240px / minmax(360px, 1fr) / 350px; editor com padding 28px 38px. |
| Até 1250px | Navegação de 185px; margens de 22px; construtor 175px / minmax(260px, 1fr) / 250px; ações do título empilhadas. |
| Até 1050px | Índice de 185px e editor flexível; conversa ocupa a linha seguinte. |
| Até 720px | Marca e botão de três barras no topo; navegação e conexão aparecem no menu expansível. Margens de 18px, índice horizontal rolável, editor e conversa em sequência; ações do título voltam à mesma linha. |

No modo avançado no celular, cada item do índice ocupa (180px), com altura mínima (88px) e encaixe de rolagem por proximidade. Seu corpo da conversa tem rolagem própria: mínimo (340px) e máximo (610px) no desktop, passando a (180px) e (400px) até 1050px. Tabelas ficam dentro de um contêiner com overflow automático.

A família de espaçamento é prática: pequenos intervalos entre ícone e texto, espaço intermediário entre campos e separações maiores entre blocos. O CSS usa valores locais; o frontmatter registra os recorrentes sem afirmar a existência de uma escala global em código.

## Elevation & Depth

Não há box-shadow, blur ou gradientes na implementação. A profundidade vem da navegação escura, das superfícies tonais e das bordas de um pixel. O foco usa contorno de (3px), deslocado (3px), sem sombra. O link para pular ao editor aparece sobre o conteúdo apenas quando recebe foco.

**The Superfície Plana Rule.** Separe os blocos desta família visual com tom, espaço e divisórias antes de acrescentar elevação.

## Shapes

Campos e respostas clicáveis usam field; botões principais, secundários, itens de navegação e etapas usam control. A identificação de demonstração e os botões de ícone usam compact. O símbolo do tipo de etapa usa symbol, enquanto avatares e pontos de estado são circulares.

A conversa é a exceção expressiva: mensagem do robô com cantos (2px 12px 12px 12px) e resposta do usuário com (12px 2px 12px 12px). A assimetria reforça a origem da mensagem. As grandes áreas de edição permanecem retangulares e são separadas por linhas.

## Components

### Buttons

Diretos e discretamente arredondados. O primário usa brand e on-brand, altura mínima (40px) e peso (600). O secundário tem fundo branco, borda field-border e peso (550); no hover usa secondary-hover e secondary-hover-border. Ambos têm conteúdo em linha, ícones sem encolhimento e intervalo (8px).

A variante textual usa ciano escuro, sem borda, e sublinhado no hover. O botão de ícone tem mínimo (32px) em cada dimensão, cor muted e fundo control-hover no hover. Todos preservam o foco global. Botões desabilitados usam opacidade (0.55) e cursor not-allowed.

### Inputs / Fields

Campos brancos, borda de um pixel, padding e raio de field, rótulo acima e margem superior (7px). O hover altera a borda para field-hover-border; o foco usa field-focus-border e contorno global. Textareas têm entrelinha (1.65), mínimo (95px) e redimensionamento vertical. Selects têm mínimo (40px).

O nome do rascunho é uma variante editorial: fundo transparente, apenas borda inferior, sem arredondamento e peso (600). O seletor de atendente pode ficar desabilitado conforme a escolha de departamento; não existe estilo customizado de erro inline nos campos.

### Navigation

Itens com ícone de traço e texto, alinhados à esquerda, altura mínima (44px). O item atual usa nav-current, texto branco e aria-current. O hover usa nav-hover. No celular a lista muda para linha, com altura mínima (36px), mantendo acesso por clique e teclado.

### Chips / Tags

A identificação “Demonstração local” é um rótulo informativo estático, não um filtro. Usa os três tokens badge, borda de um pixel, peso (600), tamanho (0.71rem) e texto sem quebra; no celular usa (0.65rem).

### Cards / Containers

Os contêineres são áreas de trabalho planas, não uma biblioteca de cartões flutuantes. O editor branco compartilha limites com a conversa e, no modo avançado, também com o índice. O painel de catálogo tem borda superior e padding (28px), reduzido a (20px 14px) no celular.

### Paths Editor

Cada menu reúne nome, mensagem e “Opções e próximos passos”. Fieldsets com legenda e divisórias superior e esquerda organizam as ramificações; resposta e texto usam grade de (85px) e coluna flexível, reduzida a (68px) até 1000px. O seletor de próximo passo abre menu, mensagem ou transferência dentro da escolha; “Parar o robô aqui” mostra que o chamado permanece aberto. Destinos compartilhados são identificados. Retornos, etapas já expandidas e caminhos a partir de quatro níveis usam referência com “Abrir esta etapa” e retorno ao início. “Desfazer alteração” recupera até 40 estados locais. O assistente guiado permanece uma evolução futura.

### Step Index

Preservado no modo avançado. Cada botão reúne símbolo do tipo, número e nome, resumo truncado e indicação textual de início quando aplicável. A etapa selecionada usa step-selected e sua borda, além de aria-pressed. Resumos usam muted. O estado de hover usa control-hover. A faixa horizontal no celular mantém esse conteúdo e a mesma ação de seleção.

### Configuração das regras

A área de regras do editor apresenta contagem de regras ativas, pendências e **Configurar regras**. O assistente usa uma coluna central de até 600px, uma pergunta por tela, escolhas Sim/Não em linhas inteiras clicáveis e campos condicionais. Ajuda longa fica recolhida. Voltar e Continuar seguem no fluxo; o título recebe foco a cada etapa. Na criação por modelo, as oito perguntas usam os mesmos campos e linguagem; mapa/chat ficam fora dessas etapas para manter foco na decisão. A revisão oferece uma linha por regra e Alterar com nome acessível. Mensagens e seleção são preservadas ao navegar ou desativar. Paleta e tipografia seguem os tokens existentes, inclusive no tema escuro. Contrato: [SPEC-014](specs/014-regras-guiadas.md).

Na etapa de inatividade ativa, a conta conectada mostra o prazo atual, um campo numérico e a ação secundária **Atualizar prazo da empresa**. A informação de alcance fica junto à ação. Carregamento, falha, conflito e resultado incerto têm retorno local; o texto do robô é preservado. O cliente consulta novamente para conferir uma alteração incerta. A navegação fica desabilitada durante a gravação. Catálogos locais orientam conectar e não exibem valores fictícios. Contrato: [SPEC-015](specs/015-prazo-inatividade-empresa.md).

### Conversation Preview

Área tonal com cabeçalho, avatar circular, subtítulo em muted e mensagens separadas por (12px). O texto preserva quebras e aceita palavras longas. Mensagens do robô alinham à esquerda e respostas à direita. As opções são botões brancos de altura mínima (38px), borda azul-acinzentada e foco global. A atualização usa aria-live polite; a ação de reinício tem nome acessível.

No editor por caminhos, a variante de chat usa cabeçalho azul-marinho, histórico azul claro, mensagens do robô brancas e texto de mensagem (0.82rem). O campo “Responder como contato” aceita a resposta exata ou os botões de opção; texto sem correspondência mantém o menu aguardando. “Testar este menu” identifica a prévia parcial, oferece “Testar desde o início” e abre a conversa no celular. O histórico rola internamente até a nova troca, preservando acesso ao texto longo; reiniciar volta ao começo. A simulação continua local e não envia mensagens reais.

### Review and Feedback

Pendências são linhas clicáveis que levam à etapa correspondente; o texto em terra recebe fundo diagnostic-hover no hover. O sucesso usa título e ícone de conferência. Avisos e estado do rascunho permanecem textuais; a ação de desfazer aparece junto ao retorno de exclusão.

Os controles transitam apenas background-color, border-color e color durante (0.16s ease). Não há animação de entrada ou deslocamento decorativo. A preferência prefers-reduced-motion remove transições e força scroll-behavior auto.

## Do's and Don'ts

### Do:

- **Do** reutilizar as cores e papéis tipográficos documentados ao ampliar a interface.
- **Do** preservar foco visível, rótulos associados e indicação textual dos estados.
- **Do** manter o rodapé e o subtítulo da conversa na cor muted observada.
- **Do** reorganizar os blocos no celular, mantendo editor, ações e prévia acessíveis.
- **Do** distinguir demonstração, revisão estrutural e prévia ainda não homologada na linguagem visível.

### Don't:

- **Don't** substituir divisórias e superfícies planas por sombras em componentes equivalentes.
- **Don't** depender apenas de cor ou hover para comunicar seleção ou disponibilizar ações.
- **Don't** transformar a grade específica do criador em obrigação de todas as telas.
- **Don't** tratar nomes de tokens extraídos como variáveis CSS já implementadas.

## Regras de entrada — setembro de 2026

Editor e assistente compartilham os controles de regras do atendimento: entrada em ordem explícita (primeira mensagem, feriado, horário) e parada persistente em grupo separado. Feriados e horário começam desativados. O campo de aviso aparece ao ativar horário, com rótulo, limite de texto e pendência associada por `aria-describedby`; desativar preserva seu valor. Revisão e mapa exibem as regras ativas sem desenhar eventos persistentes como opções de menu. A simulação oferece seletores de dia e horário fictícios e distingue a mensagem de feriado da plataforma do conteúdo disponível localmente.

O atalho de retorno local fica junto às opções do submenu, com motivo textual quando indisponível (resposta 0 ocupada, limite de opções ou entrada que não é menu). Usa os tokens e controles existentes, em coluna no celular. Alterações continuam invalidando a prévia e reiniciando a simulação.
