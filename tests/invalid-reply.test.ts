import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtures, now } from './fixtures.ts';
import { compilePreview } from '../src/domain/compiler.ts';
import { validateDraft } from '../src/domain/validate.ts';

test('invalid reply policy validates its shape and requires a message only when enabled', () => {
  const { draft, catalog } = fixtures();
  const behavior = { firstMessageOnly: false, stopOnAttendantMessage: true };
  for (const invalidReply of [
    null,
    true,
    {},
    { enabled: 'yes', message: 'Oi' },
    { enabled: true, message: 1 },
    { enabled: true, message: 'x'.repeat(4001) },
    { enabled: false, message: 'Oi', extra: true },
  ]) {
    assert.ok(
      validateDraft(
        { ...draft, behavior: { ...behavior, invalidReply } },
        catalog,
        now,
      ).some((d) => d.code === 'INVALID_SCHEMA'),
    );
  }
  for (const enabled of [false, true]) {
    draft.behavior = { ...behavior, invalidReply: { enabled, message: '  ' } };
    assert.equal(
      compilePreview(draft, catalog, now).status,
      enabled ? 'invalid' : 'preview',
    );
    assert.equal(
      validateDraft(draft, catalog, now).some(
        (d) => d.code === 'INVALID_REPLY_MESSAGE_REQUIRED',
      ),
      enabled,
    );
  }
});

test('disabled invalid replies preserve the generated bot; enabled replies keep graph and rules consistent', () => {
  const { draft, catalog } = fixtures();
  draft.behavior = { firstMessageOnly: false, stopOnAttendantMessage: true };
  const original = compilePreview(draft, catalog, now);
  draft.behavior.invalidReply = {
    enabled: false,
    message: 'Escolha uma opção.',
  };
  assert.deepEqual(compilePreview(draft, catalog, now), original);
  draft.behavior.invalidReply.enabled = true;
  const result = compilePreview(draft, catalog, now);
  assert.equal(result.status, 'preview');
  if (result.status !== 'preview') return;
  const { bot } = result;
  const runtime = JSON.parse(bot.defaultContexts);
  const nodes = new Map(bot.flowJson.nodes.map((n) => [n.id, n]));
  const contextIds = new Set(bot.contexts.map((c) => c.id));
  assert.deepEqual(runtime['@FALLBACK'].triggers, {});
  assert.equal(runtime['@EVERY'].triggers.MESSAGE_RECEIVED, undefined);
  for (const edge of bot.flowJson.edges) {
    assert.ok(nodes.has(edge.source) && nodes.has(edge.target));
  }
  for (const c of bot.contexts)
    for (const t of c.triggers)
      for (const [i, rule] of t.rules.entries()) {
        const serialized = runtime[c.id].triggers[t.trigger.type][i];
        for (const branch of ['actions', 'fallbackActions'] as const) {
          for (const [j, action] of rule[branch].entries()) {
            if (action.type.value !== 'SET_CONTEXT') continue;
            assert.ok(contextIds.has(action.data.context as string));
            assert.equal(
              serialized[branch][j].data.context,
              action.data.context,
            );
          }
        }
        if (nodes.get(c.id)?.type === 'CONDITION_NODE') {
          for (const [handle, actions] of [
            ['OUTPUT_TRUE', rule.actions],
            ['OUTPUT_FALSE', rule.fallbackActions],
          ] as const) {
            assert.equal(
              bot.flowJson.edges.find(
                (e) => e.source === c.id && e.sourceHandle === handle,
              )?.target,
              actions[0]?.data.context,
            );
          }
        }
      }
  const menus = bot.flowJson.nodes.filter((n) => n.data.waitForResponse);
  assert.equal(
    menus.length,
    draft.nodes.filter((n) => n.kind === 'menu').length,
  );
  for (const menu of menus) {
    const next = runtime[menu.id].triggers.MESSAGE_RECEIVED;
    assert.equal(next.length, 1);
    assert.deepEqual(next[0].conditions, []);
    assert.equal(
      bot.flowJson.edges.find((e) => e.source === menu.id)?.target,
      next[0].actions[0].data.context,
    );
    const notice = bot.flowJson.nodes.find(
      (n) =>
        n.data.text === 'Escolha uma opção.' &&
        bot.flowJson.edges.some(
          (e) => e.source === n.id && e.target === menu.id,
        ),
    );
    assert.ok(notice, 'Each warning returns to its own menu');
    assert.equal(
      runtime[notice.id].triggers.ENTER_CONTEXT[0].actions[1].data.context,
      menu.id,
    );
  }
  assert.deepEqual(
    compilePreview(
      { ...draft, nodes: [...draft.nodes].reverse() },
      catalog,
      now,
    ),
    result,
  );
});
