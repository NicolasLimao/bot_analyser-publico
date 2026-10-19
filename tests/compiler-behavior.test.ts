import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePreview } from '../src/domain/compiler.ts';
import { fixtures, now } from './fixtures.ts';
import type { Draft } from '../src/domain/types.ts';

// Small independent interpreter of the serialized contexts. This verifies the
// observable contract; it is not a substitute for execution inside Digisac.
function simulate(
  replies: string[],
  behavior?: Draft['behavior'],
  firstMessage = true,
  environment = { holiday: false, companyOpen: true },
) {
  const { draft, catalog } = fixtures();
  if (behavior) draft.behavior = behavior;
  const compiled = compilePreview(draft, catalog, now);
  assert.equal(compiled.status, 'preview');
  if (compiled.status !== 'preview') throw new Error('Fixture did not compile');
  const contexts = JSON.parse(compiled.bot.defaultContexts);
  const messages: string[] = [];
  const sentActions: string[] = [];
  const evaluations: string[] = [];
  const transfers: { departmentId: string; userId: string | null }[] = [];
  let current = '@INIT';
  let messageFromAttendant = false;
  let closed = false;
  let iterations = 0;
  let receivedText = 'Olá';
  const matchesCondition = (
    condition: Record<string, any>,
    reply?: string,
  ): boolean => {
    if (condition.$and)
      return condition.$and.every((c: Record<string, any>) =>
        matchesCondition(c, reply),
      );
    return Object.entries(condition).every(([variable, expression]) => {
      const value =
        variable === '{{is_first_ticket_message}}'
          ? String(firstMessage)
          : variable === '{{is_holiday}}'
            ? String(environment.holiday)
            : variable === '{{is_company_open}}'
              ? String(environment.companyOpen)
              : variable === '{{is_message_from_me}}'
                ? String(messageFromAttendant)
                : reply;
      return expression.$eq === value;
    });
  };
  const dispatch = (
    event: string,
    reply?: string,
    contextId = current,
  ): boolean => {
    const rules = contexts[contextId].triggers[event] ?? [];
    let transitioned = false;
    for (const rule of rules) {
      const matches = rule.conditions.every((condition: Record<string, any>) =>
        matchesCondition(condition, reply),
      );
      for (const action of matches ? rule.actions : rule.fallbackActions) {
        sentActions.push(action.value);
        if (action.value === 'SEND_MESSAGE') messages.push(action.data.text);
        else if (action.value === 'TRANSFER_TICKET')
          transfers.push({
            departmentId: action.data.department,
            userId: action.data.user ?? null,
          });
        else if (action.value === 'SET_CONTEXT') {
          current = action.data.context;
          transitioned = true;
        } else if (action.value === 'CLOSE_TICKET') {
          assert.deepEqual(action.data, { ticketTopics: [] });
          closed = true;
        } else if (action.value === 'SEND_QUESTION')
          evaluations.push(action.data.question);
        else assert.fail(`Unsupported action in triage: ${action.value}`);
      }
    }
    return transitioned;
  };
  const settle = () => {
    while (dispatch('ENTER_CONTEXT', receivedText)) {
      assert.ok(++iterations < 100, 'Generated automatic flow must terminate');
    }
  };
  assert.ok(dispatch('MESSAGE_RECEIVED', 'Olá'));
  settle();
  firstMessage = false;
  for (const reply of replies) {
    // Explicit external event, including after CLOSE_TICKET. This does not
    // assume that the real platform emits it automatically.
    if (reply === '@closed') {
      closed = true;
      if (dispatch('TICKET_CLOSED', undefined, '@EVERY')) settle();
      continue;
    }
    if (closed) break;
    if (reply === '@holiday') {
      environment.holiday = true;
      environment.companyOpen = false;
    } else if (reply === '@attendant') {
      if (dispatch('USER_MESSAGE_SENT', undefined, '@EVERY')) settle();
    } else if (reply.startsWith('@inactive:')) {
      messageFromAttendant = reply === '@inactive:true';
      if (dispatch('TICKET_INACTIVE', undefined, '@EVERY')) settle();
    } else {
      receivedText = reply;
      if (dispatch('MESSAGE_RECEIVED', reply)) settle();
    }
  }
  return {
    messages,
    sentActions,
    evaluations,
    transfers,
    closed,
    stopped: contexts[current].triggers.ENTER_CONTEXT?.length === 0,
  };
}

