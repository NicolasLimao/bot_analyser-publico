# Criador de robôs de atendimento

Interface React + TypeScript e backend Node.js + TypeScript para criar roteiros estruturados de robôs V3 da Digisac. A geração é determinística: o compilador transforma o roteiro em JSON e valida seus caminhos e destinos.

## Executar

Requer Node.js 24.13.1 ou outra versão 24 compatível com `package.json`.

```sh
npm ci
npm run build
npm start
```

Abra http://127.0.0.1:3001. Para desenvolvimento, use `npm run dev:api` e `npm run dev:web` em terminais separados. A interface de desenvolvimento fica em http://127.0.0.1:5173.

## Dados de demonstração

Na tela inicial, escolha **Experimentar com dados de demonstração**. Os dois catálogos locais são fictícios; o catálogo identificado como `snapshot` mantém esse nome de perfil por compatibilidade, mas seus 12 departamentos e identificadores foram inventados para esta edição. Ele não contém usuários nem consulta uma conta real.

O roteiro inicial, os catálogos e os testes usam os mesmos identificadores sintéticos. Para consultar sua conta, informe a instância e suas próprias credenciais pela interface. Senha e token não entram no roteiro exportado; as sessões ficam na memória do servidor e expiram ou desaparecem ao reiniciar.

## Funcionalidades e limites

- Criação guiada ou manual, edição por caminhos, revisão do mapa e simulação local de conversa.
- Consulta de departamentos, usuários e avaliações da conta conectada.
- Validação do roteiro, exportação JSON e envio autenticado para criar um robô na conta escolhida.
- Regras de entrada, horário, feriados, inatividade de chamado, despedida e avaliação após fechamento.
- Rascunhos locais no navegador, separados por conta e origem.

A geração V3 permanece experimental (`importReady: false`). A simulação valida o roteiro e não emula a plataforma. Aceitar o POST não ativa canais nem comprova o funcionamento do robô. Mudanças de prazo da empresa exigem conexão autorizada e podem afetar outros atendimentos; os detalhes estão nas specs.

Importação Word, migração de legado e documentação Word não fazem parte do caminho implementado. Exportações de contas e documentos operacionais não acompanham esta edição.

## Configuração e hospedagem

Use `.env.example` apenas como referência; `.env` fica local e é ignorado pelo Git. O projeto inclui um exemplo de configuração Square Cloud: escolha seu próprio subdomínio e configure `PUBLIC_ORIGIN` com a origem HTTPS efetivamente usada. Os domínios dos exemplos desta edição são fictícios.

Em produção, as sessões usam cookies Secure e a origem das escritas é verificada. A configuração de hospedagem deve preservar `Host` e HTTPS. Não copie credenciais, bancos, exportações de contas ou documentos preenchidos para o repositório.

## Verificações

```sh
npm run check
npm run demo
npm run build
npx playwright install chrome
npm run test:e2e
```

A suíte usa fixtures sintéticas e transportes simulados. Esses checks não substituem homologação na sua conta. `.gitattributes` fixa finais de linha LF para as cópias de trabalho e a verificação de formatação, inclusive no Windows.

## Documentação

- [Arquitetura e estudos](estudos/README.md)
- [Produto](PRODUCT.md) e [sistema visual](DESIGN.md)
- [Contrato de catálogo](specs/002-catalogo-digisac.md)
- [Conexão e envio](specs/005-conexao-digisac.md)
- [Preparação da edição pública](PUBLICATION.md)
