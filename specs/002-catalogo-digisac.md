# SPEC-002 — consulta de catálogo

Atualização de 09/10/2026: o conector atual consulta departamentos e usuários com vínculos, além da lista opcional de avaliações descrita na [SPEC-012](012-avaliacao-pos-fechamento.md). `complete` cobre os recursos centrais; `questions.state` informa separadamente se as avaliações foram consultadas por completo. A confirmação real do GET de avaliações permanece pendente. As seções abaixo preservam o contrato e o histórico inicial.

Status: carregador genérico com transporte e decodificação injetáveis, mais integração HTTPS de departamentos descrita na [SPEC-005](005-conexao-digisac.md). O responsável forneceu em 10/09/2026 amostras do login, departamentos e primeira página de usuários. Vínculos usuário/departamento permanecem fora da integração; o avanço da paginação ainda exige prova em conta real. As respostas simuladas dos testes não são apresentadas como contrato da Digisac.

O criador local oferece `source: snapshot` usando `examples/catalog.qa-snapshot.json`: 12 departamentos fictícios, sem usuários. O perfil permite testar o editor sem conexão. `fetchedAt` indica quando o servidor leu o arquivo local; não é uma consulta à plataforma. O compilador emite `LOCAL_CATALOG_SNAPSHOT` para identificar essa origem.

Rotas fornecidas pelo responsável: `/api/v1/users?perPage=40` e `/api/v1/departments?perPage=40`. O construtor de requisições usa `perPage=40`, `page` externo e `query` codificado para incluir `departments` nos usuários. A posição de `page` e a combinação de parâmetros precisam ser confirmadas na instância antes de ativar uma integração real.

`loadCatalog` recebe uma base HTTPS configurada pelo servidor, identidade de conta confiável, transporte autenticado e decodificador explícito. Não implementa login nem recebe tokens do roteiro. A integração de departamentos utiliza `DigisacClient` e `Connections`, com validação de rede, sessão e limites conforme a SPEC-005. Os critérios abaixo descrevem o carregador genérico de ambos os recursos; o modo conectado atual consulta exclusivamente departamentos.

O decodificador produz páginas normalizadas `{records, hasMore}` a partir de `unknown`. Ele é responsável por validar o envelope e mapear registros reais para departamentos `{id, name, active}` ou usuários `{id, name, active, departmentIds}`. O carregador verifica novamente esses registros. `hasMore` é obrigatório; não inferir término apenas por quantidade de itens.

Critérios:

- `CAT-01`: base da instância, base terminada em `/api` e em `/api/v1` produzem a mesma rota; protocolo HTTP, credenciais embutidas, query/hash ou caminho arbitrário são rejeitados.
- `CAT-02`: carregar todas as páginas de ambos os catálogos. Parar por `hasMore: false`; limite de 100 páginas por recurso protege contra contratos defeituosos.
- `CAT-03`: erro de transporte, página malformada, ID repetido ou página vazia com continuação invalida a consulta inteira; não entregar snapshot parcial como completo.
- `CAT-04`: nomes podem repetir, IDs por tipo não. Usuário sem `departmentIds` explícito não permite inferir vínculos.
- `CAT-05`: snapshot só é marcado completo após terminar as duas listagens. A origem `simulated` ou `digisac` vem da configuração confiável do servidor.
- `CAT-06`: erros reportados ao consumidor não incluem payloads, URLs com credenciais ou mensagens brutas do transporte.

Usuários podem referenciar departamentos fora do catálogo visível; isso não autoriza selecioná-los. A validação do roteiro exige que o departamento selecionado exista e esteja ativo no catálogo autorizado.