test('serialized rules route commercial, return to entry, and transfer support without an attendant', () => {
  const result = simulate(['1', '0', '2']);
  assert.deepEqual(result.messages, [
    'Olá {{contact_name}}! Como podemos ajudar?\n\n1 - Comercial\n2 - Suporte',
    'Escolha uma opção:\n\n1 - Falar com o comercial\n0 - Voltar ao início',
    'Olá {{contact_name}}! Como podemos ajudar?\n\n1 - Comercial\n2 - Suporte',
    'Aguarde. Em breve nossa equipe continuará seu atendimento.',
  ]);
  assert.deepEqual(result.transfers, [
    { departmentId: 'demo-support', userId: null },
  ]);
  assert.equal(result.stopped, true);
});

test('ticket inactivity sends the configured notice before closing, including after attendant stop', () => {
  for (const firstMessageOnly of [false, true])
    for (const stopOnAttendantMessage of [false, true])
      for (const respectHolidays of [false, true])
        for (const enabled of [false, true]) {
          const result = simulate(
            ['1', '@attendant', '@inactive:true', '0', '2'],
            {
              firstMessageOnly,
              stopOnAttendantMessage,
              respectHolidays,
              businessHours: { enabled, closedMessage: 'Fora do horário.' },
              ticketInactivity: {
                enabled: true,
                message: 'Encerramento por inatividade.',
              },
            },
          );
          assert.equal(result.closed, true);
          assert.equal(result.messages.at(-1), 'Encerramento por inatividade.');
          assert.equal(
            result.messages.filter((m) => m === 'Encerramento por inatividade.')
              .length,
            1,
          );
          assert.equal(result.transfers.length, 0);
        }
});

test('false inactivity condition neither closes nor fabricates a return to the previous menu', () => {
  const behavior = {
    firstMessageOnly: false,
    stopOnAttendantMessage: true,
    ticketInactivity: { enabled: true, message: 'Aviso de encerramento.' },
  };
  const result = simulate(['1', '@inactive:false', '0', '2'], behavior);
  assert.equal(result.closed, false);
  assert.equal(result.messages.length, 2);
  assert.equal(result.transfers.length, 0);
  assert.ok(!result.messages.includes('Aviso de encerramento.'));
  // Persistent events still have their own rules after the unconnected branch.
  assert.equal(
    simulate(['@inactive:false', '@inactive:true'], behavior).closed,
    true,
  );
});

test('serialized closing event sends only the farewell after manual or inactivity closure', () => {
  const behavior = {
    firstMessageOnly: true,
    stopOnAttendantMessage: true,
    ticketInactivity: { enabled: true, message: 'Aviso antes de fechar.' },
    afterTicketClosed: { enabled: true, message: 'Obrigado pelo contato!' },
  };
  for (const replies of [
    ['@attendant', '@closed', '2'],
    ['1', '@inactive:true', '@closed', '0'],
  ]) {
    const result = simulate(replies, behavior);
    assert.equal(result.closed, true);
    assert.equal(result.messages.at(-1), 'Obrigado pelo contato!');
    assert.equal(
      result.messages.filter((m) => m === 'Obrigado pelo contato!').length,
      1,
    );
    assert.equal(result.transfers.length, 0);
    if (replies.includes('@inactive:true'))
      assert.deepEqual(result.messages.slice(-2), [
        'Aviso antes de fechar.',
        'Obrigado pelo contato!',
      ]);
  }
  assert.ok(
    !simulate(['@inactive:false'], behavior).messages.includes(
      'Obrigado pelo contato!',
    ),
  );
  assert.ok(
    !simulate(['@inactive:true'], behavior).messages.includes(
      'Obrigado pelo contato!',
    ),
  );
  assert.ok(
    !simulate(['@closed'], {
      ...behavior,
      afterTicketClosed: { enabled: false, message: 'Obrigado pelo contato!' },
    }).messages.includes('Obrigado pelo contato!'),
  );
});

