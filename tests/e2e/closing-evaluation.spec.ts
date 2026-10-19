import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { prepareEditorSession } from './editor-session.ts';
import { completeGuidedPrompts } from './guided-helpers.ts';
import {
  openBehaviorRule,
  closeBehaviorRules,
  editGuidedRule,
} from './behavior-helpers.ts';

test('evaluation stays last after messages, persists in drafts and exports a terminal action', async ({
  page,
}, info) => {
  await prepareEditorSession(page);
  await page.goto('/');
  await openBehaviorRule(page, 'afterTicketClosedEvaluation');
  const rules = page.locator('.behavior-question');
  const toggle = rules.getByRole('radio', { name: /^Sim/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  const select = rules.getByLabel('Avaliação do atendimento', { exact: true });
  await expect(select).toHaveValue('');
  await expect(select).toHaveAttribute('aria-invalid', 'true');
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  const downloadButton = page.getByRole('button', {
    name: 'Baixar prévia técnica',
    exact: true,
  });
  await expect(downloadButton).toBeDisabled();
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await openBehaviorRule(page, 'afterTicketClosedEvaluation');
  await expect(toggle).toBeChecked();
  await expect(select).toHaveValue('');
  await select.selectOption('demo-csat');
  await expect(rules).toContainText('Como você avalia nosso atendimento?');
  await rules.getByRole('radio', { name: /^Não/ }).check();
  await toggle.check();
  await expect(select).toHaveValue('demo-csat');
  await openBehaviorRule(page, 'afterTicketClosed');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  await rules
    .getByLabel('Mensagem após fechar o chamado', { exact: true })
    .fill('Despedida antes da avaliação.');
  await openBehaviorRule(page, 'ticketInactivity');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  await rules
    .getByLabel('Mensagem de encerramento por inatividade')
    .fill('Aviso antes do fechamento.');
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await openBehaviorRule(page, 'afterTicketClosedEvaluation');
  await expect(select).toHaveValue('demo-csat');
  await mkdir('.impeccable/review', { recursive: true });
  await rules.screenshot({
    path: `.impeccable/review/evaluation-${info.project.name}.png`,
  });
  await closeBehaviorRules(page);
  if (info.project.name === 'mobile')
    await page
      .getByRole('button', { name: 'Testar conversa', exact: true })
      .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await chat.getByRole('button', { name: 'Simular fechamento manual' }).click();
  await expect(chat.locator('.chat-item.bot').last()).toContainText(
    'Como você avalia nosso atendimento?',
  );
  await expect(chat).toContainText('Despedida antes da avaliação.');
  await expect(
    chat.getByRole('button', { name: 'Simular fechamento manual' }),
  ).toBeDisabled();
  await chat.getByRole('button', { name: 'Reiniciar simulação' }).click();
  await chat
    .getByLabel('Na inatividade, mensagem foi enviada pelo atendente?')
    .selectOption('false');
  await chat.getByRole('button', { name: 'Simular chamado inativo' }).click();
  await expect(chat).not.toContainText('Como você avalia nosso atendimento?');
  await chat.getByRole('button', { name: 'Reiniciar simulação' }).click();
  await chat
    .getByLabel('Na inatividade, mensagem foi enviada pelo atendente?')
    .selectOption('true');
  await chat.getByRole('button', { name: 'Simular chamado inativo' }).click();
  const text = await chat.locator('.chat-content').innerText();
  expect(text.indexOf('Aviso antes do fechamento.')).toBeLessThan(
    text.indexOf('Despedida antes da avaliação.'),
  );
  expect(text.indexOf('Despedida antes da avaliação.')).toBeLessThan(
    text.indexOf('Como você avalia nosso atendimento?'),
  );
  await expect(chat.locator('.chat-item.bot').last()).toContainText(
    'Como você avalia nosso atendimento?',
  );
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(downloadButton).toBeEnabled();
  const downloading = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloading;
  const result = JSON.parse(await readFile((await download.path())!, 'utf8'));
  const bot = result.bot;
  const runtime = JSON.parse(bot.defaultContexts);
  expect(runtime['@EVERY'].triggers.TICKET_CLOSED).toHaveLength(1);
  const evaluation = bot.flowJson.nodes.find(
    (n: { type: string }) => n.type === 'SEND_QUESTION_NODE',
  );
  expect(runtime[evaluation.id].triggers.ENTER_CONTEXT[0].actions).toEqual([
    {
      value: 'SEND_QUESTION',
      name: 'Avaliação',
      data: { question: 'demo-csat' },
    },
  ]);
  expect(
    bot.flowJson.edges.some(
      (e: { source: string }) => e.source === evaluation.id,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('guided copy keeps the evaluation in rules, review and final preview', async ({
  page,
}) => {
  await prepareEditorSession(page);
  await page.goto('/');
  await openBehaviorRule(page, 'afterTicketClosedEvaluation');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  await page
    .getByLabel('Avaliação do atendimento', { exact: true })
    .selectOption('demo-csat');
  await closeBehaviorRules(page);
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: /Usar meu roteiro atual/ }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await completeGuidedPrompts(page);
  const review = page.getByLabel('Revisão do roteiro', { exact: true });
  await review.getByText('Ver funções ativadas', { exact: true }).click();
  await expect(review).toContainText('Satisfação — demonstração');
  await expect(review).toContainText('Enviar por último');
  await editGuidedRule(page, 'Avaliação do atendimento');
  await expect(
    page.getByRole('combobox', {
      name: 'Avaliação do atendimento',
      exact: true,
    }),
  ).toHaveValue('demo-csat');
  await page
    .getByRole('button', { name: 'Voltar à revisão', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Testar conversa', exact: true })
    .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await chat.getByText('Testar regras do atendimento', { exact: true }).click();
  await chat.getByRole('button', { name: 'Simular fechamento manual' }).click();
  await expect(chat.locator('.chat-item.bot').last()).toContainText(
    'Como você avalia nosso atendimento?',
  );
});

test('connected account selects its evaluation and handles refresh, unavailable lists and session expiry', async ({
  page,
}, info) => {
  await page.goto(
    `http://127.0.0.1:${info.project.name === 'mobile' ? 3005 : 3004}`,
  );
  await page
    .getByLabel('URL da instância')
    .fill('https://demo-publico.digisac.chat');
  await page.getByLabel('Usuário Digisac').fill('evaluation@example.test');
  await page.getByLabel('Senha Digisac').fill('TEST_PASSWORD_ONLY');
  await page
    .getByRole('button', { name: 'Conectar à Digisac', exact: true })
    .click();
  await page.getByRole('button', { name: /Montar manualmente/ }).click();
  await openBehaviorRule(page, 'afterTicketClosedEvaluation');
  const rules = page.locator('.behavior-question');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  const select = rules.getByLabel('Avaliação do atendimento', { exact: true });
  await select.selectOption('77777777-7777-4777-8777-777777777777');
  await expect(rules).toContainText('Como foi nosso atendimento?');
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(
    page.getByRole('button', { name: 'Exportar JSON do robô', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Enviar robô para esta conta', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'A Digisac aceitou o robô',
      exact: true,
    }),
  ).toBeVisible();
  await openBehaviorRule(page, 'afterTicketClosedEvaluation');
  const refresh = rules.getByRole('button', { name: 'Atualizar avaliações' });
  for (const state of ['ready', 'unavailable'] as const) {
    await page.route('**/api/catalog?profile=live', async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.catalog.questions = { state, items: [] };
      await route.fulfill({ json: data });
    });
    await refresh.click();
    await expect(select).toHaveValue('77777777-7777-4777-8777-777777777777');
    await expect(rules).toContainText(
      state === 'ready'
        ? 'Não há avaliações disponíveis.'
        : 'Não foi possível carregar as avaliações.',
    );
    await expect(select).toHaveAttribute('aria-invalid', 'true');
    await closeBehaviorRules(page);
    await expect(
      page.getByRole('button', { name: 'Exportar JSON do robô', exact: true }),
    ).toBeDisabled();
    await openBehaviorRule(page, 'afterTicketClosedEvaluation');
    await page.unroute('**/api/catalog?profile=live');
  }
  await refresh.click();
  await expect(select).toBeEnabled();
  await expect(select).toHaveAttribute('aria-invalid', 'false');
  await page.route('**/api/catalog?profile=live', (route) =>
    route.fulfill({
      status: 401,
      json: { code: 'SESSION_EXPIRED', error: 'Sessão expirada de teste.' },
    }),
  );
  await refresh.click();
  await expect(
    page.getByRole('heading', { name: 'Conecte sua Digisac.' }),
  ).toBeVisible();
});
