import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft } from '../src/domain/validate.ts';
import { fixtures, now } from './fixtures.ts';

test('behavior configuration accepts booleans and rejects incomplete or coerced settings', () => {
  const { draft, catalog } = fixtures();
  for (const behavior of [
    null,
    [],
    {},
    { firstMessageOnly: 'true', stopOnAttendantMessage: true },
    { firstMessageOnly: true, stopOnAttendantMessage: 1 },
    { firstMessageOnly: true, stopOnAttendantMessage: true, extra: true },
  ]) {
    assert.ok(
      validateDraft({ ...draft, behavior }, catalog, now).some(
        (d) => d.path === 'behavior',
      ),
    );
  }
  assert.deepEqual(
    validateDraft(
      {
        ...draft,
        behavior: { firstMessageOnly: false, stopOnAttendantMessage: true },
      },
      catalog,
      now,
    ),
    [],
  );
});

test('TRI-01: accepts a submenu, return to menu and department-only transfer without mutation', () => {
  const { draft, catalog } = fixtures();
  const before = JSON.stringify({ draft, catalog });
  assert.deepEqual(validateDraft(draft, catalog, now), []);
  assert.equal(JSON.stringify({ draft, catalog }), before);
});

test('TRI-02: rejects malformed JSON values and unknown fields without throwing', () => {
  const { draft, catalog } = fixtures();
  for (const input of [
    null,
    [],
    {},
    'text',
    { ...draft, schemaVersion: 2 },
    { ...draft, script: 'ignored code' },
  ]) {
    assert.ok(validateDraft(input, catalog, now).length > 0);
  }
  const invalid = {
    ...draft,
    nodes: [{ id: 'welcome', kind: 'ai', prompt: 'invent a bot' }],
  };
  assert.ok(
    validateDraft(invalid, catalog, now).some(
      (d) => d.code === 'INVALID_SCHEMA',
    ),
  );
});

test('TRI-03: reports duplicate identifiers, choices and broken transitions with paths', () => {
  const { draft, catalog } = fixtures();
  const menu = draft.nodes[0];
  assert.equal(menu.kind, 'menu');
  if (menu.kind !== 'menu') return;
  menu.options[1].value = '1';
  menu.options[0].target = 'missing';
  draft.nodes.push(structuredClone(draft.nodes[0]));
  const diagnostics = validateDraft(draft, catalog, now);
  for (const code of ['DUPLICATE_NODE', 'DUPLICATE_OPTION', 'MISSING_TARGET']) {
    assert.ok(
      diagnostics.some((d) => d.code === code && d.path.startsWith('nodes')),
    );
  }
});

test('TRI-04: rejects unreachable steps and branches without a stop', () => {
  const { draft, catalog } = fixtures();
  draft.nodes.push({ id: 'island', kind: 'stop' });
  assert.ok(
    validateDraft(draft, catalog, now).some(
      (d) => d.code === 'UNREACHABLE_NODE',
    ),
  );
  draft.nodes = [
    {
      id: 'welcome',
      kind: 'menu',
      message: 'Loop',
      options: [{ id: 'loop', value: '1', label: 'Again', target: 'welcome' }],
    },
  ];
  assert.ok(
    validateDraft(draft, catalog, now).some((d) => d.code === 'NO_EXIT'),
  );
});

test('TRI-05: rejects automatic loops even if another branch can stop', () => {
  const { draft, catalog } = fixtures();
  const waiting = draft.nodes.find((n) => n.id === 'waiting');
  assert.ok(waiting && waiting.kind === 'message');
  waiting.next = 'waiting';
  assert.ok(
    validateDraft(draft, catalog, now).some(
      (d) => d.code === 'AUTOMATIC_CYCLE',
    ),
  );
});

test('TRI-06: rejects foreign accounts, incomplete and stale catalogs', () => {
  const { draft, catalog } = fixtures();
  assert.ok(
    validateDraft({ ...draft, accountId: 'other' }, catalog, now).some(
      (d) => d.code === 'ACCOUNT_MISMATCH',
    ),
  );
  assert.ok(
    validateDraft(draft, { ...catalog, complete: false }, now).some(
      (d) => d.code === 'CATALOG_INCOMPLETE',
    ),
  );
  assert.ok(
    validateDraft(draft, catalog, now + 600_000).some(
      (d) => d.code === 'CATALOG_STALE',
    ),
  );
  assert.ok(
    validateDraft(draft, {}, now).some((d) => d.code === 'CATALOG_INVALID'),
  );
});

test('TRI-07: uses IDs for homonyms and verifies active department membership', () => {
  const { draft, catalog } = fixtures();
  const transfer = draft.nodes.find((n) => n.id === 'transfer-sales');
  assert.ok(transfer && transfer.kind === 'transfer');
  transfer.userId = 'demo-user-2';
  assert.ok(
    validateDraft(draft, catalog, now).some(
      (d) => d.code === 'USER_DEPARTMENT_MISMATCH',
    ),
  );
  transfer.userId = 'missing';
  assert.ok(
    validateDraft(draft, catalog, now).some(
      (d) => d.code === 'USER_UNAVAILABLE',
    ),
  );
  transfer.userId = null;
  catalog.departments[0].active = false;
  assert.ok(
    validateDraft(draft, catalog, now).some(
      (d) => d.code === 'DEPARTMENT_UNAVAILABLE',
    ),
  );
});