test('evaluation is the final serialized action after conventional messages on manual and automatic closing', () => {
  for (const closingMessage of [false, true]) {
    const behavior = {
      firstMessageOnly: true,
      stopOnAttendantMessage: true,
      ticketInactivity: { enabled: true, message: 'Aviso antes de fechar.' },
      afterTicketClosed: {
        enabled: closingMessage,
        message: 'Despedida antes da avaliação.',
      },
      afterTicketClosedEvaluation: { enabled: true, questionId: 'demo-csat' },
    };
    for (const replies of [
      ['1', '@attendant', '@closed'],
      ['1', '@inactive:true', '@closed'],
    ]) {
      const result = simulate(replies, behavior);
      assert.deepEqual(result.evaluations, ['demo-csat']);
      assert.equal(result.sentActions.at(-1), 'SEND_QUESTION');
      assert.equal(
        result.messages.includes('Despedida antes da avaliação.'),
        closingMessage,
      );
      assert.equal(
        result.messages.includes('Aviso antes de fechar.'),
        replies.includes('@inactive:true'),
      );
    }
    assert.deepEqual(simulate(['@inactive:false'], behavior).evaluations, []);
    assert.deepEqual(
      simulate(['@closed'], {
        ...behavior,
        afterTicketClosedEvaluation: {
          enabled: false,
          questionId: 'demo-csat',
        },
      }).evaluations,
      [],
    );
  }
});

test('disabled inactivity leaves normal transfers and attendant interruption unchanged', () => {
  const base = { firstMessageOnly: false, stopOnAttendantMessage: true };
  const disabled = {
    ...base,
    ticketInactivity: { enabled: false, message: 'Não enviar.' },
  };
  for (const replies of [
    ['@inactive:true', '1', '0', '2'],
    ['1', '@attendant', '@inactive:true', '0'],
  ]) {
    assert.deepEqual(simulate(replies, disabled), simulate(replies, base));
    assert.equal(simulate(replies, disabled).closed, false);
  }
});

test('first-message policy blocks entry but allows submenu replies and return on a new ticket', () => {
  const behavior = { firstMessageOnly: true, stopOnAttendantMessage: true };
  const blocked = simulate(['1', '1'], behavior, false);
  assert.deepEqual(blocked.messages, []);
  assert.deepEqual(blocked.transfers, []);
  assert.equal(blocked.stopped, true);
  assert.equal(
    simulate(['1', '0', '2'], behavior).transfers[0].departmentId,
    'demo-support',
  );
  assert.equal(
    simulate([], { ...behavior, firstMessageOnly: false }, false).messages
      .length,
    1,
  );
});

test('persistent attendant policy stops from either menu and leaves the flow running when disabled', () => {
  const behavior = { firstMessageOnly: true, stopOnAttendantMessage: true };
  for (const replies of [
    ['@attendant', '2'],
    ['1', '@attendant', '1'],
  ]) {
    const stopped = simulate(replies, behavior);
    assert.equal(stopped.stopped, true);
    assert.deepEqual(stopped.transfers, []);
  }
  assert.equal(
    simulate(['1', '@attendant', '1'], {
      ...behavior,
      stopOnAttendantMessage: false,
    }).transfers[0].departmentId,
    'demo-sales',
  );
});

test('serialized rules retain exact reply matching and the selected commercial attendant', () => {
  const invalid = simulate(['01', 'opção inexistente']);
  assert.equal(invalid.messages.length, 1);
  assert.equal(invalid.transfers.length, 0);
  assert.equal(invalid.stopped, false);
  const result = simulate(['1', '1']);
  assert.deepEqual(result.transfers, [
    { departmentId: 'demo-sales', userId: 'demo-user-1' },
  ]);
  assert.equal(result.stopped, true);
});

test('invalid replies warn once, repeat only the current menu, and accept subsequent exact choices', () => {
  const message = 'Escolha uma opção válida.';
  const behavior = {
    firstMessageOnly: true,
    stopOnAttendantMessage: true,
    invalidReply: { enabled: true, message },
  };
  for (const invalid of ['01', '1 ', ' 1', 'Comercial', '🙂', '9']) {
    const result = simulate([invalid, '1', '2', '0', '2'], behavior);
    assert.equal(result.messages.filter((m) => m === message).length, 2);
    assert.equal(
      result.messages[2],
      result.messages[0],
      'Initial menu is repeated',
    );
    assert.equal(
      result.messages[5],
      result.messages[3],
      'Submenu is repeated, not the entry',
    );
    assert.deepEqual(result.transfers, [
      { departmentId: 'demo-support', userId: null },
    ]);
    assert.equal(result.stopped, true);
  }
  const valid = simulate(['1', '1', 'inexistente'], behavior);
  assert.ok(!valid.messages.includes(message));
  assert.deepEqual(valid.transfers, [
    { departmentId: 'demo-sales', userId: 'demo-user-1' },
  ]);
  assert.equal(
    simulate(['x', 'x', 'x'], behavior).messages.filter((m) => m === message)
      .length,
    3,
  );
});

