# SPEC-016 — verificar a página e descobrir a instância no login

Incremento solicitado em 14/10/2026. A entrada aceita o nome da instância (ex.: `empresa-exemplo`), hostname completo ou URL HTTPS. O nome simples gera exatamente cinco candidatos, nesta ordem: `digisac.me`, `digisac.app`, `digisac.co`, `digisac.chat` e `digisac.io`. Uma URL completa verifica somente seu endereço; `digisac.com.br` continua aceito para compatibilidade, sem participar da descoberta por nome.

## Verificação e autenticação

`POST /api/connection/resolve` recebe somente `{ origin }` e devolve `{ origins }` com as origens disponíveis. Não aceita credenciais nem cria ou altera sessões. Ao sair do campo de endereço, a interface inicia a consulta; o envio do formulário também verifica quando necessário e compartilha a consulta pendente. Usuário e senha podem ser preenchidos durante a busca.

- Um resultado exibe o hostname encontrado e permite conectar.
- Vários resultados exibem uma seleção obrigatória antes de conectar.
- Nenhum resultado apresenta erro junto ao endereço. A senha digitada é preservada para corrigir o endereço e tentar novamente.
- Alterar o endereço invalida o resultado anterior. Uma resposta atrasada não substitui a entrada mais recente.
- Após conectar, somente a origem efetivamente autenticada é lembrada no navegador.

Os cinco candidatos são consultados em paralelo, com GET anônimo da raiz e prazo compartilhado de seis segundos. HTTP 2xx indica página disponível; 404, 410 e DNS inexistente indicam ausência. Falhas de transporte, timeout e outros status informam impossibilidade de verificar, sem expor conteúdo remoto. Página disponível não comprova identidade da conta ou validade das credenciais; isso continua sendo verificado pelo OAuth e catálogo.

O backend de login também exige esta verificação, inclusive para chamadas que não usam a interface. Resultados positivos por origem são reaproveitados por até 60 segundos, com no máximo 128 entradas em memória. Nome ambíguo enviado diretamente ao login é recusado sem enviar a senha. O formulário sempre envia o endereço completo encontrado ou escolhido, nunca tenta autenticar a mesma senha nos cinco domínios.

## Limites de rede

São aceitos somente HTTPS e um rótulo de tenant válido nos sufixos permitidos. Credenciais na URL, portas alternativas, query/hash e subdomínios extras são recusados. Caminhos base `/api` e `/api/v1`, já aceitos anteriormente, são normalizados para a origem. Hostname sem esquema recebe HTTPS; espaços externos e caracteres invisíveis de colagem são removidos.

A verificação usa a validação de IP público, fixação do IP aprovado e TLS do transporte existente. Segue no máximo dois redirecionamentos, exclusivamente na mesma origem HTTPS e sem credenciais embutidas. O limite de resposta permanece em 2 MiB. Nenhum usuário, senha, Bearer ou cookie Digisac acompanha os GETs de descoberta. As chamadas de API autenticadas continuam sem seguir redirecionamentos.

O endpoint exige a mesma proteção de origem das demais escritas locais e limita consultas a dez por minuto por processo. O limite separado de cinco tentativas de login por minuto continua vigente.

## Verificação

`tests/instance.test.ts` cobre os cinco candidatos, normalização, URLs recusadas, consultas paralelas sem credenciais, escolha entre resultados, cache e expiração, página ausente, falhas, redirecionamentos e contrato/limites HTTP. `tests/e2e/instance-login.spec.ts` cobre descoberta, seleção, login no endereço escolhido, armazenamento da URL, recuperação de erros e respostas atrasadas em desktop/celular, usando somente transporte simulado.

As capturas de endereço encontrado e seleção múltipla ficam em `.impeccable/review/instance-{found,choice}-{desktop,mobile}.png`. Não houve autenticação real nem envio de robô nesta tarefa.

Verificação final em 14/10/2026: formatação, TypeScript e build aprovados; **104 testes de domínio/API e 84 cenários de navegador aprovados** na suíte completa em Chrome desktop/celular. Os 16 casos focais de login, entrada e conexão também passaram antes da rodada completa. As quatro capturas foram revisadas, com espaçamento corrigido nos textos de endereço e sem overflow horizontal nas larguras testadas. A disponibilidade de instâncias reais e o login no ambiente hospedado ainda precisam de validação na plataforma.
