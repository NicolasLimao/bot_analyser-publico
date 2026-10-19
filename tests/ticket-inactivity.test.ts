import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePreview } from '../src/domain/compiler.ts';
import { validateDraft } from '../src/domain/validate.ts';
import { createGuidedDraft, replaceCompany } from '../web/src/guided-model.ts';
import { fixtures, now } from './fixtures.ts';

const message =
  'Olá {{contact_name}}, a Empresa X está encerrando este chamado por falta de interação.';
const behavior = {
  firstMessageOnly: false,
  stopOnAttendantMessage: true,
  ticketInactivity: { enabled: true, message },
};

test('ticket inactivity rejects malformed parameters and keeps blank drafts recoverable', () => {
  const { draft, catalog } = fixtures();
  for (const config of [
    null,
    true,
    {},
    { enabled: 'true', message },
    { enabled: true },
    { enabled: false, message: 42 },
    { enabled: false, message: 'x'.repeat(4001) },
    { enabled: true, message, inactivityTime: 10 },
  ]) {
    const invalid = {
      ...draft,
      behavior: { ...behavior, ticketInactivity: config },
    };
    assert.ok(
      validateDraft(invalid, catalog, now).some(
        (d) => d.code === 'INVALID_SCHEMA',
      ),
    );
    assert.equal(compilePreview(invalid, catalog, now).status, 'invalid');
  }
  for (const enabled of [false, true]) {
    const incomplete = {
      ...draft,
      behavior: { ...behavior, ticketInactivity: { enabled, message: '  ' } },
    };
    const issues = validateDraft(incomplete, catalog, now);
    assert.ok(!issues.some((d) => d.code === 'INVALID_SCHEMA'));
    assert.equal(
      issues.some(
        (d) =>
          d.code === 'INACTIVITY_MESSAGE_REQUIRED' &&
          d.path === 'behavior.ticketInactivity.message',
      ),
      enabled,
    );
    const result = compilePreview(incomplete, catalog, now);
    assert.equal(result.status, enabled ? 'invalid' : 'preview');
    if (enabled) assert.ok(!('bot' in result));
  }
});

test('disabled ticket inactivity preserves output and copies preserve its text', () => {
  const { draft, catalog } = fixtures();
  draft.behavior = { firstMessageOnly: false, stopOnAttendantMessage: true };
  const original = compilePreview(draft, catalog, now);
  draft.behavior = {
    ...behavior,
    ticketInactivity: { enabled: false, message },
  };
  assert.deepEqual(compilePreview(draft, catalog, now), original);
  const copy = createGuidedDraft('copy', JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(copy.behavior, draft.behavior);
  const replaced = replaceCompany(copy, 'Empresa X', 'Acme');
  assert.equal(
    replaced.behavior?.ticketInactivity?.message,
    message.replace('Empresa X', 'Acme'),
  );
  assert.equal(copy.behavior?.ticketInactivity?.message, message);
});

test('ticket inactivity graph, editor and runtime agree and share one persistent entry', () => {
  for (const stopOnAttendantMessage of [false, true]) {
    const { draft, catalog } = fixtures();
    draft.behavior = { ...behavior, stopOnAttendantMessage };
    const result = compilePreview(draft, catalog, now);
    assert.equal(result.status, 'preview');
    if (result.status !== 'preview') continue;
    assert.equal(result.importReady, false);
    const {
      flowJson: { nodes, edges },
      contexts,
      defaultContexts,
    } = result.bot;
    const runtime = JSON.parse(defaultContexts);
    const persistent = nodes.filter((n) => n.type === 'PERSISTENT_START_NODE');
    assert.equal(persistent.length, 1);
    const event = nodes.find(
      (n) =>
        n.type === 'TRIGGER_NODE' &&
        (n.data.trigger as { type: string }).type === 'TICKET_INACTIVE',
    )!;
    assert.equal(event.data.inactivityTime, null);
    assert.equal(event.data.continuityAttempts, 0);
    assert.deepEqual(event.data.followUpMessages, []);
    assert.ok(
      edges.some((e) => e.source === persistent[0].id && e.target === event.id),
    );
    const next = (id: string, handle = 'OUTPUT') =>
      edges.find((e) => e.source === id && e.sourceHandle === handle)!.target;
    const conditionId = next(event.id);
    const messageId = next(conditionId, 'OUTPUT_TRUE');
    const closeId = next(messageId);
    assert.ok(
      !edges.some(
        (e) => e.source === conditionId && e.sourceHandle === 'OUTPUT_FALSE',
      ),
    );
    assert.ok(!edges.some((e) => e.source === closeId));
    assert.deepEqual(nodes.find((n) => n.id === conditionId)!.data, {
      conditionType: 'and',
      conditions: [
        {
          variable: {
            value: 'is_message_from_me',
            name: 'Mensagem foi enviada pelo atendente',
            type: 'boolean',
          },
          operator: { value: '$eq', name: 'Igual', type: 'string' },
          target: 'true',
        },
      ],
    });
    assert.equal(nodes.find((n) => n.id === messageId)!.data.text, message);
    assert.equal(
      nodes.find((n) => n.id === closeId)!.type,
      'CLOSE_TICKET_NODE',
    );
    assert.deepEqual(nodes.find((n) => n.id === closeId)!.data, {});
    const every = runtime['@EVERY'].triggers;
    assert.deepEqual(every.TICKET_INACTIVE[0].data, {});
    assert.deepEqual(
      every.TICKET_INACTIVE[0].actions.map((a: any) => [a.value, a.data]),
      [['SET_CONTEXT', { context: conditionId }]],
    );
    assert.equal(Boolean(every.USER_MESSAGE_SENT), stopOnAttendantMessage);
    assert.ok(!every.BOT_INACTIVE && !every.TICKET_CLOSED);
    const condition = runtime[conditionId].triggers.ENTER_CONTEXT[0];
    assert.deepEqual(condition.conditions, [
      { $and: [{ '{{is_message_from_me}}': { $eq: 'true' } }] },
    ]);
    assert.deepEqual(condition.fallbackActions, []);
    assert.equal(condition.actions[0].data.context, messageId);
    assert.deepEqual(
      runtime[messageId].triggers.ENTER_CONTEXT[0].actions.map((a: any) => [
        a.value,
        a.data,
      ]),
      [
        ['SEND_MESSAGE', { text: message }],
        ['SET_CONTEXT', { context: closeId }],
      ],
    );
    assert.deepEqual(runtime[closeId].triggers.ENTER_CONTEXT[0].actions, [
      {
        data: { ticketTopics: [] },
        name: 'Fechar chamado',
        value: 'CLOSE_TICKET',
      },
    ]);
    const editorEvent = contexts
      .find((c) => c.id === '@EVERY')!
      .triggers.find((t) => t.trigger.type === 'TICKET_INACTIVE')!;
    assert.equal(editorEvent.rules[0].actions[0].data.context, conditionId);
    for (const id of [conditionId, messageId, closeId]) {
      const editor = contexts.find((c) => c.id === id)!.triggers[0].rules[0];
      const serialized = runtime[id].triggers.ENTER_CONTEXT[0];
      assert.deepEqual(
        editor.actions.map((a) => ({ ...a.type, data: a.data })),
        serialized.actions,
      );
      assert.deepEqual(editor.fallbackActions, []);
    }
    const ids = new Set(nodes.map((n) => n.id));
    assert.equal(ids.size, nodes.length);
    for (const edge of edges)
      assert.ok(ids.has(edge.source) && ids.has(edge.target));
  }
});
