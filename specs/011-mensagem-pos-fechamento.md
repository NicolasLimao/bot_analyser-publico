# SPEC-011 — mensagem após fechar o chamado

Atualização de 09/10/2026: a [SPEC-012](012-avaliacao-pos-fechamento.md) estende esta sequência com avaliação opcional, obrigatoriamente como última ação. A descrição abaixo registra o incremento de mensagem isolada.

## Contrato

Incremento de pós-atendimento previsto na análise do robô Limão. Extensão aditiva do roteiro versão 1: `behavior.afterTicketClosed?: { enabled: boolean, message: string }`. Ausente significa desativado. Texto limitado a 4000 caracteres; vazio pode ser salvo, mas bloqueia geração/exportação/envio quando ativo. Tipos incorretos e campos desconhecidos são recusados. Desativar preserva o texto; cópias e personalização da empresa preservam/personalizam a mensagem.

## Geração


```text
A qualquer momento → Após fechamento de chamado → Mensagem configurada
```

`flowJson`, `contexts` e `defaultContexts` concordam no evento e no destino. A mensagem não espera resposta e sua regra contém somente `SEND_MESSAGE`, sem novo fechamento, reinício, avaliação ou parada que declare chamado aberto. A sequência encerra na mensagem. A avaliação da referência não é copiada, pois ainda exige catálogo e contrato próprios.

Uma única entrada persistente acumula pós-fechamento, mensagem do atendente e chamado inativo. O ramo de inatividade continua terminando em `CLOSE_TICKET`: não recebe ligação direta nem cópia da despedida. O pós-fechamento depende do evento emitido pela Digisac, incluindo fechamentos automáticos que gerem esse evento. Não há filtro por origem manual/automática nem garantia local contra eventos duplicados da plataforma.

A nova versão participa da geração dos IDs, como nos perfis anteriores. Regras desativadas preservam a semântica do roteiro; IDs mudam entre perfis. `importReady: false` permanece. O disparo real do evento, a entrega da mensagem com chamado fechado, a convivência com canais e o comportamento diante de eventos repetidos ainda precisam de homologação na Digisac.

## Interface e simulação

Editor e assistente compartilham **Enviar mensagem após fechar o chamado**, mensagem editável, pendência de preenchimento e resumo no mapa/revisão. Novos roteiros começam com a regra desativada. O texto explica que a combinação com inatividade pode enviar duas mensagens: aviso antes de fechar e despedida após o fechamento.

**Simular fechamento manual** encerra o caminho local e mostra a despedida. O ramo verdadeiro de **Simular chamado inativo** mostra aviso → fechamento → evento de pós-fechamento → despedida; o ramo falso não envia despedida. O encadeamento representa um cenário em que a plataforma emite o evento, sem comprovar que isso ocorrerá na conta. Uma vez fechado na simulação, os dois botões ficam desabilitados até reiniciar. Mensagem pendente aparece como diagnóstico no chat.

## Aceitação

- Rascunhos antigos e regras desativadas compatíveis; configuração incompleta salvável e exportação bloqueada.
- Um único evento de pós-fechamento nas três representações, convivendo com todas as combinações de políticas existentes.
- Mensagem terminal sem fechamento recursivo, avaliação ou retomada artificial do atendimento.
- Editor e assistente permitem preencher, salvar/reabrir, copiar, revisar e simular em desktop/celular.
- Simulação diferencia aviso anterior e despedida, não envia despedida no ramo falso e permite reiniciar.

## Verificação local — 09/10/2026

Formatação, TypeScript e build aprovados; **78 testes de domínio/API aprovados**, incluindo equivalência das três representações em 32 combinações e interpretação independente do evento serializado. **54 cenários distintos de navegador aprovados** em Chrome desktop/celular: a rodada completa aprovou 52 e identificou dois casos novos que tentavam salvar fora da aba Rascunho; após corrigir a navegação do teste, os quatro cenários de pós-fechamento passaram. Capturas do editor em desktop/celular revisadas, sem overflow horizontal. Não houve login, envio ou homologação real na Digisac.
