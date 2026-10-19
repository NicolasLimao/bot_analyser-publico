# SPEC-015 — consultar e alterar o prazo de inatividade da empresa

Incremento solicitado em 14/10/2026, após a configuração guiada das regras. O responsável forneceu uma captura da atualização da conta e identificou `settings.ticketInactiveTime`. A captura contém autenticação e permanece somente como arquivo local; os testes usam exclusivamente dados sintéticos.

## Contrato observado e limite da evidência

A captura usa `PUT /api/v1/me/account?include[0]=defaultDepartment`, com `id`, `name`, `defaultDepartment`, `wizardProgress` e `settings` completos. `settings.ticketInactiveTime` é numérico, com valor 10 na amostra. `userAwayMinutesTime` pertence à ausência do atendente e não é alterado por este recurso.

O manual da empresa, consultado na tarefa anterior, identifica a unidade como minutos e o alcance como configuração da empresa. Esta entrega não presume que o PUT faça merge dos campos internos de `settings`. O GET da mesma rota é usado para ler e revalidar a conta. A consulta real com a autenticação fornecida retornou HTTP 403; o envelope de sucesso do GET e a execução real do ciclo GET/PUT/GET permanecem a homologar com uma conexão autorizada. O decodificador aceita somente o objeto raiz com os campos necessários; não inventa valores quando a resposta é incompatível.

## Separação dos dados

- O objeto completo é tratado somente pelo backend. O navegador recebe apenas `{ ticketInactiveTime, revision }`; `revision` é um UUID opaco associado à consulta na sessão.
- O backend não aceita `settings`, nome, departamento, conta nem configurações arbitrárias enviados pelo navegador para esta operação.
- A configuração continua pertencendo à empresa. Ela não é copiada para o roteiro, exportação, avaliação ou catálogo simulado. Alterar o prazo não altera a mensagem de encerramento do robô.
- Valores lidos devem ser inteiros seguros, maiores ou iguais a zero. Alterações aceitam somente inteiros seguros maiores que zero; o zero existente pode ser exibido, sem inferir um significado não confirmado.

## Leitura e gravação

`GET /api/company/inactivity-time` exige cookie de sessão e `X-Connection-Id`. Valida a conta retornada, o departamento relacionado e os campos necessários ao formato observado de atualização. Guarda somente fingerprint, revisão e instante da leitura na sessão; o conteúdo completo da conta não é persistido.

`PUT /api/company/inactivity-time` recebe `{ connectionId, ticketInactiveTime, revision }`. A revisão vale por até cinco minutos e pertence à sessão atual. O servidor:

1. Valida a entrada e exige uma consulta recente da mesma conexão.
2. Bloqueia gravações concorrentes desta empresa dentro do processo.
3. Consome a revisão e consulta novamente a conta; confirma que a sessão continua válida.
4. Compara os campos do corpo observado, inclusive todas as configurações, com a fingerprint da consulta anterior. Qualquer mudança causa conflito antes do PUT.
5. Monta o corpo observado usando os valores recém-consultados e substitui somente `settings.ticketInactiveTime`, preservando campos desconhecidos dentro de `settings`.
6. Faz o PUT e depois outro GET. Confirma o novo valor e a preservação dos campos enviados antes de informar sucesso.

Um valor já igual ao consultado é devolvido sem PUT. Falha de transporte, HTTP 408/5xx após iniciar a escrita, leitura de confirmação indisponível ou divergência na confirmação são resultados incertos. Não há repetição automática nem rollback que possa sobrescrever configurações posteriores. A revisão consumida não pode ser reutilizada; é necessário consultar novamente.

O controle local e a releitura reduzem conflitos, mas não oferecem atomicidade com alterações feitas diretamente na Digisac ou por outros processos entre o último GET e o PUT. A amostra não comprova suporte remoto a escrita condicional, ETag ou alteração parcial. Não é declarada garantia de exclusão entre sistemas.

Falhas e respostas incompatíveis não reproduzem o corpo da conta ou os cabeçalhos de autenticação. HTTP 401 encerra a sessão no backend; HTTP 403 informa ausência de permissão. PUT recebe a mesma proteção de origem das outras escritas locais.

## Interface

Ao escolher **Sim** na pergunta sobre encerramento por inatividade, a conta conectada consulta o prazo automaticamente. Mostra o valor atual, **Tempo de inatividade (minutos)**, alcance da alteração e **Atualizar prazo da empresa**. A mensagem de encerramento continua sendo editada na mesma etapa.

Alterar o campo numérico, navegar, salvar o rascunho ou criar/exportar um robô não altera a empresa. Somente o botão específico grava a configuração. Durante a escrita, as escolhas da regra e a navegação ficam indisponíveis até o resultado. Em conflito ou resultado incerto, o campo aguarda nova consulta; o valor digitado é preservado para conferência após recarregar o prazo. A consulta posterior pode confirmar que uma alteração antes incerta já foi aplicada.

Sem conexão ou usando catálogo local, a interface orienta conectar para consultar/alterar, sem exibir um prazo fictício. Uma falha de consulta permanece na etapa, preservando o texto do roteiro. O recurso está disponível tanto no assistente por modelo quanto na edição de um robô existente.

## Verificação

Testes de integração cobrem projeção dos dados, preservação de configurações desconhecidas, conflitos em outros campos, revisão expirada/reutilizada, corpo forjado, conta divergente, formato inválido, permissão, sessão, resultados incertos, concorrência e proteção HTTP de origem. Os cenários de navegador usam somente API simulada e cobrem consulta condicionada à escolha Sim, edição explícita, validação numérica, navegação durante a escrita, rascunho, nova consulta, conflito, erro de acesso e reconciliação de uma gravação incerta.

Verificação final em 14/10/2026: formatação, TypeScript e build aprovados; **97 testes de domínio/API e 76 cenários de navegador aprovados** na suíte completa em Chrome desktop/celular. Os 10 cenários focais de prazo/inatividade também passaram antes da rodada completa. Capturas `.impeccable/review/account-inactivity-{desktop,mobile}.png` revisadas, sem overflow horizontal nas larguras testadas. A única consulta real desta tarefa foi um GET que retornou HTTP 403; nenhum PUT real nem envio de robô foi executado na Digisac.
