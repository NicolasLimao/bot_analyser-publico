import type { Catalog, Diagnostic, Draft, Step } from './types.ts';
import { isCatalog, keys, object, text } from './catalog-schema.ts';

function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)
  );
}

export function targets(node: Step): string[] {
  if (node.kind === 'menu') return node.options.map((option) => option.target);
  return node.kind === 'stop' ? [] : [node.next];
}

function validateShape(input: unknown): Diagnostic[] {
  const issues: Diagnostic[] = [];
  const check = (condition: boolean, path: string, message: string) => {
    if (!condition) issues.push({ code: 'INVALID_SCHEMA', path, message });
  };
  if (!object(input))
    return [
      {
        code: 'INVALID_SCHEMA',
        path: '$',
        message: 'O roteiro deve ser um objeto.',
      },
    ];
  check(
    keys(input, [
      'schemaVersion',
      'id',
      'name',
      'accountId',
      'entryNodeId',
      'nodes',
      'behavior',
    ]),
    '$',
    'O roteiro contém campos não suportados.',
  );
  check(
    input.schemaVersion === 1,
    'schemaVersion',
    'A versão do roteiro deve ser 1.',
  );
  check(
    identifier(input.id),
    'id',
    'Informe um identificador alfanumérico, com hífen ou sublinhado, de até 128 caracteres.',
  );
  check(
    text(input.name, 200),
    'name',
    'Informe o nome do robô, com até 200 caracteres.',
  );
  check(text(input.accountId, 128), 'accountId', 'Informe a conta do roteiro.');
  if (input.behavior !== undefined) {
    check(
      object(input.behavior) &&
        keys(input.behavior, [
          'firstMessageOnly',
          'stopOnAttendantMessage',
          'respectHolidays',
          'businessHours',
          'ticketInactivity',
          'afterTicketClosed',
          'afterTicketClosedEvaluation',
          'invalidReply',
        ]) &&
        typeof input.behavior.firstMessageOnly === 'boolean' &&
        typeof input.behavior.stopOnAttendantMessage === 'boolean',
      'behavior',
      'As regras de atendimento devem conter as opções de primeira mensagem e parada por atendente, sem campos desconhecidos.',
    );
    if (object(input.behavior)) {
      const behavior = input.behavior;
      if (behavior.invalidReply !== undefined) {
        const invalidReply = behavior.invalidReply;
        check(
          object(invalidReply) &&
            keys(invalidReply, ['enabled', 'message']) &&
            typeof invalidReply.enabled === 'boolean' &&
            typeof invalidReply.message === 'string' &&
            invalidReply.message.length <= 4000,
          'behavior.invalidReply',
          'Informe a ativação da resposta inválida e um texto de até 4000 caracteres, sem campos desconhecidos.',
        );
      }
      check(
        behavior.respectHolidays === undefined ||
          typeof behavior.respectHolidays === 'boolean',
        'behavior.respectHolidays',
        'A regra de feriados deve ser uma opção booleana.',
      );
      if (behavior.businessHours !== undefined) {
        const hours = behavior.businessHours;
        check(
          object(hours) &&
            keys(hours, ['enabled', 'closedMessage']) &&
            typeof hours.enabled === 'boolean' &&
            typeof hours.closedMessage === 'string' &&
            hours.closedMessage.length <= 4000,
          'behavior.businessHours',
          'Informe a ativação do horário e um texto de até 4000 caracteres, sem campos desconhecidos.',
        );
      }
      if (behavior.ticketInactivity !== undefined) {
        const inactivity = behavior.ticketInactivity;
        check(
          object(inactivity) &&
            keys(inactivity, ['enabled', 'message']) &&
            typeof inactivity.enabled === 'boolean' &&
            typeof inactivity.message === 'string' &&
            inactivity.message.length <= 4000,
          'behavior.ticketInactivity',
          'Informe a ativação da inatividade e um texto de até 4000 caracteres, sem campos desconhecidos. O prazo é configurado na Digisac.',
        );
      }
      if (behavior.afterTicketClosed !== undefined) {
        const closing = behavior.afterTicketClosed;
        check(
          object(closing) &&
            keys(closing, ['enabled', 'message']) &&
            typeof closing.enabled === 'boolean' &&
            typeof closing.message === 'string' &&
            closing.message.length <= 4000,
          'behavior.afterTicketClosed',
          'Informe a ativação do pós-fechamento e um texto de até 4000 caracteres, sem campos desconhecidos.',
        );
      }
      if (behavior.afterTicketClosedEvaluation !== undefined) {
        const evaluation = behavior.afterTicketClosedEvaluation;
        check(
          object(evaluation) &&
            keys(evaluation, ['enabled', 'questionId']) &&
            typeof evaluation.enabled === 'boolean' &&
            (evaluation.questionId === null ||
              text(evaluation.questionId, 128)),
          'behavior.afterTicketClosedEvaluation',
          'Informe a ativação da avaliação e seu identificador, sem campos desconhecidos.',
        );
      }
    }
  }
  check(
    identifier(input.entryNodeId),
    'entryNodeId',
    'Informe a etapa inicial.',
  );
  if (
    !Array.isArray(input.nodes) ||
    input.nodes.length < 1 ||
    input.nodes.length > 200
  ) {
    check(false, 'nodes', 'O roteiro deve conter entre 1 e 200 etapas.');
    return issues;
  }
  input.nodes.forEach((node: unknown, index: number) => {
    const path = `nodes[${index}]`;
    if (!object(node)) {
      check(false, path, 'A etapa deve ser um objeto.');
      return;
    }
    check(
      identifier(node.id),
      `${path}.id`,
      'Identificador de etapa inválido.',
    );
    check(
      node.name === undefined ||
        (typeof node.name === 'string' && node.name.length <= 80),
      `${path}.name`,
      'O nome da etapa deve ser um texto de até 80 caracteres.',
    );
    switch (node.kind) {
      case 'menu':
        check(
          keys(node, ['id', 'kind', 'name', 'message', 'options']),
          path,
          'O menu contém campos não suportados.',
        );
        check(
          text(node.message),
          `${path}.message`,
          'Informe uma mensagem de até 4000 caracteres.',
        );
        if (
          !Array.isArray(node.options) ||
          node.options.length < 1 ||
          node.options.length > 20
        ) {
          check(
            false,
            `${path}.options`,
            'O menu deve ter entre 1 e 20 opções.',
          );
          break;
        }
        node.options.forEach((option: unknown, oi: number) => {
          const op = `${path}.options[${oi}]`;
          if (!object(option)) {
            check(false, op, 'A opção deve ser um objeto.');
            return;
          }
          check(
            keys(option, ['id', 'value', 'label', 'target']),
            op,
            'A opção contém campos não suportados.',
          );
          check(
            identifier(option.id),
            `${op}.id`,
            'Identificador da opção inválido.',
          );
          check(
            text(option.value, 20) && option.value === option.value.trim(),
            `${op}.value`,
            'Informe uma resposta de até 20 caracteres sem espaços externos.',
          );
          check(
            text(option.label, 200),
            `${op}.label`,
            'Informe o texto da opção, com até 200 caracteres.',
          );
          check(
            identifier(option.target),
            `${op}.target`,
            'Informe o destino da opção.',
          );
        });
        break;
      case 'message':
        check(
          keys(node, ['id', 'kind', 'name', 'text', 'next']),
          path,
          'A mensagem contém campos não suportados.',
        );
        check(
          text(node.text),
          `${path}.text`,
          'Informe uma mensagem de até 4000 caracteres.',
        );
        check(
          identifier(node.next),
          `${path}.next`,
          'Informe a próxima etapa.',
        );
        break;
      case 'transfer':
        check(
          keys(node, ['id', 'kind', 'name', 'departmentId', 'userId', 'next']),
          path,
          'A transferência contém campos não suportados.',
        );
        check(
          text(node.departmentId, 128),
          `${path}.departmentId`,
          'Selecione um departamento.',
        );
        check(
          node.userId === null || text(node.userId, 128),
          `${path}.userId`,
          'Selecione um atendente ou use null para transferir ao departamento.',
        );
        check(
          identifier(node.next),
          `${path}.next`,
          'Informe a próxima etapa.',
        );
        break;
      case 'stop':
        check(
          keys(node, ['id', 'kind', 'name']),
          path,
          'A parada contém campos não suportados.',
        );
        break;
      default:
        check(false, `${path}.kind`, 'Tipo de etapa não suportado.');
    }
  });
  return issues;
}

