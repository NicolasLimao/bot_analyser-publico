# SPEC-012 — avaliação como última ação do pós-fechamento

## Escopo definido pelo responsável

Ordem de implementação: avaliação após fechamento → lembretes por falta de resposta ao robô → tratamento de respostas inválidas → fechamento como destino de um caminho. Persistência entre dispositivos, importação Word/JSON, migração de legado e documentação Word ficam apenas como ideias, sem implementação prevista.

Regra obrigatória: a avaliação sempre é a última ação do pós-fechamento. Toda mensagem convencional configurada para esse evento deve anteceder a avaliação. Nenhum destino ou ação adicional pode ser acrescentado após o envio da avaliação.

## Contrato e recursos

Extensão aditiva da versão 1: `behavior.afterTicketClosedEvaluation?: { enabled: boolean, questionId: string | null }`. Ausente significa desativado. O roteiro guarda somente o ID, nunca uma cópia editável da avaliação. Seleção nula é salvável, mas impede geração/exportação/envio quando a regra está ativa. Desativar preserva a seleção; cópias da mesma conta preservam o ID; personalizar o nome da empresa não modifica as configurações da avaliação da conta.

O catálogo normalizado recebe `questions?: { state: "ready" | "unavailable", items: Question[] }`. Catálogos antigos continuam válidos para roteiros sem avaliação ativa. Lista indisponível ou ausente, ID desconhecido, avaliação excluída e recurso de outra conta impedem o uso da avaliação. A demonstração contém somente uma avaliação fictícia identificada; a cópia local QA não recebe recursos inventados.

A consulta é feita com o Bearer no backend ao conectar, atualizar, preparar e revalidar antes do POST. A rota implementada é `GET /api/v1/questions?perPage=40&page=N`, seguindo o padrão do conector existente. O envelope paginado segue `data`, `total`, `limit`, `currentPage`, `lastPage`. **A URL e o envelope de resposta reais ainda precisam da amostra solicitada ao responsável; os testes da consulta são sintéticos.** O formato do recurso e de `SEND_QUESTION` vem da exportação local `JSON amostra de desenvolvimento não distribuída`.

O decodificador preserva ID, conta, nome, tipo CSAT/NPS, pergunta, duração, tentativas e mensagens de sucesso, resposta inválida e motivo. `deletedAt` determina a disponibilidade. Não altera o cadastro na Digisac. Paginação incompleta, IDs repetidos, quantidade divergente ou campos incompatíveis tornam a lista indisponível, sem liberar dados parciais. Uma falha da consulta opcional não impede login/roteiros que não usam avaliação; 401 invalida a sessão e conta divergente é rejeitada.

## Geração — perfil 0.7

Uma única regra `TICKET_CLOSED` em `@EVERY` compõe a sequência:

```text
Após fechamento de chamado
  → mensagem convencional, se habilitada
  → avaliação selecionada, se habilitada — última ação
```

Só avaliação: o evento aponta diretamente para `SEND_QUESTION_NODE`. Só mensagem: mantém a sequência da SPEC-011. Ambos: o contexto de mensagem executa `SEND_MESSAGE` e aponta para o contexto de avaliação; este executa somente `SEND_QUESTION`, sem conexão de saída nem `SET_CONTEXT` posterior. `flowJson` e `contexts` recebem o objeto do recurso da conta; `defaultContexts` recebe seu ID. A avaliação compartilha a entrada persistente com parada por atendente e chamado inativo.

O aviso anterior ao fechamento por inatividade não é duplicado no evento de fechamento. O envio da avaliação em fechamento automático depende da emissão real de `TICKET_CLOSED` pela Digisac. Não há filtro por origem do fechamento nem garantia local contra eventos repetidos. A versão do perfil participa dos IDs determinísticos e `importReady: false` permanece.

## Interface e prévia

Editor e assistente compartilham a opção **Solicitar avaliação após fechar o chamado**, seletor sem escolha automática, pergunta da conta e resumo da ordem. O botão **Atualizar avaliações** refaz a consulta do catálogo. Carregamento, lista vazia, falha, seleção removida e expiração têm estados explícitos; falhas e trocas de conta preservam o rascunho e não substituem a seleção.

A simulação mostra aviso de inatividade, fechamento, mensagem convencional e pergunta da avaliação nessa ordem, conforme as regras ativas. O ramo falso da inatividade não envia avaliação. A avaliação termina a sequência do robô; a prévia não envia notas nem simula relógio, tentativas, respostas automáticas ou persistência de resultados na plataforma. Mensagens configuradas no próprio cadastro da avaliação pertencem ao seu ciclo, não são ações convencionais posteriores do robô.

## Evidências e limites

A exportação local confirma o objeto em `SEND_QUESTION_NODE`/`contexts` e o ID em `defaultContexts`. O [manual oficial de avaliações](https://digisac.gitbook.io/manual-digisac-2-0/mais-opcoes/avaliacoes), consultado em 09/10/2026, descreve CSAT/NPS, prazo em minutos, tentativas e mensagens do cadastro, além do vínculo ao robô para disparo após fechamento. Não documenta o envelope do GET utilizado neste incremento.

Homologação ainda necessária: consulta real, reexportação do robô com a avaliação selecionada, evento após fechamento manual/automático e ciclo completo da avaliação. Nenhuma requisição de teste deve enviar notas reais ou modificar avaliações da conta.

## Verificação local — 09/10/2026

Formatação, TypeScript e build aprovados; **85 testes de domínio/API aprovados**, incluindo 64 combinações de políticas, a interpretação independente da ordem das ações serializadas, consulta paginada de avaliações e bloqueio de envio após remoção/indisponibilidade do recurso. **60 cenários distintos de navegador aprovados** em Chrome desktop/celular: a rodada completa aprovou 56 e encontrou uma expectativa de texto incorreta no novo teste e interferência do login novo no limite das sessões de teste; após corrigir a expectativa e isolar essas sessões, os 10 cenários de avaliação/conexão passaram. As capturas do editor em desktop/celular foram revisadas. Não houve login, alteração de avaliações, notas ou envio de robô reais à Digisac. A confirmação do GET e a homologação do ciclo real continuam pendentes.
