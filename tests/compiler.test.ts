import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePreview } from '../src/domain/compiler.ts';
import { fixtures, now } from './fixtures.ts';
import { validateDraft } from '../src/domain/validate.ts';
import type { Context } from '../src/domain/types.ts';

test('behavior options keep graph, editor contexts and runtime branches consistent in all combinations', () => {
  for (const firstMessageOnly of [false, true])
    for (const stopOnAttendantMessage of [false, true]) {
      const { draft, catalog } = fixtures();
      draft.behavior = { firstMessageOnly, stopOnAttendantMessage };
      const result = compilePreview(draft, catalog, now);
      assert.equal(result.status, 'preview');
      if (result.status !== 'preview') continue;
      const { bot } = result;
      const defaults = JSON.parse(bot.defaultContexts);
      const nodes = new Map(bot.flowJson.nodes.map((n) => [n.id, n]));
      const ids = new Set(bot.contexts.map((c) => c.id));
      assert.equal(
        bot.flowJson.nodes.length,
        8 + (firstMessageOnly ? 2 : 0) + (stopOnAttendantMessage ? 3 : 0),
      );
      assert.deepEqual(Object.keys(defaults).sort(), [...ids].sort());
      for (const edge of bot.flowJson.edges)
        assert.ok(nodes.has(edge.source) && nodes.has(edge.target));
      for (const c of bot.contexts)
        for (const t of c.triggers)
          for (const r of t.rules) {
            for (const a of [...r.actions, ...r.fallbackActions])
              if (a.type.value === 'SET_CONTEXT')
                assert.ok(ids.has(a.data.context as string));
          }
      const condition = bot.flowJson.nodes.find(
        (n) => n.type === 'CONDITION_NODE',
      );
      assert.equal(Boolean(condition), firstMessageOnly);
      if (condition) {
        const rule = defaults[condition.id].triggers.ENTER_CONTEXT[0];
        assert.deepEqual(rule.conditions, [
          { $and: [{ '{{is_first_ticket_message}}': { $eq: 'true' } }] },
        ]);
        for (const [handle, actions] of [
          ['OUTPUT_TRUE', rule.actions],
          ['OUTPUT_FALSE', rule.fallbackActions],
        ] as const) {
          assert.equal(
            bot.flowJson.edges.find(
              (e) => e.source === condition.id && e.sourceHandle === handle,
            )?.target,
            actions[0].data.context,
          );
        }
      }
      assert.equal(
        Boolean(defaults['@EVERY'].triggers.USER_MESSAGE_SENT),
        stopOnAttendantMessage,
      );
      assert.equal(result.importReady, false);
    }
});

test('optional step names preserve generated behavior and reject malformed metadata', () => {
  const { draft, catalog } = fixtures();
  const original = compilePreview(draft, catalog, now);
  for (const step of draft.nodes) step.name = 'Atendimento comercial';
  assert.deepEqual(compilePreview(draft, catalog, now), original);
  for (const name of [null, 123, {}, 'x'.repeat(81)]) {
    const invalid = {
      ...draft,
      nodes: draft.nodes.map((step) => ({ ...step, name })),
    };
    assert.ok(
      validateDraft(invalid, catalog, now).some(
        (issue) =>
          issue.code === 'INVALID_SCHEMA' && issue.path.endsWith('.name'),
      ),
    );
  }
  for (const step of draft.nodes) step.name = '';
  assert.deepEqual(compilePreview(draft, catalog, now), original);
});

test('V3-01: deterministic preview independent of node array order, never marked importable', () => {
  const { draft, catalog } = fixtures();
  const first = compilePreview(draft, catalog, now);
  assert.equal(first.status, 'preview');
  assert.equal(first.importReady, false);
  draft.nodes.reverse();
  assert.deepEqual(compilePreview(draft, catalog, now), first);
  assert.ok(first.warnings.includes('SIMULATED_CATALOG'));
});

