import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePreview } from '../src/domain/compiler.ts';
import { validateDraft } from '../src/domain/validate.ts';
import { isCatalog } from '../src/domain/catalog-schema.ts';
import { createGuidedDraft, replaceCompany } from '../web/src/guided-model.ts';
import { fixtures, now } from './fixtures.ts';

test('evaluation selection is optional, incomplete drafts remain recoverable and unavailable resources block generation', () => {
  const { draft, catalog } = fixtures();
  const base = compilePreview(draft, catalog, now);
  draft.behavior = {
    firstMessageOnly: false,
    stopOnAttendantMessage: false,
    afterTicketClosedEvaluation: { enabled: false, questionId: 'missing' },
  };
  const disabled = compilePreview(draft, catalog, now);
  delete draft.behavior.afterTicketClosedEvaluation;
  assert.deepEqual(disabled, compilePreview(draft, catalog, now));
  assert.equal(base.status, 'preview');
  for (const config of [
    null,
    true,
    {},
    { enabled: 'true', questionId: 'demo-csat' },
    { enabled: true, questionId: 42 },
    { enabled: true, questionId: null, next: 'stop' },
  ]) {
    const invalid = {
      ...draft,
      behavior: { ...draft.behavior, afterTicketClosedEvaluation: config },
    };
    assert.ok(
      validateDraft(invalid, catalog, now).some(
        (d) => d.code === 'INVALID_SCHEMA',
      ),
    );
  }
  draft.behavior.afterTicketClosedEvaluation = {
    enabled: true,
    questionId: null,
  };
  const issues = validateDraft(draft, catalog, now);
  assert.ok(issues.some((d) => d.code === 'EVALUATION_REQUIRED'));
  assert.ok(!issues.some((d) => d.code === 'INVALID_SCHEMA'));
  draft.behavior.afterTicketClosedEvaluation.questionId = 'missing';
  assert.ok(
    validateDraft(draft, catalog, now).some(
      (d) => d.code === 'EVALUATION_UNAVAILABLE',
    ),
  );
  draft.behavior.afterTicketClosedEvaluation.questionId = 'demo-csat';
  assert.equal(compilePreview(draft, catalog, now).status, 'preview');
  for (const questions of [
    undefined,
    { state: 'unavailable' as const, items: [] },
    { state: 'ready' as const, items: [] },
    {
      ...catalog.questions!,
      items: catalog.questions!.items.map((q) => ({ ...q, active: false })),
    },
  ]) {
    assert.equal(
      compilePreview(draft, { ...catalog, questions }, now).status,
      'invalid',
    );
  }
  assert.equal(
    isCatalog({
      ...catalog,
      questions: {
        ...catalog.questions,
        items: catalog.questions!.items.map((q) => ({
          ...q,
          accountId: 'foreign',
        })),
      },
    }),
    false,
  );
  assert.equal(
    isCatalog({
      ...catalog,
      questions: { state: 'unavailable', items: catalog.questions!.items },
    }),
    false,
  );
});

test('one closing sequence always ends in evaluation across all combinations of existing policies', () => {
  for (let mask = 0; mask < 64; mask++) {
    const { draft, catalog } = fixtures();
    draft.behavior = {
      firstMessageOnly: Boolean(mask & 1),
      respectHolidays: Boolean(mask & 2),
      businessHours: {
        enabled: Boolean(mask & 4),
        closedMessage: 'Fora do horário.',
      },
      stopOnAttendantMessage: Boolean(mask & 8),
      ticketInactivity: {
        enabled: Boolean(mask & 16),
        message: 'Aviso antes de fechar.',
      },
      afterTicketClosed: {
        enabled: Boolean(mask & 32),
        message: 'Despedida antes da avaliação.',
      },
      afterTicketClosedEvaluation: { enabled: true, questionId: 'demo-csat' },
    };
    const result = compilePreview(draft, catalog, now);
    assert.equal(result.status, 'preview');
    if (result.status !== 'preview') continue;
    assert.equal(result.importReady, false);
    const { bot } = result;
    const runtime = JSON.parse(bot.defaultContexts);
    const every = runtime['@EVERY'].triggers;
    assert.equal(every.TICKET_CLOSED.length, 1);
    assert.equal(Boolean(every.TICKET_INACTIVE), Boolean(mask & 16));
    assert.equal(Boolean(every.USER_MESSAGE_SENT), Boolean(mask & 8));
    const nodes = bot.flowJson.nodes;
    const edges = bot.flowJson.edges;
    assert.equal(
      nodes.filter((n) => n.type === 'PERSISTENT_START_NODE').length,
      1,
    );
    const event = nodes.find(
      (n) =>
        n.type === 'TRIGGER_NODE' &&
        (n.data.trigger as { type: string }).type === 'TICKET_CLOSED',
    )!;
    const entry = every.TICKET_CLOSED[0].actions[0].data.context;
    assert.ok(edges.some((e) => e.source === event.id && e.target === entry));
    const evaluation = nodes.filter((n) => n.type === 'SEND_QUESTION_NODE');
    assert.equal(evaluation.length, 1);
    const evaluationId = evaluation[0].id;
    assert.ok(!edges.some((e) => e.source === evaluationId));
    if (mask & 32) {
      assert.equal(nodes.find((n) => n.id === entry)!.type, 'MESSAGE_NODE');
      assert.deepEqual(
        runtime[entry].triggers.ENTER_CONTEXT[0].actions.map(
          (a: { value: string }) => a.value,
        ),
        ['SEND_MESSAGE', 'SET_CONTEXT'],
      );
      assert.equal(
        runtime[entry].triggers.ENTER_CONTEXT[0].actions.at(-1).data.context,
        evaluationId,
      );
      assert.ok(
        edges.some((e) => e.source === entry && e.target === evaluationId),
      );
    } else assert.equal(entry, evaluationId);
    const editor = bot.contexts.find((c) => c.id === evaluationId)!.triggers[0]
      .rules[0];
    assert.deepEqual(
      editor.actions.map((a) => a.type.value),
      ['SEND_QUESTION'],
    );
    assert.deepEqual(editor.fallbackActions, []);
    assert.deepEqual(editor.actions[0].data, evaluation[0].data);
    assert.equal(
      (editor.actions[0].data.question as { id: string }).id,
      'demo-csat',
    );
    assert.deepEqual(runtime[evaluationId].triggers.ENTER_CONTEXT[0].actions, [
      {
        value: 'SEND_QUESTION',
        name: 'Avaliação',
        data: { question: 'demo-csat' },
      },
    ]);
    const ids = new Set(nodes.map((n) => n.id));
    assert.equal(ids.size, nodes.length);
    for (const e of edges) assert.ok(ids.has(e.source) && ids.has(e.target));
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

test('copies preserve only the question ID and company personalization never modifies the account evaluation', () => {
  const { draft, catalog } = fixtures();
  draft.behavior = {
    firstMessageOnly: false,
    stopOnAttendantMessage: true,
    afterTicketClosedEvaluation: { enabled: true, questionId: 'demo-csat' },
  };
  const before = structuredClone(catalog);
  const copy = createGuidedDraft('copy', draft);
  const personalized = replaceCompany(copy, 'Empresa X', 'Acme');
  assert.deepEqual(
    personalized.behavior?.afterTicketClosedEvaluation,
    draft.behavior.afterTicketClosedEvaluation,
  );
  assert.deepEqual(catalog, before);
});
