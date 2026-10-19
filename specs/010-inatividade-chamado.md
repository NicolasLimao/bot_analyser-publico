# SPEC-010 — aviso e fechamento por inatividade do contato

Atualização de 14/10/2026: a [SPEC-015](015-prazo-inatividade-empresa.md) acrescenta consulta e alteração explícita do prazo da empresa à interface conectada. O prazo continua externo ao roteiro e ao JSON do robô; o ciclo real GET/PUT/GET ainda requer homologação.

## Contrato

Incremento autorizado pelo responsável, que esclareceu a configuração do prazo na empresa e o ramo verdadeiro em 25/09/2026. Segue o caminho `TICKET_INACTIVE` da referência local `JSON amostra de desenvolvimento não distribuída` e o [manual oficial](https://digisac.gitbook.io/manual-digisac-2-0/mais-opcoes/robos/fluxograma/como-configurar-mensagem-de-inatividade), consultado nessa data. É separado de `BOT_INACTIVE`, cujas tentativas continuam pendentes na SPEC-009.

Extensão aditiva do roteiro versão 1: `behavior.ticketInactivity?: { enabled: boolean, message: string }`. Ausente significa desativado. Texto limitado a 4000 caracteres; vazio pode ser salvo, mas bloqueia geração/exportação/envio quando ativo. Tipos incorretos e campos desconhecidos, inclusive prazo local, são recusados. Desativar preserva o texto. Cópias e troca de nome da empresa preservam/personalizam essa mensagem.

## Geração

Uma entrada persistente compartilhada compõe os eventos de mensagem do atendente e chamado inativo, quando habilitados:

```text
A qualquer momento → Chamado inativo
  → Mensagem foi enviada pelo atendente? (is_message_from_me == "true")
    → Verdadeiro: enviar mensagem configurada → Fechar chamado
    → Falso: sem ligação e sem ações alternativas
```

O fechamento usa `CLOSE_TICKET_NODE` com `data: {}` no grafo e `CLOSE_TICKET` com `ticketTopics: []` nas ações, conforme a amostra. Não adiciona avaliação, pós-fechamento, assuntos ou reinício. Fechar é diferente de parar: o ramo realmente configura encerramento do chamado. O campo `inactivityTime` do gatilho permanece `null`; o evento serializado tem `data: {}`.

O prazo é configurado na Digisac: **Mais opções → Empresa → Atendimento → Tempo e inatividade → Tempo de inatividade de chamado (minutos)**. A integração da SPEC-015 permite consultar e alterar essa configuração na conta conectada. Ela não é duplicada no roteiro e não há relógio de produção no navegador.

O ramo falso deixa o contexto na condição, como na referência; não se promete restaurar o menu anterior. Não se converte a condição em fechamento incondicional. Parada por atendente e inatividade coexistem em `@EVERY`; a prioridade de eventos simultâneos e o ciclo real do temporizador dependem da plataforma. O perfil experimental permanece com `importReady: false`.

## Interface e simulação

Editor e assistente oferecem **Encerrar chamado por inatividade do contato**, desativado nos novos roteiros. Ao ativar, mostram mensagem editável e o local de configuração do prazo. Mapa e revisão apresentam a condição, os dois ramos e o fechamento.

A simulação dispara manualmente o evento, com escolha explícita do resultado da condição. Verdadeiro mostra o aviso e o chamado fechado; falso mostra a ausência de continuação, sem fechar nem restaurar artificialmente o menu. A simulação não mede prazo, não deduz se uma mensagem do robô conta como mensagem de atendente e não executa ações na conta. Pode testar o evento após uma parada local; após fechar, é necessário reiniciar para novo teste.

## Aceitação

- Campos e mensagens validados; rascunhos incompletos recuperáveis e recursos desativados compatíveis.
- `flowJson`, `contexts` e `defaultContexts` concordam no evento, condição, mensagem, fechamento e ausência do ramo falso.
- Evento não sobrescreve parada por atendente nem altera entrada, retornos e transferências.
- Testes de regras serializadas verificam ambos os resultados, com e sem intervenção de atendente; teste falso nunca fecha.
- Editor/assistente permitem editar, revisar, salvar/reabrir, copiar, desativar/reativar e simular em desktop/celular.
- Exportação ativa depende de mensagem válida, sem produzir configurações de prazo fictícias.

## Verificação local — 25/09/2026

74 testes de domínio/API e 50 cenários de navegador aprovados, com Chrome em desktop e celular. Formatação, TypeScript, build e revisão visual dos controles aprovados. A suíte de navegador usou um servidor atualizado na porta 3011, porque o processo existente na 3001 ainda executava o backend anterior e recusava o campo novo. O processo existente foi preservado; é necessário reiniciá-lo para usar a nova regra. Não houve envio de robô nem teste do prazo real na Digisac.
