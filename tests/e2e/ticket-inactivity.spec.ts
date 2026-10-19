import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { prepareEditorSession } from './editor-session.ts';
import { completeGuidedPrompts } from './guided-helpers.ts';
import {
  openBehaviorRule,
  closeBehaviorRules,
  editGuidedRule,
} from './behavior-helpers.ts';

test.beforeEach(async ({ page }) => prepareEditorSession(page));

test('ticket inactivity saves incomplete drafts, simulates both branches and exports closing rules', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByLabel('Departamentos disponíveis').selectOption('qa');
  await openBehaviorRule(page, 'ticketInactivity');
  const rules = page.locator('.behavior-question');
  const toggle = rules.getByRole('radio', { name: /^Sim/ });
  const field = rules.getByLabel('Mensagem de encerramento por inatividade');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(field).toContainText('Olá {{contact_name}}!');
  await rules.getByText('Como funciona o prazo?', { exact: true }).click();
  await expect(rules).toContainText(
    'Tempo de inatividade de chamado (minutos)',
  );
  await expect(rules.getByRole('spinbutton')).toHaveCount(0);
  await field.fill('');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  const exportButton = page.getByRole('button', {
    name: 'Exportar JSON do robô',
    exact: true,
  });
  await expect(exportButton).toBeDisabled();
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await openBehaviorRule(page, 'ticketInactivity');
  await expect(toggle).toBeChecked();
  await expect(field).toHaveValue('');
  await rules.getByRole('radio', { name: /^Não/ }).check();
  await toggle.check();
  await expect(field).toHaveValue('');
  const message = 'Olá {{contact_name}}, estamos encerrando por inatividade.';
  await field.fill(message);
  await rules.getByRole('radio', { name: /^Não/ }).check();
  await toggle.check();
  await expect(field).toHaveValue(message);
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await openBehaviorRule(page, 'ticketInactivity');
  await expect(field).toHaveValue(message);
  await mkdir('.impeccable/review', { recursive: true });
  await rules.screenshot({
    path: `.impeccable/review/ticket-inactivity-${info.project.name}.png`,
  });
  await closeBehaviorRules(page);
  if (info.project.name === 'mobile')
    await page
      .getByRole('button', { name: 'Testar conversa', exact: true })
      .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  const condition = chat.getByLabel(
    'Na inatividade, mensagem foi enviada pelo atendente?',
  );
  const simulate = chat.getByRole('button', {
    name: 'Simular chamado inativo',
    exact: true,
  });
  await condition.selectOption('false');
  await simulate.click();
  await expect(chat).toContainText(
    'Condição falsa: sem envio de mensagem e sem fechamento.',
  );
  await expect(chat).not.toContainText(
    'Olá Contato de teste, estamos encerrando',
  );
  await expect(chat.locator('.chat-options button')).toHaveCount(0);
  await chat.getByRole('button', { name: 'Reiniciar simulação' }).click();
  await chat
    .getByRole('button', { name: 'Simular mensagem do atendente' })
    .click();
  await expect(chat).toContainText('O chamado continua aberto.');
  await condition.selectOption('true');
  await simulate.click();
  await expect(chat).toContainText(
    'Olá Contato de teste, estamos encerrando por inatividade.',
  );
  await expect(chat).toContainText('O chamado foi fechado na simulação.');
  await expect(simulate).toBeDisabled();
  await chat.getByRole('button', { name: 'Reiniciar simulação' }).click();
  await expect(simulate).toBeEnabled();
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  const bot = JSON.parse(await readFile((await download.path())!, 'utf8'));
  const runtime = JSON.parse(bot.defaultContexts);
  expect(runtime['@EVERY'].triggers.TICKET_INACTIVE).toHaveLength(1);
  expect(runtime['@EVERY'].triggers.USER_MESSAGE_SENT).toHaveLength(1);
  expect(runtime['@EVERY'].triggers.BOT_INACTIVE).toBeUndefined();
  expect(bot.defaultContexts).toContain('CLOSE_TICKET');
  expect(bot.defaultContexts).toContain(message);
  expect(
    bot.flowJson.nodes.filter((n: any) => n.type === 'PERSISTENT_START_NODE'),
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('guided copy exposes inactivity in review, editing and simulation', async ({
  page,
}, info) => {
  await page.goto('/');
  await openBehaviorRule(page, 'ticketInactivity');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  await page
    .getByLabel('Mensagem de encerramento por inatividade')
    .fill('Aviso de teste para encerramento.');
  await closeBehaviorRules(page);
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: /Usar meu roteiro atual/ }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await completeGuidedPrompts(page);
  const review = page.getByLabel('Revisão do roteiro', { exact: true });
  const functions = review.getByLabel('Resumo das regras do atendimento');
  const toggleFunctions = review.getByText('Ver funções ativadas', {
    exact: true,
  });
  await expect(functions).not.toBeVisible();
  await toggleFunctions.click();
  await expect(functions).toBeVisible();
  await expect(review).toContainText('Aviso de teste para encerramento.');
  await expect(review).toContainText('Depois, fechar o chamado.');
  await toggleFunctions.press('Enter');
  await expect(functions).not.toBeVisible();
  await editGuidedRule(page, 'Contato sem resposta');
  await expect(page.getByRole('radio', { name: /^Sim/ })).toBeChecked();
  await page
    .getByLabel('Mensagem de encerramento por inatividade')
    .fill('Aviso revisado.');
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/guided-inactivity-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Voltar à revisão', exact: true })
    .click();
  await expect(review).toContainText('Aviso revisado.');
  await page
    .getByRole('button', { name: 'Testar conversa', exact: true })
    .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await chat.getByText('Testar regras do atendimento', { exact: true }).click();
  await chat
    .getByRole('button', { name: 'Simular chamado inativo', exact: true })
    .click();
  await expect(chat).toContainText('Aviso revisado.');
  await expect(chat).toContainText('O chamado foi fechado na simulação.');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
