import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtures, now } from './fixtures.ts';
import { changeBranch, branchTarget } from '../web/src/flow-model.ts';
import { compilePreview } from '../src/domain/compiler.ts';

test('inline replacement removes displaced subtrees, keeps shared destinations and compiles', () => {
  const { draft, catalog } = fixtures();
  const root = draft.nodes.find((n) => n.id === draft.entryNodeId)!;
  assert.equal(root.kind, 'menu');
  if (root.kind !== 'menu') return;
  const branch = { owner: root.id, option: root.options[0].id };
  const original = JSON.stringify(draft);
  const changed = changeBranch(draft, branch, 'stop');
  assert.equal(JSON.stringify(draft), original);
  assert.equal(
    changed.nodes.find((n) => n.id === branchTarget(changed, branch))?.kind,
    'stop',
  );
  assert.ok(changed.nodes.some((n) => n.id === root.options[1].target));
  assert.equal(compilePreview(changed, catalog, now).status, 'preview');
});

test('nested menu creation defaults each branch to stop and preserves an explicit return', () => {
  const { draft } = fixtures();
  const root = draft.nodes.find((n) => n.id === draft.entryNodeId)!;
  if (root.kind !== 'menu') throw new Error('Expected menu');
  let seq = 0;
  const branch = { owner: root.id, option: root.options[0].id };
  const changed = changeBranch(draft, branch, 'menu', () => `new-${++seq}`);
  const menu = changed.nodes.find(
    (n) => n.id === branchTarget(changed, branch),
  )!;
  assert.equal(menu.kind, 'menu');
  if (menu.kind !== 'menu') return;
  for (const option of menu.options)
    assert.equal(
      changed.nodes.find((n) => n.id === option.target)?.kind,
      'stop',
    );
  const returned = changeBranch(
    changed,
    { owner: menu.id, option: menu.options[1].id },
    `existing:${root.id}`,
  );
  assert.equal(returned.entryNodeId, root.id);
  assert.ok(returned.nodes.some((n) => n.id === menu.id));
  assert.equal(
    branchTarget(returned, { owner: menu.id, option: menu.options[1].id }),
    root.id,
  );
});

test('changing one shared branch keeps the other branch intact', () => {
  const { draft } = fixtures();
  const root = draft.nodes.find((n) => n.id === draft.entryNodeId)!;
  if (root.kind !== 'menu') throw new Error('Expected menu');
  const shared = changeBranch(
    draft,
    { owner: root.id, option: root.options[1].id },
    `existing:${root.options[0].target}`,
  );
  const replaced = changeBranch(
    shared,
    { owner: root.id, option: root.options[0].id },
    'stop',
  );
  assert.ok(replaced.nodes.some((n) => n.id === root.options[0].target));
  assert.equal(
    branchTarget(replaced, { owner: root.id, option: root.options[1].id }),
    root.options[0].target,
  );
});
