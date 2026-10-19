# 4. Laboratório e exercícios

Execute os comandos a partir da raiz do repositório. Use a versão Node.js 24 aceita pelo [package.json](../package.json).

## Observar o núcleo pelo terminal

```powershell
node estudos/laboratorio.mjs
```

Leia [laboratorio.mjs](laboratorio.mjs) junto com a saída. O script usa o compilador e os exemplos originais; cada alteração acontece em uma cópia em memória.

| Cenário                              | Resultado esperado                              |
| ------------------------------------ | ----------------------------------------------- |
| Roteiro original                     | `preview`, 8 nós e 9 conexões                   |
| Duas regras de comportamento ligadas | `preview`, 13 nós                               |
| Conta diferente                      | `invalid`, inclui `ACCOUNT_MISMATCH`            |
| Destino inexistente                  | `invalid`, inclui `MISSING_TARGET`              |
| Mensagem em ciclo automático         | `invalid`, inclui `AUTOMATIC_CYCLE` e `NO_EXIT` |
| Catálogo antigo                      | `invalid`, inclui `CATALOG_STALE`               |

O script também imprime a mensagem inicial compilada e uma transferência em `defaultContexts`. Observe como os recursos aparecem como IDs nessa representação. Em todos os cenários, `importReady` permanece `false`.

O horário de referência é fixo para tornar o estudo reproduzível. O catálogo fictício recebe esse mesmo horário apenas em memória. Essa técnica pertence ao laboratório; na integração real, a atualidade do catálogo vem da consulta feita pelo backend.

A demonstração original do projeto também está disponível:

```powershell
npm run demo
npm run demo -- --json
```

## Explorar a interface

Se as dependências ainda não estiverem instaladas, execute `npm ci`. Depois:

```powershell
npm run build
npm start
```

Abra `http://127.0.0.1:3001` e escolha **Experimentar com dados de demonstração**. Crie a partir de um modelo, mude uma mensagem, acompanhe a prévia e teste uma resposta de menu. Salve o rascunho e recarregue a página para observar sua recuperação. Use `Ctrl+C` para encerrar o servidor.

Para trabalhar com atualização automática, abra dois terminais:

```powershell
# Terminal 1
npm run dev:api
```

```powershell
# Terminal 2
npm run dev:web
```

Nesse modo, abra `http://127.0.0.1:5173`. Os rascunhos são separados pela origem: um rascunho salvo na porta 3001 não aparece automaticamente na 5173.

## Exercícios de leitura

1. Siga a resposta `2` do menu `welcome` em [triage.json](../examples/triage.json). Identifique a transferência, a mensagem posterior e a parada.
2. Em [compiler.ts](../src/domain/compiler.ts), encontre `TYPE` e a criação dos contextos. Explique por que `menu` e `message` usam o mesmo tipo visual, mas regras diferentes.
3. Em [validate.ts](../src/domain/validate.ts), encontre `walkAutomatic`. Observe por que a busca para em menus e paradas.
4. Em [connections.ts](../src/digisac/connections.ts), encontre `publish`. Identifique onde o catálogo é consultado novamente e onde ocorre o POST externo.

## Exercícios de alteração local

Faça as mudanças no laboratório ou em cópias dos exemplos, executando novamente após cada mudança.

| Experimento                                                  | O que observar                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Trocar o texto da mensagem `waiting` em uma cópia do roteiro | Texto muda na prévia; a quantidade de nós permanece                 |
| Inverter a ordem de `draft.nodes`                            | Compilação mantém o mesmo resultado para o mesmo catálogo e horário |
| Usar um atendente existente em outro departamento            | Diagnóstico `USER_DEPARTMENT_MISMATCH`                              |
| Desativar somente `firstMessageOnly` no cenário de regras    | Quantidade de nós cai de 13 para 11                                 |
| Acrescentar uma parada sem ligação com a entrada             | Diagnóstico `UNREACHABLE_NODE`                                      |

## Como os testes ajudam a estudar

| Testes                                                          | Comportamentos para ler                        |
| --------------------------------------------------------------- | ---------------------------------------------- |
| [draft.test.ts](../tests/draft.test.ts)                         | Formato do roteiro, destinos e ciclos          |
| [compiler.test.ts](../tests/compiler.test.ts)                   | Determinismo e coerência das representações V3 |
| [compiler-behavior.test.ts](../tests/compiler-behavior.test.ts) | Regras serializadas de comportamento           |
| [digisac-live.test.ts](../tests/digisac-live.test.ts)           | Integração usando transporte simulado          |
| [server.test.ts](../tests/server.test.ts)                       | Contratos da API local                         |
| [tests/e2e](../tests/e2e)                                       | Percursos reais no navegador com Playwright    |

Para executar as verificações de formatação, tipos e testes unitários/API:

```powershell
npm run check
```

Para verificar os percursos no navegador, após o build e com Google Chrome instalado:

```powershell
npm run test:e2e
```

Esses comandos verificam a aplicação. A pasta de estudos fica fora dos caminhos de formatação e TypeScript definidos nos scripts atuais; sua verificação prática é executar o laboratório e conferir seus resultados. Os testes simulados não substituem a homologação na Digisac.
