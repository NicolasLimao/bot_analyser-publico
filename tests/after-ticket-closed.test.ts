import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePreview } from '../src/domain/compiler.ts';
import { validateDraft } from '../src/domain/validate.ts';
import { createGuidedDraft, replaceCompany } from '../web/src/guided-model.ts';
import { fixtures, now } from './fixtures.ts';

const message = 'A Empresa X agradece seu contato, {{contact_name}}!';
const behavior = {
  firstMessageOnly: false,
  stopOnAttendantMessage: false,
  afterTicketClosed: { enabled: true, message },
};

test('after closing validates parameters and permits incomplete editable drafts', () => {
  const { draft, catalog } = fixtures();
  for (const config of [
    null,
    true,
    {},
    { enabled: 'true', message },
    { enabled: true },
    { enabled: false, message: 42 },
    { enabled: false, message: 'x'.repeat(4001) },
    { enabled: true, message, manualOnly: true },
  ]) {
    const invalid = {
      ...draft,
      behavior: { ...behavior, afterTicketClosed: config },
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
      behavior: { ...behavior, afterTicketClosed: { enabled, message: '  ' } },
    };
    const issues = validateDraft(incomplete, catalog, now);
    assert.ok(!issues.some((d) => d.code === 'INVALID_SCHEMA'));
    assert.equal(
      issues.some(
        (d) =>
          d.code === 'AFTER_CLOSE_MESSAGE_REQUIRED' &&
          d.path === 'behavior.afterTicketClosed.message',
      ),
      enabled,
    );
    assert.equal(
      compilePreview(incomplete, catalog, now).status,
      enabled ? 'invalid' : 'preview',
    );
  }
});

test('disabled closing message preserves generation and copying personalizes without mutating the source', () => {
  const { draft, catalog } = fixtures();
  draft.behavior = { firstMessageOnly: false, stopOnAttendantMessage: true };
  const original = compilePreview(draft, catalog, now);
  draft.behavior.afterTicketClosed = { enabled: false, message };
  assert.deepEqual(compilePreview(draft, catalog, now), original);
  const copy = createGuidedDraft('copy', draft);
  const replaced = replaceCompany(copy, 'Empresa X', 'Acme');
  assert.equal(
    replaced.behavior?.afterTicketClosed?.message,
    message.replace('Empresa X', 'Acme'),
  );
  assert.equal(copy.behavior?.afterTicketClosed?.message, message);
  assert.equal(draft.behavior.afterTicketClosed.message, message);
});

test('closing event agrees across representations and coexists with every existing policy', () => {
  for (let mask = 0; mask < 32; mask++) {
    const { draft, catalog } = fixtures();
    draft.behavior = {
      ...behavior,
      firstMessageOnly: Boolean(mask & 1),
      respectHolidays: Boolean(mask & 2),
      businessHours: {
        enabled: Boolean(mask & 4),
        closedMessage: 'Fora do horário.',
      },
      stopOnAttendantMessage: Boolean(mask & 8),
      ticketInactivity: {
        enabled: Boolean(mask & 16),
        message: 'Aviso de inatividade.',
      },
    };
    const result = compilePreview(draft, catalog, now);
    assert.equal(result.status, 'preview');
    if (result.status !== 'preview') continue;
    assert.equal(result.importReady, false);
    const {
      contexts,
      defaultContexts,
      flowJson: { nodes, edges },
    } = result.bot;
    const runtime = JSON.parse(defaultContexts);
    const events = runtime['@EVERY'].triggers;
    assert.equal(events.TICKET_CLOSED.length, 1);
    assert.equal(Boolean(events.USER_MESSAGE_SENT), Boolean(mask & 8));
    assert.equal(Boolean(events.TICKET_INACTIVE), Boolean(mask & 16));
    const persistent = nodes.filter((n) => n.type === 'PERSISTENT_START_NODE');
    assert.equal(persistent.length, 1);
    const triggers = nodes.filter(
      (n) =>
        n.type === 'TRIGGER_NODE' &&
        (n.data.trigger as { type: string }).type === 'TICKET_CLOSED',
    );
    assert.equal(triggers.length, 1);
    const event = triggers[0];
    assert.equal(event.data.inactivityTime, null);
    assert.deepEqual(event.data.followUpMessages, []);
    assert.ok(
      edges.some((e) => e.source === persistent[0].id && e.target === event.id),
    );
    const messageId = edges.find((e) => e.source === event.id)!.target;
    const messageNode = nodes.find((n) => n.id === messageId)!;
    assert.equal(messageNode.type, 'MESSAGE_NODE');
    assert.equal(messageNode.data.text, message);
    assert.equal(messageNode.data.hasAnswers, false);
    assert.equal(messageNode.data.waitForResponse, false);
    assert.ok(!edges.some((e) => e.source === messageId));
    assert.deepEqual(events.TICKET_CLOSED[0].actions, [
      {
        data: { context: messageId },
        name: 'Definir contexto',
        value: 'SET_CONTEXT',
      },
    ]);
    assert.deepEqual(events.TICKET_CLOSED[0].conditions, []);
    assert.deepEqual(events.TICKET_CLOSED[0].fallbackActions, []);
    const actions = runtime[messageId].triggers.ENTER_CONTEXT[0].actions;
    assert.deepEqual(actions, [
      {
        data: { text: message },
        name: 'Enviar mensagem',
        value: 'SEND_MESSAGE',
      },
    ]);
    const editorEvent = contexts
      .find((c) => c.id === '@EVERY')!
      .triggers.find((t) => t.trigger.type === 'TICKET_CLOSED')!;
    assert.equal(editorEvent.rules[0].actions[0].data.context, messageId);
    const editorMessage = contexts.find((c) => c.id === messageId)!.triggers[0]
      .rules[0];
    assert.deepEqual(
      editorMessage.actions.map((a) => ({ ...a.type, data: a.data })),
      actions,
    );
    // Closing is a separate event: the inactivity path keeps its original terminal close action.
    for (const close of nodes.filter((n) => n.type === 'CLOSE_TICKET_NODE')) {
      assert.ok(!edges.some((e) => e.source === close.id));
      assert.deepEqual(
        runtime[close.id].triggers.ENTER_CONTEXT[0].actions.map(
          (a: { value: string }) => a.value,
        ),
        ['CLOSE_TICKET'],
      );
    }
    const ids = new Set(nodes.map((n) => n.id));
    assert.equal(ids.size, nodes.length);
    for (const edge of edges)
      assert.ok(ids.has(edge.source) && ids.has(edge.target));
    assert.deepEqual(
      compilePreview(
        { ...draft, nodes: [...draft.nodes].reverse() },
        catalog,
        now,
      ),
      result,
    );
  }
});