test('invalid replies coexist with all policies and never answer after a stop, closing or evaluation', () => {
  for (let mask = 0; mask < 64; mask++) {
    const behavior = {
      firstMessageOnly: Boolean(mask & 1),
      stopOnAttendantMessage: Boolean(mask & 2),
      respectHolidays: Boolean(mask & 4),
      businessHours: { enabled: Boolean(mask & 8), closedMessage: 'Fechado.' },
      ticketInactivity: {
        enabled: Boolean(mask & 16),
        message: 'Aviso de inatividade.',
      },
      afterTicketClosed: { enabled: true, message: 'Despedida.' },
      afterTicketClosedEvaluation: {
        enabled: Boolean(mask & 32),
        questionId: 'demo-csat',
      },
      invalidReply: { enabled: true, message: 'Resposta inválida.' },
    };
    const result = simulate(
      ['1', 'x', '0', '2', 'x', '@closed', 'x'],
      behavior,
    );
    assert.equal(
      result.messages.filter((m) => m === 'Resposta inválida.').length,
      1,
    );
    assert.deepEqual(
      result.evaluations,
      behavior.afterTicketClosedEvaluation.enabled ? ['demo-csat'] : [],
    );
    if (behavior.afterTicketClosedEvaluation.enabled)
      assert.equal(result.sentActions.at(-1), 'SEND_QUESTION');
    if (behavior.stopOnAttendantMessage)
      assert.ok(
        !simulate(['@attendant', 'x'], behavior).messages.includes(
          'Resposta inválida.',
        ),
      );
    if (behavior.ticketInactivity.enabled)
      assert.ok(
        !simulate(['@inactive:true', 'x'], behavior).messages.includes(
          'Resposta inválida.',
        ),
      );
    if (behavior.respectHolidays)
      assert.ok(
        !simulate(['x'], behavior, true, {
          holiday: true,
          companyOpen: true,
        }).messages.includes('Resposta inválida.'),
      );
    if (behavior.businessHours.enabled)
      assert.ok(
        !simulate(['x'], behavior, true, {
          holiday: false,
          companyOpen: false,
        }).messages.includes('Resposta inválida.'),
      );
  }
});

test('entry policies honor first-message, holiday and business-hours precedence in serialized runtime', () => {
  for (const firstMessageOnly of [false, true])
    for (const respectHolidays of [false, true])
      for (const enabled of [false, true])
        for (const first of [false, true])
          for (const holiday of [false, true])
            for (const companyOpen of [false, true]) {
              const result = simulate(
                [],
                {
                  firstMessageOnly,
                  stopOnAttendantMessage: true,
                  respectHolidays,
                  businessHours: {
                    enabled,
                    closedMessage: 'Estamos fechados.',
                  },
                },
                first,
                { holiday, companyOpen },
              );
              if (firstMessageOnly && !first)
                assert.deepEqual(result.messages, []);
              else if (respectHolidays && holiday)
                assert.deepEqual(result.messages, ['@botOnHoliday']);
              else if (enabled && !companyOpen)
                assert.deepEqual(result.messages, ['Estamos fechados.']);
              else assert.match(result.messages[0], /Comercial/);
              assert.equal(
                result.stopped,
                (firstMessageOnly && !first) ||
                  (respectHolidays && holiday) ||
                  (enabled && !companyOpen),
              );
              assert.deepEqual(result.transfers, []);
            }
});

test('new entry policies preserve local return and attendant interruption', () => {
  const behavior = {
    firstMessageOnly: true,
    stopOnAttendantMessage: true,
    respectHolidays: true,
    businessHours: { enabled: true, closedMessage: 'Estamos fechados.' },
  };
  const returned = simulate(['1', '@holiday', '0', '2'], behavior);
  assert.equal(returned.transfers[0].departmentId, 'demo-support');
  assert.equal(returned.messages.length, 4);
  const stopped = simulate(['1', '@attendant', '0'], behavior);
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.messages.length, 2);
});