test('V3-02/03: same messages, choices and transitions in graph, contexts and defaultContexts', () => {
  const { draft, catalog } = fixtures();
  const result = compilePreview(draft, catalog, now);
  assert.equal(result.status, 'preview');
  if (result.status !== 'preview') return;
  const bot = result.bot;
  const ids = new Set(bot.flowJson.nodes.map((n) => n.id));
  const contextIds = new Set(bot.contexts.map((c) => c.id));
  const defaults = JSON.parse(bot.defaultContexts);
  assert.deepEqual(Object.keys(defaults).sort(), [...contextIds].sort());
  for (const edge of bot.flowJson.edges) {
    assert.ok(ids.has(edge.source) && ids.has(edge.target));
  }
  for (const c of bot.contexts)
    for (const t of c.triggers)
      for (const r of t.rules) {
        for (const action of r.actions) {
          if (action.type.value === 'SET_CONTEXT')
            assert.ok(contextIds.has(action.data.context as string));
        }
      }
  const menu = bot.flowJson.nodes.find(
    (n) =>
      n.data.text ===
      'Olá {{contact_name}}! Como podemos ajudar?\n\n1 - Comercial\n2 - Suporte',
  );
  assert.ok(menu);
  const context = bot.contexts.find((c) => c.id === menu.id)!;
  assert.equal(
    context.triggers[0].rules[0].actions[0].data.text,
    menu.data.text,
  );
  assert.equal(
    defaults[menu.id].triggers.ENTER_CONTEXT[0].actions[0].data.text,
    menu.data.text,
  );
  assert.deepEqual(defaults[menu.id].triggers.MESSAGE_RECEIVED[0].conditions, [
    { '{{message_text}}': { $eq: '1' } },
  ]);
});

test('V3-04: uses selected IDs and no null-id objects', () => {
  const { draft, catalog } = fixtures();
  const result = compilePreview(draft, catalog, now);
  assert.equal(result.status, 'preview');
  if (result.status !== 'preview') return;
  const transfers = result.bot.flowJson.nodes.filter(
    (n) => n.type === 'TRANSFER_TICKET_NODE',
  );
  assert.equal(transfers.length, 2);
  assert.ok(transfers.some((n) => n.data.user === null));
  assert.ok(JSON.stringify(result.bot).includes('demo-user-1'));
  assert.ok(!JSON.stringify(result.bot).includes('"id":null'));
});

test('V3-05: invalid drafts never include a bot', () => {
  const { draft, catalog } = fixtures();
  const result = compilePreview(
    { ...draft, accountId: 'foreign' },
    catalog,
    now,
  );
  assert.equal(result.status, 'invalid');
  assert.equal('bot' in result, false);
  assert.equal(result.importReady, false);
});

test('V3-04: serialized transfers use resource IDs while editor contexts retain objects', () => {
  const { draft, catalog } = fixtures();
  const result = compilePreview(draft, catalog, now);
  assert.equal(result.status, 'preview');
  if (result.status !== 'preview') return;
  const defaults = JSON.parse(result.bot.defaultContexts);
  const transfers = result.bot.flowJson.nodes.filter(
    (node) => node.type === 'TRANSFER_TICKET_NODE',
  );
  assert.equal(transfers.length, 2);
  for (const node of transfers) {
    const context: Context = result.bot.contexts.find(
      (item) => item.id === node.id,
    )!;
    const editorAction = context.triggers[0].rules[0].actions[0];
    const runtimeAction =
      defaults[node.id].triggers.ENTER_CONTEXT[0].actions[0];
    const department = node.data.department as { id: string };
    const user = node.data.user as { id: string } | null;
    assert.equal(runtimeAction.value, 'TRANSFER_TICKET');
    assert.deepEqual(editorAction.data.department, node.data.department);
    assert.deepEqual(
      runtimeAction.data,
      user
        ? { department: department.id, user: user.id }
        : { department: department.id },
    );
    if (user) assert.deepEqual(editorAction.data.user, node.data.user);
    else assert.equal('user' in editorAction.data, false);
  }
});