function validateResources(
  draft: Draft,
  catalog: Catalog,
  issues: Diagnostic[],
): void {
  const departments = new Map(catalog.departments.map((d) => [d.id, d]));
  const users = new Map(catalog.users.map((u) => [u.id, u]));
  draft.nodes.forEach((node, index) => {
    if (node.kind !== 'transfer') return;
    const path = `nodes[${index}]`;
    if (!departments.get(node.departmentId)?.active)
      issues.push({
        code: 'DEPARTMENT_UNAVAILABLE',
        path: `${path}.departmentId`,
        message: 'Departamento ausente ou indisponível na conta conectada.',
      });
    if (node.userId === null) return;
    const user = users.get(node.userId);
    if (!user?.active)
      issues.push({
        code: 'USER_UNAVAILABLE',
        path: `${path}.userId`,
        message: 'Atendente ausente ou indisponível na conta conectada.',
      });
    else if (!user.departmentIds.includes(node.departmentId))
      issues.push({
        code: 'USER_DEPARTMENT_MISMATCH',
        path: `${path}.userId`,
        message: 'O atendente não pertence ao departamento selecionado.',
      });
  });
}

export function validateDraft(
  input: unknown,
  catalogInput: unknown,
  now = Date.now(),
): Diagnostic[] {
  const issues = validateShape(input);
  if (issues.length) return issues;
  const draft = input as Draft;
  if (
    draft.behavior?.invalidReply?.enabled &&
    !draft.behavior.invalidReply.message.trim()
  )
    issues.push({
      code: 'INVALID_REPLY_MESSAGE_REQUIRED',
      path: 'behavior.invalidReply.message',
      message:
        'Preencha a mensagem para resposta inválida ou desative essa regra.',
    });
  if (
    draft.behavior?.afterTicketClosed?.enabled &&
    !draft.behavior.afterTicketClosed.message.trim()
  )
    issues.push({
      code: 'AFTER_CLOSE_MESSAGE_REQUIRED',
      path: 'behavior.afterTicketClosed.message',
      message:
        'Preencha a mensagem após fechar o chamado ou desative essa regra.',
    });
  if (
    draft.behavior?.ticketInactivity?.enabled &&
    !draft.behavior.ticketInactivity.message.trim()
  )
    issues.push({
      code: 'INACTIVITY_MESSAGE_REQUIRED',
      path: 'behavior.ticketInactivity.message',
      message:
        'Preencha a mensagem de encerramento por inatividade ou desative essa regra.',
    });
  if (
    draft.behavior?.businessHours?.enabled &&
    !draft.behavior.businessHours.closedMessage.trim()
  )
    issues.push({
      code: 'OUTSIDE_HOURS_MESSAGE_REQUIRED',
      path: 'behavior.businessHours.closedMessage',
      message:
        'Preencha a mensagem fora do horário ou desative a regra de horário de atendimento.',
    });
  if (!isCatalog(catalogInput))
    return [
      {
        code: 'CATALOG_INVALID',
        path: 'catalog',
        message: 'O catálogo não atende ao contrato normalizado.',
      },
    ];
  const catalog = catalogInput;
  const evaluation = draft.behavior?.afterTicketClosedEvaluation;
  if (evaluation?.enabled) {
    const path = 'behavior.afterTicketClosedEvaluation.questionId';
    if (!evaluation.questionId)
      issues.push({
        code: 'EVALUATION_REQUIRED',
        path,
        message: 'Selecione a avaliação enviada após fechar o chamado.',
      });
    if (catalog.questions?.state !== 'ready')
      issues.push({
        code: 'EVALUATIONS_UNAVAILABLE',
        path,
        message: 'Atualize as avaliações da conta antes de exportar ou enviar.',
      });
    else if (
      evaluation.questionId &&
      !catalog.questions.items.some(
        (q) => q.id === evaluation.questionId && q.active,
      )
    )
      issues.push({
        code: 'EVALUATION_UNAVAILABLE',
        path,
        message:
          'A avaliação selecionada não está disponível nesta conta. Escolha uma avaliação disponível.',
      });
  }
  if (!catalog.complete)
    issues.push({
      code: 'CATALOG_INCOMPLETE',
      path: 'catalog',
      message: 'A consulta do catálogo está incompleta.',
    });
  const age = now - Date.parse(catalog.fetchedAt);
  if (!Number.isFinite(age) || age > 300_000 || age < -30_000)
    issues.push({
      code: 'CATALOG_STALE',
      path: 'catalog.fetchedAt',
      message: 'Atualize o catálogo antes de gerar a prévia.',
    });
  if (draft.accountId !== catalog.accountId)
    issues.push({
      code: 'ACCOUNT_MISMATCH',
      path: 'accountId',
      message: 'O roteiro pertence a outra conta.',
    });
  validateResources(draft, catalog, issues);

  const byId = new Map<string, Step>();
  draft.nodes.forEach((node, i) => {
    if (byId.has(node.id))
      issues.push({
        code: 'DUPLICATE_NODE',
        path: `nodes[${i}].id`,
        message: 'Identificador de etapa repetido.',
      });
    byId.set(node.id, node);
    if (node.kind === 'menu') {
      const optionIds = new Set<string>();
      const values = new Set<string>();
      node.options.forEach((option, j) => {
        if (optionIds.has(option.id) || values.has(option.value))
          issues.push({
            code: 'DUPLICATE_OPTION',
            path: `nodes[${i}].options[${j}]`,
            message: 'Identificador ou resposta repetidos no mesmo menu.',
          });
        optionIds.add(option.id);
        values.add(option.value);
      });
    }
  });
  if (!byId.has(draft.entryNodeId))
    issues.push({
      code: 'MISSING_ENTRY',
      path: 'entryNodeId',
      message: 'A etapa inicial não existe.',
    });
  draft.nodes.forEach((node, i) => {
    targets(node).forEach((target, ti) => {
      if (!byId.has(target))
        issues.push({
          code: 'MISSING_TARGET',
          path:
            node.kind === 'menu'
              ? `nodes[${i}].options[${ti}].target`
              : `nodes[${i}].next`,
          message: 'A etapa de destino não existe.',
        });
    });
  });
  if (
    issues.some((i) =>
      ['DUPLICATE_NODE', 'MISSING_TARGET', 'MISSING_ENTRY'].includes(i.code),
    )
  )
    return issues;

  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    targets(byId.get(id)!).forEach(visit);
  };
  visit(draft.entryNodeId);

  const exits = new Set(
    draft.nodes.filter((n) => n.kind === 'stop').map((n) => n.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of draft.nodes)
      if (!exits.has(node.id) && targets(node).some((id) => exits.has(id))) {
        exits.add(node.id);
        changed = true;
      }
  }
  const complete = new Set<string>();
  const visiting = new Set<string>();
  const automaticCycles = new Set<string>();
  const walkAutomatic = (id: string) => {
    const node = byId.get(id)!;
    if (complete.has(id) || node.kind === 'menu' || node.kind === 'stop')
      return;
    if (visiting.has(id)) {
      automaticCycles.add(id);
      return;
    }
    visiting.add(id);
    targets(node).forEach(walkAutomatic);
    visiting.delete(id);
    complete.add(id);
  };
  draft.nodes.forEach((n) => walkAutomatic(n.id));
  draft.nodes.forEach((node, i) => {
    if (!reachable.has(node.id))
      issues.push({
        code: 'UNREACHABLE_NODE',
        path: `nodes[${i}]`,
        message: 'Esta etapa não é alcançável pela entrada.',
      });
    if (!exits.has(node.id))
      issues.push({
        code: 'NO_EXIT',
        path: `nodes[${i}]`,
        message: 'Esta etapa não possui caminho até uma parada.',
      });
    if (automaticCycles.has(node.id))
      issues.push({
        code: 'AUTOMATIC_CYCLE',
        path: `nodes[${i}]`,
        message: 'Ciclo automático sem espera por resposta.',
      });
  });
  return issues;
}
