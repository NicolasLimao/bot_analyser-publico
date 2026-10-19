import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeContexts } from '../src/domain/serialize-contexts.ts';
import type { Context, Rule } from '../src/domain/types.ts';

function emptyRule(): Rule {
  return { title: '', actions: [], conditions: [], fallbackActions: [] };
}

// Internal, synthetic contexts: this is not a confirmed BOT_INACTIVE editor export.
function persistentContext(): Context {
  return {
    id: '@EVERY',
    name: 'A qualquer momento',
    triggers: ['BOT_INACTIVE', 'USER_MESSAGE_SENT'].map((type) => ({
      trigger: { type, name: type },
      rules: [emptyRule()],
    })),
  };
}

test('runtime parameters survive serialization alongside other persistent events', () => {
  const context = persistentContext();
  const inactivityRule = context.triggers[0].rules[0];
  const parameters = {
    timeUnit: 'minutes',
    inactivityTime: 10,
    continuityAttempts: 3,
    followUpMessages: Array<string>(3).fill('Ainda está comigo?'),
    useDifferentMessages: false,
  };
  const before = structuredClone(context);
  const originalParameters = structuredClone(parameters);
  const runtime = JSON.parse(
    serializeContexts([context], new Map([[inactivityRule, parameters]])),
  );
  assert.deepEqual(runtime['@EVERY'].triggers.BOT_INACTIVE[0].data, parameters);
  assert.deepEqual(runtime['@EVERY'].triggers.USER_MESSAGE_SENT[0].data, {});
  assert.deepEqual(context, before);
  assert.deepEqual(parameters, originalParameters);
});

test('parameters belong to individual rules, including zero attempts', () => {
  const context = persistentContext();
  const second = emptyRule();
  context.triggers[0].rules.push(second);
  const runtime = JSON.parse(
    serializeContexts(
      [context],
      new Map([
        [second, { continuityAttempts: 0, useDifferentMessages: false }],
      ]),
    ),
  );
  assert.deepEqual(
    runtime['@EVERY'].triggers.BOT_INACTIVE.map(
      (r: { data: unknown }) => r.data,
    ),
    [{}, { continuityAttempts: 0, useDifferentMessages: false }],
  );
});

test('serialization preserves transfers, conditional branches and empty contexts', () => {
  const rule = emptyRule();
  rule.actions.push({
    type: { value: 'TRANSFER_TICKET', name: 'Transferir chamado' },
    data: { department: { id: 'department-1', name: 'Suporte' }, user: null },
  });
  rule.fallbackActions.push({
    type: { value: 'SET_CONTEXT', name: 'Definir contexto' },
    data: { context: '@END' },
  });
  rule.conditions.push({
    $and: [
      {
        variable: { value: 'is_message_from_me', name: 'Enviada por mim' },
        operator: { value: '$eq', name: 'Igual' },
        target: 'true',
      },
    ],
  });
  const context = persistentContext();
  context.triggers[1].rules = [rule];
  const before = structuredClone(context);
  const runtime = JSON.parse(
    serializeContexts([context, { id: '@END', name: 'Fim', triggers: [] }]),
  );
  assert.deepEqual(runtime['@EVERY'].triggers.USER_MESSAGE_SENT, [
    {
      data: {},
      title: '',
      actions: [
        {
          data: { department: 'department-1', user: null },
          name: 'Transferir chamado',
          value: 'TRANSFER_TICKET',
        },
      ],
      conditions: [{ $and: [{ '{{is_message_from_me}}': { $eq: 'true' } }] }],
      fallbackActions: [
        {
          data: { context: '@END' },
          name: 'Definir contexto',
          value: 'SET_CONTEXT',
        },
      ],
    },
  ]);
  assert.deepEqual(runtime['@END'], { name: 'Fim', triggers: {} });
  assert.deepEqual(context, before);
});

test('duplicate context IDs and events cannot silently overwrite rules', () => {
  const context = persistentContext();
  assert.throws(
    () => serializeContexts([context, structuredClone(context)]),
    /Duplicate context/,
  );
  context.triggers.push(structuredClone(context.triggers[0]));
  assert.throws(() => serializeContexts([context]), /Duplicate trigger/);
});

test('missing event identity is rejected instead of generating an undefined event', () => {
  const context = persistentContext();
  // The local reference has a trigger entry without this identity.
  Reflect.deleteProperty(context.triggers[0], 'trigger');
  assert.throws(() => serializeContexts([context]), /Missing trigger type/);
  context.triggers[0].trigger = { type: '', name: '' };
  assert.throws(() => serializeContexts([context]), /Missing trigger type/);
});

test('parameters for absent rules cannot be silently discarded', () => {
  assert.throws(
    () =>
      serializeContexts(
        [persistentContext()],
        new Map([[emptyRule(), { inactivityTime: 10 }]]),
      ),
    /absent rule/,
  );
});
