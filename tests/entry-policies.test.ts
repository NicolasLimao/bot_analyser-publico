import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePreview } from '../src/domain/compiler.ts';
import { validateDraft } from '../src/domain/validate.ts';
import { entryOutcome } from '../src/domain/entry.ts';
import { addReturnToEntry, returnToEntryIssue } from '../web/src/flow-model.ts';
import { createGuidedDraft, replaceCompany } from '../web/src/guided-model.ts';
import { fixtures, now } from './fixtures.ts';

const behavior = {
  firstMessageOnly: true,
  stopOnAttendantMessage: true,
  respectHolidays: true,
  businessHours: {
    enabled: true,
    closedMessage: 'Olá {{contact_name}}, Empresa X está fechada.',
  },
};

test('entry schema refuses unknown/coerced settings and keeps incomplete drafts recoverable', () => {
  const { draft, catalog } = fixtures();
  for (const extra of [
    { respectHolidays: 'true' },
    { respectHolidays: null },
    { businessHours: null },
    { businessHours: { enabled: 1, closedMessage: 'oi' } },
    { businessHours: { enabled: true } },
    { businessHours: { enabled: false, closedMessage: 42 } },
    { businessHours: { enabled: false, closedMessage: 'x'.repeat(4001) } },
    { businessHours: { enabled: true, closedMessage: 'oi', timezone: 'UTC' } },
  ]) {
    const invalid = { ...draft, behavior: { ...behavior, ...extra } };
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
      behavior: {
        ...behavior,
        businessHours: { enabled, closedMessage: '  ' },
      },
    };
    const issues = validateDraft(incomplete, catalog, now);
    assert.ok(!issues.some((d) => d.code === 'INVALID_SCHEMA'));
    assert.equal(
      issues.some(
        (d) =>
          d.code === 'OUTSIDE_HOURS_MESSAGE_REQUIRED' &&
          d.path === 'behavior.businessHours.closedMessage',
      ),
      enabled,
    );
    const result = compilePreview(incomplete, catalog, now);
    assert.equal(result.status, enabled ? 'invalid' : 'preview');
    if (enabled) assert.ok(!('bot' in result));
  }
});

test('disabled entry policies preserve legacy output and copies preserve explicit settings', () => {
  const { draft, catalog } = fixtures();
  const baseline = compilePreview(draft, catalog, now);
  draft.behavior = {
    firstMessageOnly: false,
    stopOnAttendantMessage: false,
    respectHolidays: false,
    businessHours: { enabled: false, closedMessage: 'Texto guardado' },
  };
  assert.deepEqual(compilePreview(draft, catalog, now), baseline);
  draft.behavior = structuredClone(behavior);
  const restored = JSON.parse(JSON.stringify(draft));
  assert.deepEqual(validateDraft(restored, catalog, now), []);
  const copy = createGuidedDraft('copy', restored);
  assert.deepEqual(copy.behavior, behavior);
  const replaced = replaceCompany(copy, 'Empresa X', 'Acme');
  assert.equal(
    replaced.behavior?.businessHours?.closedMessage,
    'Olá {{contact_name}}, Acme está fechada.',
  );
  assert.deepEqual(draft.behavior, behavior);
  for (const template of ['standard', 'direct'] as const) {
    const fresh = createGuidedDraft(template, draft);
    assert.deepEqual(fresh.behavior, {
      firstMessageOnly: false,
      stopOnAttendantMessage: true,
    });
  }
});

