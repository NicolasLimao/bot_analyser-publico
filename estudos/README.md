# Estudos do bot_analyser

Esta pasta explica a implementação do repositório e oferece um laboratório local para acompanhar a transformação de um roteiro em uma prévia de robô V3. Comece aqui mesmo que ainda não conheça React ou a Digisac.

O projeto é um criador de robôs de atendimento: a pessoa monta menus, mensagens e transferências; o sistema valida os caminhos e gera JSON por regras determinísticas. A geração não usa IA. Importação Word e conversão de robôs legados ainda são propostas, não funcionalidades implementadas.

## Sequência de estudo

| Ordem | Material                                                  | O que você vai entender                                 |
| ----- | --------------------------------------------------------- | ------------------------------------------------------- |
| 1     | [Arquitetura e mapa do código](01-arquitetura.md)         | Responsabilidades do navegador, servidor e domínio      |
| 2     | [Do roteiro ao JSON V3](02-roteiro-e-compilacao.md)       | Dados, validações e as três representações do robô      |
| 3     | [Interface, API e conexão](03-interface-api-e-conexao.md) | Edição, simulação, rascunhos e envio                    |
| 4     | [Laboratório e exercícios](04-laboratorio.md)             | Executar exemplos, provocar erros e conferir resultados |

Reserve cerca de uma hora para uma primeira leitura com o laboratório. Os links apontam para o código original, para permitir comparar cada explicação com a implementação.

## Primeiro experimento

Na raiz do repositório, com Node.js 24 compatível com o [package.json](../package.json):

```powershell
node estudos/laboratorio.mjs
```

O laboratório importa o compilador real, lê os exemplos fictícios e imprime os resultados. Ele não exige servidor, instalação de dependências, credenciais ou conexão de rede, e não grava arquivos. Os cenários inválidos são intencionais.

Para conhecer a interface, siga as instruções do [laboratório](04-laboratorio.md) e escolha **Experimentar com dados de demonstração**.

## Vocabulário

| Termo                    | Significado no projeto                                                       |
| ------------------------ | ---------------------------------------------------------------------------- |
| Roteiro / `Draft`        | Documento que descreve o atendimento editável                                |
| Nó / etapa               | Um menu, mensagem, transferência ou parada                                   |
| Aresta / conexão         | Caminho de uma etapa para outra                                              |
| Catálogo / `Catalog`     | Departamentos e atendentes disponíveis para uma conta                        |
| Diagnóstico              | Problema com código, caminho do campo e mensagem                             |
| Prévia / `CompileResult` | Resultado da validação e compilação, com avisos e, se válido, o objeto `bot` |
| Homologação              | Verificação do JSON e de seu comportamento na plataforma real                |

A prévia continua experimental, com `importReady: false`. A simulação local percorre o roteiro; ela não comprova como a Digisac executará o robô. Consulte o [README principal](../README.md) e as [especificações](../specs/003-previa-v3.md) para os limites do produto.
