import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtures, now } from './fixtures.ts';
import {
  addGuidedOption,
  createGuidedDraft,
  guidedSteps,
  removeGuidedOption,
  replaceCompany,
} from '../web/src/guided-model.ts';
import { validateDraft } from '../src/domain/validate.ts';
import { compilePreview } from '../src/domain/compiler.ts';

test('copies and company personalization preserve invalid reply settings without mutating the original', () => {
  const { draft } = fixtures();
  draft.behavior = {
    firstMessageOnly: false,
    stopOnAttendantMessage: true,
    invalidReply: { enabled: true, message: 'Empresa X: escolha uma opção.' },
  };
  const copy = createGuidedDraft('copy', draft);
  assert.deepEqual(copy.behavior?.invalidReply, draft.behavior.invalidReply);
  const updated = replaceCompany(copy, 'Empresa X', 'Empresa Y');
  assert.equal(
    updated.behavior?.invalidReply?.message,
    'Empresa Y: escolha uma opção.',
  );
  assert.equal(
    draft.behavior.invalidReply?.message,
    'Empresa X: escolha uma opção.',
  );
});

test('large copied menus use one options prompt and do not mutate the draft', () => {
  const { draft } = fixtures();
  const menu = draft.nodes.find((n) => n.kind === 'menu')!;
  if (menu.kind !== 'menu') throw new Error('Expected menu');
  menu.options = Array.from({ length: 20 }, (_, i) => ({
    ...menu.options[0],
    id: `option-${i}`,
    value: String(i + 1),
    label: `Escolha ${i + 1}`,
  }));
  const before = structuredClone(draft);
  const steps = guidedSteps(draft);
  assert.equal(
    steps.filter((step) => step.kind === 'options' && step.nodeId === menu.id)
      .length,
    1,
  );
  assert.deepEqual(draft, before);
  assert.deepEqual(
    steps.slice(-2).map((step) => step.kind),
    ['review', 'test'],
  );
  assert.deepEqual(
    guidedSteps({
      ...draft,
      nodes: [{ id: 'stop', kind: 'stop' }],
      entryNodeId: 'stop',
    }).map((step) => step.kind),
    ['template', 'identity', ...Array(8).fill('behavior'), 'review', 'test'],
  );
});

test('added options have unique answers and configurable destinations that compile', () => {
  const { draft, catalog } = fixtures();
  const original = createGuidedDraft('standard', draft);
  const snapshot = structuredClone(original);
  const next = addGuidedOption(original, 'welcome');
  assert.deepEqual(original, snapshot);
  const menu = next.nodes.find((node) => node.id === 'welcome');
  assert.ok(menu?.kind === 'menu');
  assert.equal(menu.options.at(-1)!.value, '4');
  const target = menu.options.at(-1)!.target;
  assert.ok(
    guidedSteps(next).some(
      (step) => step.kind === 'department' && step.nodeId === target,
    ),
  );
  for (const node of next.nodes) {
    if (node.kind === 'transfer')
      node.departmentId = catalog.departments.find((item) => item.active)!.id;
  }
  assert.deepEqual(validateDraft(next, catalog, now), []);
  assert.equal(compilePreview(next, catalog, now).status, 'preview');
  let maximum = next;
  for (let i = 0; i < 16; i++) maximum = addGuidedOption(maximum, 'welcome');
  assert.equal(addGuidedOption(maximum, 'welcome'), maximum);
});

test('removing options prunes exclusive submenus, preserves shared paths and keeps one choice', () => {
  const { draft, catalog } = fixtures();
  const original = createGuidedDraft('standard', draft);
  let next = removeGuidedOption(original, 'welcome', 'commercial');
  assert.ok(
    !next.nodes.some((node) =>
      ['commercial-menu', 'buy-team', 'sell-team'].includes(node.id),
    ),
  );
  assert.ok(next.nodes.some((node) => node.id === 'waiting'));
  assert.equal(guidedSteps(next).length, 17);
  next = removeGuidedOption(next, 'welcome', 'support');
  assert.equal(removeGuidedOption(next, 'welcome', 'finance'), next);
  const added = addGuidedOption(next, 'welcome');
  const menu = added.nodes.find((node) => node.id === 'welcome');
  assert.ok(menu?.kind === 'menu');
  assert.deepEqual(
    menu.options.map((option) => option.value),
    ['1', '2'],
  );
  const restored = removeGuidedOption(added, 'welcome', menu.options[1].id);
  assert.deepEqual(restored, next);
  for (const node of restored.nodes) {
    if (node.kind === 'transfer')
      node.departmentId = catalog.departments.find((item) => item.active)!.id;
  }
  assert.deepEqual(validateDraft(restored, catalog, now), []);
});

