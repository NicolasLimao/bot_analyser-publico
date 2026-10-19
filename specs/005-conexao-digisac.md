# SPEC-005 — conexão e envio para a Digisac

Implementação local de login, catálogo de departamentos e usuários e criação de robô. Baseada no cURL de autenticação, no envelope de departamentos e no POST/GET de robô fornecidos pelo responsável em 10/09/2026. A extensão de usuários e vínculos de 13/09/2026 usa a rota e o include registrados no briefing, com validação automatizada por fixtures; o envelope real de usuários ainda precisa de confirmação na conta. Renovação de token permanece fora do escopo.

## Contrato externo

- `POST /api/v1/oauth/token`: formulário URL encoded com `grant_type=password`, `client_id=api`, `client_secret=secret`, `username`, `password` e `scope=*`, conforme o login observado. Exige resposta Bearer com token e validade positivos.

Compatibilidade de entrada verificada em 13/09/2026 no [formulário público da QA](https://demo-publico.digisac.chat/assets/app-DUAYNmJN.js): usuário e senha removem caracteres U+200B a U+200D e U+FEFF e espaços nas extremidades antes do envio; espaços internos são preservados. A integração aplica o mesmo tratamento. Erros OAuth explícitos de configuração recebem `LOGIN_CONFIGURATION`; HTTP 403 recebe `LOGIN_FORBIDDEN`; recusas restantes de HTTP 400/401 recebem `LOGIN_REJECTED` com o status remoto, sem afirmar que a senha está incorreta. Corpos de erro externos não são expostos. Testes sintéticos `LIVE-13/14` cobrem esses casos; a causa do relato de recusa na conta real ainda depende da mensagem exata ou de nova tentativa do responsável.

- `GET /api/v1/departments?perPage=40&page=N`: valida `data`, `total`, `limit`, `currentPage` e `lastPage`; coleta até 100 páginas/4.000 registros com limite total de 30 segundos. O avanço `page=N` ainda precisa de prova em uma conta real com várias páginas. Páginas repetidas, IDs duplicados, contagem divergente e contas misturadas invalidam o conjunto.
- `GET /api/v1/users?perPage=40&page=N&query=…`: inclui `departments` com atributos `id` e `name`. Usa o mesmo envelope paginado, até 100 páginas/4.000 usuários, compartilhando o limite de 30 segundos com a consulta de departamentos. Exige `id`, `name`, `accountId`, `archivedAt` e `departments` explícitos. Ausência de vínculos não é inferida de campo ausente; `departments: []` representa usuário sem departamento. Vínculos repetidos são deduplicados por ID. Referências UUID a departamentos ausentes da listagem são preservadas, sem criar departamentos selecionáveis; a validação do envio exige que o destino conste como ativo no catálogo. Identificadores malformados e vínculos explicitamente de outra conta continuam recusados. Não retorna dados pessoais extras do payload.
- `POST /api/v1/bots`: recebe o objeto recompilado pelo servidor, autenticado com Bearer da sessão. Respostas 2xx confirmam aceitação; captura somente um ID UUID válido, quando presente. Não ativa canais nem executa conversas.

A conta é derivada dos departamentos retornados pela conexão autenticada. O login inicial exige ao menos um departamento para identificar a conta. A sessão só recebe o catálogo completo depois das duas consultas; falha em usuários não produz sucesso parcial. Registros arquivados permanecem identificados como inativos e não podem ser selecionados para envio.

## Sessão e transporte

O servidor continua limitado ao localhost. Recebe a senha somente no login e mantém o access token apenas em memória. O frontend recebe resumo da conexão e cookie aleatório HttpOnly/SameSite=Strict com escopo `/api`. O cookie usa HTTP local; esta configuração não é uma implantação de produção. Sessões expiram em até oito horas ou antes, conforme o token; desconexão e reinício apagam o acesso local. Não há persistência nem refresh token.

URLs aceitas: HTTPS de um tenant diretamente sob `digisac.me`, `digisac.app`, `digisac.co`, `digisac.chat`, `digisac.io` ou `digisac.com.br`, sem credenciais, query/hash ou porta alternativa. Nome simples e verificação da página seguem a [SPEC-016](016-descoberta-instancia-login.md). Domínios personalizados precisam de suporte explícito futuro. DNS é validado e o endereço público aprovado é fixado na conexão, mantendo hostname/TLS. Requisições de API não seguem redirecionamentos; a verificação anônima da página aceita até dois, dentro da mesma origem HTTPS. Requisições têm timeout de 12 segundos (seis segundos compartilhados na busca de páginas) e resposta máxima de 2 MiB. Erros não reproduzem respostas brutas, senha ou token.

O servidor recusa escrita de origem externa. O identificador da conexão vincula prévia e envio à sessão atual, evitando enviar um roteiro aberto em outra conexão. Limites locais: cinco tentativas de login por minuto, 100 sessões e 50 comprovantes de envio por sessão.

## API e interface locais

- `GET /api/connection`: resumo público ou `null`.
- `POST /api/connection`: `{origin, username, password}`; autentica, carrega departamentos e usuários e substitui a sessão somente em caso de sucesso.
- `POST /api/disconnect`: encerra a sessão e limpa o cookie.
- `profile=live` no bootstrap, catálogo e prévia utiliza a conexão do cookie. `X-Connection-Id` protege ações de abas com conexão anterior.
- `POST /api/bots`: `{draft, connectionId, requestId}`. Recompila, recarrega departamentos e usuários e revalida conta/recursos/vínculos antes do POST externo. Não aceita catálogo nem payload de robô arbitrário do navegador.

A conexão fica no menu lateral no desktop e no menu expansível de três barras até 720px. O menu mobile fecha ao navegar ou pressionar Escape, devolvendo foco ao botão, e abre quando é necessário reconectar. Departamentos e equipe lista setores com seus atendentes e todos os usuários, inclusive sem vínculo e arquivados. Editores e assistente guiado permitem atendente opcional, filtrado pelo departamento ativo. Trocar departamento limpa seleção incompatível; deixar em branco encaminha ao departamento.

Conectar, trocar catálogo e desconectar preservam o rascunho atual. Sessão expirada mostra login novamente, mantendo o editor. O envio exibe nome e instância antes do botão. Download e envio são ações independentes. Resultado confirmado mostra o ID disponível; falha de transporte ou 5xx depois de iniciar o POST mostra resultado incerto e orienta conferir a plataforma.

O controle de duplicação agrupa chamadas concorrentes com mesmo requestId ou conteúdo compilado dentro da sessão. Resultado confirmado ou incerto permanece guardado até a sessão terminar; rejeição definida permite corrigir e tentar novamente. Isso não garante entrega única entre sessões/reinícios nem substitui idempotência na API externa.

Recusas HTTP 400/409/422 com indicação explícita de unicidade do nome são normalizadas em HTTP 409, código `BOT_NAME_DUPLICATE`, com mensagem para alterar o nome e tentar novamente. O frontend mostra a causa junto ao envio e preserva o roteiro. HTTP sozinho, conflito de outro campo e nome obrigatório não caracterizam duplicidade. Payloads externos não são expostos. Transporte interrompido e 5xx continuam incertos, inclusive se o corpo mencionar duplicidade; editar o roteiro não libera outro envio após resultado incerto.

Limite de evidência: o payload real de duplicidade não está registrado no projeto. Os formatos de mensagem e erro de campo reconhecidos estão cobertos por fixtures sintéticas em `tests/digisac-live.test.ts` e `tests/e2e/live-server.ts`; a correspondência com a conta real permanece a confirmar.

## Evidência

O diagnóstico local da tentativa de conexão registrou uma resposta real de usuários com HTTP 200 na página 2 de 2, limite 40 e total 60. O envelope e os campos principais do registro foram aceitos; a falha foi na validação conjunta dos vínculos. O registro não distinguia vínculo repetido, ausente da listagem ou malformado, portanto não comprova qual deles ocorreu. A correção permite repetições e referências ausentes sem autorizar novos destinos, com regressão sintética de 60 usuários em duas páginas (`LIVE-16`). Os motivos restantes são distintos. O diagnóstico armazena somente tipos de campos, contagens e motivo, sem nomes, IDs, senha ou token (`LIVE-15`). Em 13/09/2026, o responsável confirmou que a conexão funcionou após esta correção; a evidência se limita à conta testada.

`tests/digisac-live.test.ts` cobre sessão, redaction, rede pública, paginação, conta, atualização de catálogo, deduplicação, duplicidade de nome, resultados incertos e isolamento HTTP. `tests/e2e/live.spec.ts` usa exclusivamente os servidores simulados das portas 3002/3003 (sessões isoladas por dispositivo), cobrindo login, seleção de departamento, envio, recusa por nome, outras recusas, correção, expiração, reconexão e desconexão em desktop/celular. Nenhuma credencial real é usada nesses testes.

Um GET HTTPS sem credenciais à QA retornou 401, verificando o transporte/TLS. O novo login e envio pelo frontend ainda devem ser exercitados pelo responsável na QA; a resposta 200 do POST manual anterior é evidência separada da estrutura do exemplo.

## Avaliações da conta — SPEC-012

A conexão consulta também as avaliações por GET autenticado no backend. A seleção é explícita por ID e vale para este robô, sem alterar o cadastro na plataforma. Falha da consulta opcional mantém os demais percursos disponíveis e bloqueia roteiros com avaliação ativa; 401 invalida a sessão. Antes do POST, a avaliação é novamente consultada e validada como disponível na mesma conta. A sequência de pós-fechamento sempre termina na avaliação, conforme [SPEC-012](012-avaliacao-pos-fechamento.md). Consulta real e execução ainda precisam de validação com a amostra da conta.

## Prazo de inatividade da empresa — SPEC-015

A etapa de inatividade conectada consulta o prazo por `GET /api/company/inactivity-time` com `X-Connection-Id`. A alteração explícita usa `PUT` local com conexão, valor e revisão da consulta; o backend relê, preserva as configurações no corpo observado e confirma por GET. PUT recebe a mesma proteção de origem de POST. Os dados completos de empresa permanecem no backend. Contrato, controle de conflitos e limites da evidência: [SPEC-015](015-prazo-inatividade-empresa.md).
