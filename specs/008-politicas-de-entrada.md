# SPEC-008 — políticas de entrada e retorno local


## Contrato e compatibilidade

Extensão aditiva de `schemaVersion: 1`: `behavior` mantém os dois booleanos existentes e aceita `respectHolidays?: boolean` e `businessHours?: { enabled: boolean, closedMessage: string }`. Ausência significa recurso desativado. Não há migração destrutiva nem mudança de significado dos campos antigos; por isso esta extensão não exige uma nova versão de schema. Leitores antigos rejeitam os campos novos, em vez de descartá-los.

O texto fora do horário tem até 4000 caracteres. Vazio é permitido no rascunho, mas, quando a regra está ativa, bloqueia compilação/exportação/envio com diagnóstico no campo. Desativar preserva o texto. Campos desconhecidos e tipos incorretos continuam recusados. Novos robôs preservam primeira mensagem desativada e parada por atendente ativada.

Na primeira ativação, quando o roteiro ainda não tem `businessHours`, o editor e o assistente preenchem um exemplo editável com `{{contact_name}}`, Empresa X e horário de segunda a sexta-feira, das 08h00 às 18h00. A interface orienta personalizar o exemplo; esse texto não configura a agenda real. Mensagens já salvas, inclusive vazias, não são sobrescritas ao reabrir ou reativar a regra.

## Execução gerada

Ordem fixa para novos roteiros: primeira mensagem → feriado → horário → entrada do roteiro. Cada condição só existe quando habilitada. A restrição à primeira mensagem abrange todos os avisos. Essa ordem difere da exportação de referência; não implementa importação do robô original.

- Feriado: `is_holiday == "true"` envia `@botOnHoliday` por `SEND_HOLIDAY_MESSAGE_NODE`/`SEND_MESSAGE` e para. A mensagem e o calendário dependem da configuração Digisac.
- Horário: `is_company_open == "true"` continua; falso envia o texto configurado e para. Não se interpreta texto como agenda e não se cria calendário local.
- Ambas as paradas mantêm o chamado aberto. A parada persistente por atendente é preservada.
- `flowJson`, `contexts` e `defaultContexts` devem concordar nos eventos, condições, ações e destinos. A prévia permanece experimental, com `importReady: false`.

## Edição e simulação

Os mesmos controles aparecem no editor e em uma etapa própria do assistente. Revisão e mapa apresentam a ordem e as regras ativas. A simulação permite escolher feriado/dia comum e dentro/fora do horário sem consultar nem alterar a agenda real. A mensagem de feriado é identificada como dependente da plataforma, sem inventar seu conteúdo.

O atalho de retorno adiciona uma opção local `0 — Voltar ao menu inicial` com vínculo ao menu de entrada. Só está disponível em outro menu quando a entrada é um menu, há menos de 20 opções e `0` está livre. Não sobrescreve opções existentes nem cria retorno global. O retorno não repete as políticas de entrada. A edição manual, remoção e desfazer continuam disponíveis.

## Aceitação

- Combinações de primeira mensagem, feriado e horário respeitam a precedência; novas regras desativadas preservam o comportamento anterior.
- Condições e destinos correspondem nas três representações; entrada inválida não gera robô.
- Parada por atendente continua funcionando durante menus, com as novas políticas ativas.
- Regras e texto sobrevivem a salvar/reabrir, copiar, editar e desativar/reativar.
- Rascunho incompleto é restaurável; exportação/envio permanecem bloqueados.
- Retorno local não duplica `0`, respeita limites e permite desfazer sem perder caminhos.
- Testes de navegador cobrem desktop e celular. Testes locais não homologam execução real na Digisac.
