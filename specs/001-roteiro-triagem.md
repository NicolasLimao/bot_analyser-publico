# SPEC-001 — roteiro de triagem, versão 1

Status: primeiro incremento executável; sem dependência de frontend ou IA.

O roteiro contém `schemaVersion: 1`, `id`, `name`, `accountId`, `entryNodeId` e `nodes`. IDs do roteiro são strings estáveis; nomes de recursos são obtidos do catálogo, nunca usados como chave.

O campo opcional `behavior` contém obrigatoriamente os booleanos `firstMessageOnly` e `stopOnAttendantMessage` quando informado. O primeiro restringe a entrada à primeira mensagem do chamado, sem bloquear respostas posteriores aos menus; o segundo interrompe por `USER_MESSAGE_SENT` via contexto persistente. A ausência mantém a semântica antiga do compilador. No frontend, novos robôs começam com `false`/`true`, respectivamente; rascunhos antigos sem o campo recebem esses padrões ao serem abertos. Um valor explícito `false` é preservado.

| Tipo de etapa | Campos além de `id` e `kind` | Comportamento |
| --- | --- | --- |
| `menu` | `message`, `options: [{id, value, label, target}]` | Envia uma mensagem composta pelo texto e opções; aguarda seleção exata |
| `message` | `text`, `next` | Envia texto e continua |
| `transfer` | `departmentId`, `userId` (string ou null), `next` | Transfere para departamento e atendente opcional e continua |
| `stop` | Nenhum | Interrompe o fluxo do robô; não fecha o chamado |

Campos desconhecidos são recusados para impedir funcionalidades silenciosamente ignoradas. A entrada HTTP/JSON é `unknown` e deve passar pela validação em runtime.

Todas as etapas aceitam `name` opcional, texto de até 80 caracteres. Vazio equivale a não nomear. É um rótulo de organização do roteiro: não altera IDs, conexões, mensagens ou o arquivo técnico compilado. Rascunhos anteriores sem `name` continuam válidos.

Critérios de aceitação:

- `TRI-01`: um roteiro válido com submenu e transferência é aceito sem mutação da entrada.
- `TRI-02`: rejeitar tipo/versão/campo desconhecido, texto vazio, mais de 200 etapas ou mais de 20 opções por menu. Limites são do MVP, não da Digisac.
- `TRI-03`: rejeitar IDs duplicados, opções com o mesmo valor após remoção de espaços nas extremidades e referências inexistentes. Valores devem chegar sem espaços externos; `1` e `01` permanecem distintos.
- `TRI-04`: todas as etapas devem ser alcançáveis pela entrada e possuir caminho possível até uma etapa `stop`.
- `TRI-05`: ciclos automáticos sem passar por um menu são inválidos. Retorno a menu é permitido se houver caminho de saída.
- `TRI-06`: conta do roteiro deve coincidir com o catálogo confiável fornecido pelo servidor. Departamento/usuário devem estar ativos e o vínculo deve existir. Catálogo incompleto, inválido ou com mais de cinco minutos é recusado.
- `TRI-07`: usuários homônimos são distinguidos por ID. Transferência sem atendente é válida; `null` não vira `{id: null}`.
- `TRI-08`: os diagnósticos contêm código estável, caminho de campo e mensagem em português; a entrada inválida não é compilada.

Entrada de demonstração: `examples/triage.json`. Todos os recursos de `examples/catalog.simulated.json` são fictícios. O catálogo é uma dependência do servidor, não um campo aceito junto com o roteiro enviado pelo cliente.

Não há inatividade, avaliações, retorno global por `0` ou contingência global configurável. Feriados e horário foram acrescentados pela [SPEC-008](008-politicas-de-entrada.md), como extensão aditiva de `behavior`, desativada quando ausente. Navegação para um menu pode ser representada por uma opção explícita. Regras adicionais exigem especificação e evidência próprias; texto livre não ativa comportamentos.