test('entry conditions, messages and destinations agree in flow, editor and serialized contexts', () => {
  for (const firstMessageOnly of [false, true])
    for (const stopOnAttendantMessage of [false, true])
      for (const respectHolidays of [false, true])
        for (const enabled of [false, true]) {
          const { draft, catalog } = fixtures();
          draft.behavior = {
            ...behavior,
            firstMessageOnly,
            stopOnAttendantMessage,
            respectHolidays,
            businessHours: { ...behavior.businessHours, enabled },
          };
          const result = compilePreview(draft, catalog, now);
          assert.equal(result.status, 'preview');
          if (result.status !== 'preview') throw new Error('Expected preview');
          assert.equal(result.importReady, false);
          const { bot } = result;
          const runtime = JSON.parse(bot.defaultContexts);
          const ids = new Set(bot.flowJson.nodes.map((n) => n.id));
          assert.equal(ids.size, bot.flowJson.nodes.length);
          assert.ok(
            bot.flowJson.edges.every(
              (e) => ids.has(e.source) && ids.has(e.target),
            ),
          );
          assert.equal(
            !!runtime['@EVERY'].triggers.USER_MESSAGE_SENT,
            stopOnAttendantMessage,
          );
          for (const context of bot.contexts) {
            for (const trigger of context.triggers) {
              const rules = runtime[context.id].triggers[trigger.trigger.type];
              trigger.rules.forEach((rule, i) => {
                for (const key of ['actions', 'fallbackActions'] as const) {
                  rule[key].forEach((action, j) => {
                    assert.equal(rules[i][key][j].value, action.type.value);
                    if (action.type.value === 'SET_CONTEXT') {
                      assert.ok(runtime[String(action.data.context)]);
                      assert.deepEqual(rules[i][key][j].data, action.data);
                    }
                    if (action.type.value === 'SEND_MESSAGE')
                      assert.deepEqual(rules[i][key][j].data, action.data);
                  });
                }
              });
            }
          }
          for (const node of bot.flowJson.nodes) {
            if (node.type === 'CONDITION_NODE') {
              const condition = (node.data.conditions as any[])[0];
              const editor = bot.contexts.find((c) => c.id === node.id)!
                .triggers[0].rules[0];
              const serialized = runtime[node.id].triggers.ENTER_CONTEXT[0];
              assert.deepEqual(serialized.conditions, [
                {
                  $and: [
                    { [`{{${condition.variable.value}}}`]: { $eq: 'true' } },
                  ],
                },
              ]);
              assert.ok('$and' in editor.conditions[0]);
              if ('$and' in editor.conditions[0])
                assert.equal(
                  editor.conditions[0].$and[0].variable.value,
                  condition.variable.value,
                );
              for (const [handle, actions] of [
                ['OUTPUT_TRUE', editor.actions],
                ['OUTPUT_FALSE', editor.fallbackActions],
              ] as const)
                assert.equal(
                  bot.flowJson.edges.find(
                    (e) => e.source === node.id && e.sourceHandle === handle,
                  )?.target,
                  actions[0].data.context,
                );
            }
            if (node.type === 'SEND_HOLIDAY_MESSAGE_NODE') {
              assert.deepEqual(node.data, {});
              assert.equal(
                runtime[node.id].triggers.ENTER_CONTEXT[0].actions[0].data.text,
                '@botOnHoliday',
              );
            }
          }
          const visited = new Set<string>();
          const pending = bot.flowJson.nodes
            .filter((n) =>
              ['START_NODE', 'PERSISTENT_START_NODE'].includes(n.type),
            )
            .map((n) => n.id);
          while (pending.length) {
            const id = pending.pop()!;
            if (visited.has(id)) continue;
            visited.add(id);
            pending.push(
              ...bot.flowJson.edges
                .filter((e) => e.source === id)
                .map((e) => e.target),
            );
          }
          assert.equal(visited.size, ids.size);
          const reordered = { ...draft, nodes: [...draft.nodes].reverse() };
          assert.deepEqual(compilePreview(reordered, catalog, now), result);
        }
});

test('simulation entry uses documented precedence and leaves disabled policies inactive', () => {
  const { draft } = fixtures();
  draft.behavior = behavior;
  assert.equal(
    entryOutcome(draft, {
      firstMessage: false,
      holiday: true,
      companyOpen: false,
    }),
    'not-first',
  );
  assert.equal(
    entryOutcome(draft, {
      firstMessage: true,
      holiday: true,
      companyOpen: false,
    }),
    'holiday',
  );
  assert.equal(
    entryOutcome(draft, {
      firstMessage: true,
      holiday: false,
      companyOpen: false,
    }),
    'closed',
  );
  assert.equal(
    entryOutcome(draft, {
      firstMessage: true,
      holiday: false,
      companyOpen: true,
    }),
    'continue',
  );
  delete draft.behavior;
  assert.equal(
    entryOutcome(draft, {
      firstMessage: false,
      holiday: true,
      companyOpen: false,
    }),
    'continue',
  );
});

test('return shortcut links text and destination without collisions, mutation or exceeding limits', () => {
  const { draft, catalog } = fixtures();
  draft.behavior = behavior;
  const menu = draft.nodes.find(
    (n) => n.kind === 'menu' && n.id !== draft.entryNodeId,
  )!;
  if (menu.kind !== 'menu') throw new Error('Expected menu');
  menu.options = menu.options.filter((o) => o.value !== '0');
  const original = structuredClone(draft);
  const next = addReturnToEntry(draft, menu.id);
  assert.deepEqual(draft, original);
  const updated = next.nodes.find((n) => n.id === menu.id)!;
  if (updated.kind !== 'menu') throw new Error('Expected menu');
  assert.deepEqual(updated.options.at(-1), {
    id: updated.options.at(-1)!.id,
    value: '0',
    label: 'Voltar ao menu inicial',
    target: draft.entryNodeId,
  });
  assert.deepEqual(validateDraft(next, catalog, now), []);
  assert.equal(addReturnToEntry(next, menu.id), next);
  assert.equal(addReturnToEntry(draft, draft.entryNodeId), draft);
  menu.options.push({
    id: 'occupied',
    value: '0',
    label: 'Outra ação',
    target: 'stop',
  });
  assert.equal(addReturnToEntry(draft, menu.id), draft);
  menu.options = Array.from({ length: 20 }, (_, i) => ({
    id: `option-${i}`,
    value: String(i + 1),
    label: 'Opção',
    target: 'stop',
  }));
  assert.match(returnToEntryIssue(draft, menu.id)!, /20 opções/);
  assert.equal(addReturnToEntry(draft, menu.id), draft);
  draft.entryNodeId = draft.nodes.find((n) => n.kind === 'message')!.id;
  assert.match(returnToEntryIssue(draft, menu.id)!, /início.*menu/);
});