test('removal closes numbering gaps without changing destinations or the zero return option', () => {
  const { draft } = fixtures();
  const original = addGuidedOption(
    createGuidedDraft('standard', draft),
    'welcome',
  );
  const before = structuredClone(original);
  const next = removeGuidedOption(original, 'welcome', 'finance');
  const root = next.nodes.find((node) => node.id === 'welcome');
  const previousRoot = original.nodes.find((node) => node.id === 'welcome');
  assert.ok(root?.kind === 'menu' && previousRoot?.kind === 'menu');
  assert.deepEqual(
    root.options.map((option) => option.value),
    ['1', '2', '3'],
  );
  assert.deepEqual(
    root.options.map((option) => [option.id, option.target]),
    previousRoot.options
      .filter((option) => option.id !== 'finance')
      .map((option) => [option.id, option.target]),
  );
  assert.equal(root.options[2].label, 'Nova opção 3');
  assert.equal(
    next.nodes.find((node) => node.id === root.options[2].target)?.name,
    'Destino da opção 3 · Menu principal',
  );
  assert.deepEqual(original, before);
  const submenu = removeGuidedOption(next, 'commercial-menu', 'buy').nodes.find(
    (node) => node.id === 'commercial-menu',
  );
  assert.ok(submenu?.kind === 'menu');
  assert.deepEqual(
    submenu.options.map((option) => [option.value, option.target]),
    [
      ['1', 'sell-team'],
      ['0', 'welcome'],
    ],
  );
});

test('templates require explicit departments and compile once mapped to the current account', () => {
  const { draft, catalog } = fixtures();
  for (const template of ['standard', 'direct'] as const) {
    const next = createGuidedDraft(template, draft);
    assert.notEqual(next.id, draft.id);
    assert.equal(next.accountId, catalog.accountId);
    assert.ok(validateDraft(next, catalog, now).length > 0);
    for (const node of next.nodes) {
      if (node.kind === 'transfer') {
        assert.equal(node.departmentId, '');
        assert.equal(node.userId, null);
        node.departmentId = catalog.departments.find((d) => d.active)!.id;
      }
    }
    assert.deepEqual(validateDraft(next, catalog, now), []);
    assert.equal(compilePreview(next, catalog, now).status, 'preview');
    if (template === 'standard') {
      const root = next.nodes.find((n) => n.id === next.entryNodeId);
      assert.equal(root?.kind, 'menu');
      if (root?.kind === 'menu')
        assert.deepEqual(
          root.options.map((o) => o.label),
          ['Comercial', 'Suporte', 'Financeiro'],
        );
      assert.ok(
        next.nodes.some(
          (n) =>
            n.kind === 'menu' &&
            n.options.some(
              (o) => o.value === '0' && o.target === next.entryNodeId,
            ),
        ),
      );
    }
  }
});

test('copy and company replacement preserve the original, variables and customized messages', () => {
  const { draft } = fixtures();
  const original = structuredClone(draft);
  const copy = createGuidedDraft('copy', draft);
  copy.nodes[0].name = 'Outra versão';
  assert.deepEqual(draft, original);
  assert.notEqual(copy.id, draft.id);
  let model = createGuidedDraft('standard', draft);
  model = replaceCompany(model, 'Empresa X', 'Casa & Cia');
  assert.equal(model.name, 'Atendimento da Casa & Cia');
  const menu = model.nodes.find((n) => n.id === model.entryNodeId);
  assert.ok(menu?.kind === 'menu' && menu.message.includes('{{contact_name}}'));
  if (menu?.kind === 'menu')
    menu.message = 'Mensagem personalizada {{contact_name}}';
  const edited = replaceCompany(model, 'Casa & Cia', 'Novo nome');
  assert.deepEqual(edited.nodes, model.nodes);
  assert.equal(edited.name, 'Atendimento da Novo nome');
});
