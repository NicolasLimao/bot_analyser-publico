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

test('closing message persists, blocks incomplete exports and simulates manual and automatic closing once', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByLabel('Departamentos disponíveis').selectOption('qa');
  await openBehaviorRule(page, 'afterTicketClosed');
  const rules = page.locator('.behavior-question');
  const toggle = rules.getByRole('radio', { name: /^Sim/ });
  const field = rules.getByLabel('Mensagem após fechar o chamado', {
    exact: true,
  });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
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
  await openBehaviorRule(page, 'afterTicketClosed');
  await expect(toggle).toBeChecked();
  await expect(field).toHaveValue('');
  const message = 'Obrigado pelo contato, {{contact_name}}! Até breve.';
  await field.fill(message);
  await rules.getByRole('radio', { name: /^Não/ }).check();
  await toggle.check();
  await expect(field).toHaveValue(message);
  await openBehaviorRule(page, 'ticketInactivity');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  await rules
    .getByLabel('Mensagem de encerramento por inatividade')
    .fill('Aviso antes de fechar.');
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await openBehaviorRule(page, 'afterTicketClosed');
  await expect(field).toHaveValue(message);
  await mkdir('.impeccable/review', { recursive: true });
  await rules.screenshot({
    path: `.impeccable/review/after-close-${info.project.name}.png`,
  });
  await closeBehaviorRules(page);
  if (info.project.name === 'mobile')
    await page
      .getByRole('button', { name: 'Testar conversa', exact: true })
      .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  const manual = chat.getByRole('button', {
    name: 'Simular fechamento manual',
    exact: true,
  });
  const inactive = chat.getByRole('button', {
    name: 'Simular chamado inativo',
    exact: true,
  });
  const closingMessages = chat
    .locator('.chat-item.bot')
    .filter({ hasText: 'Obrigado pelo contato, Contato de teste! Até breve.' });
  await chat
    .getByRole('button', { name: 'Simular mensagem do atendente' })
    .click();
  await expect(closingMessages).toHaveCount(0);
  await manual.click();
  await expect(closingMessages).toHaveCount(1);
  await expect(chat).toContainText(
    'O chamado foi fechado manualmente na simulação.',
  );
  await expect(manual).toBeDisabled();
  await expect(inactive).toBeDisabled();
  await expect(chat.getByLabel('Responder como contato')).toBeDisabled();
  await chat.getByRole('button', { name: 'Reiniciar simulação' }).click();
  await chat
    .getByLabel('Na inatividade, mensagem foi enviada pelo atendente?')
    .selectOption('false');
  await inactive.click();
  await expect(closingMessages).toHaveCount(0);
  await expect(manual).toBeEnabled();
  await chat.getByRole('button', { name: 'Reiniciar simulação' }).click();
  await chat
    .getByLabel('Na inatividade, mensagem foi enviada pelo atendente?')
    .selectOption('true');
  await inactive.click();
  await expect(chat).toContainText('Aviso antes de fechar.');
  await expect(closingMessages).toHaveCount(1);
  const transcript = await chat.locator('.chat-content').innerText();
  expect(transcript.indexOf('Aviso antes de fechar.')).toBeLessThan(
    transcript.indexOf('O chamado foi fechado na simulação.'),
  );
  expect(
    transcript.indexOf('O chamado foi fechado na simulação.'),
  ).toBeLessThan(transcript.indexOf('Obrigado pelo contato'));
  await expect(manual).toBeDisabled();
  await chat.getByRole('button', { name: 'Reiniciar simulação' }).click();
  await expect(manual).toBeEnabled();
  await expect(closingMessages).toHaveCount(0);
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  const bot = JSON.parse(await readFile((await download.path())!, 'utf8'));
  const events = JSON.parse(bot.defaultContexts)['@EVERY'].triggers;
  expect(events.TICKET_CLOSED).toHaveLength(1);
  expect(events.TICKET_INACTIVE).toHaveLength(1);
  expect(events.USER_MESSAGE_SENT).toHaveLength(1);
  expect(bot.defaultContexts).toContain(message);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('guided copy preserves closing message in rules, review and conversation', async ({
  page,
}) => {
  await page.goto('/');
  await openBehaviorRule(page, 'afterTicketClosed');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  await page
    .getByLabel('Mensagem após fechar o chamado', { exact: true })
    .fill('Despedida da Empresa X.');
  await closeBehaviorRules(page);
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: /Usar meu roteiro atual/ }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await completeGuidedPrompts(page);
  const review = page.getByLabel('Revisão do roteiro', { exact: true });
  await review.getByText('Ver funções ativadas', { exact: true }).click();
  await expect(review).toContainText('Despedida da Empresa X.');
  await editGuidedRule(page, 'Mensagem de despedida');
  await expect(page.getByRole('radio', { name: /^Sim/ })).toBeChecked();
  await page
    .getByLabel('Mensagem após fechar o chamado', { exact: true })
    .fill('Despedida revisada.');
  await page
    .getByRole('button', { name: 'Voltar à revisão', exact: true })
    .click();
  await expect(review).toContainText('Despedida revisada.');
  await page
    .getByRole('button', { name: 'Testar conversa', exact: true })
    .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await chat.getByText('Testar regras do atendimento', { exact: true }).click();
  await chat
    .getByRole('button', { name: 'Simular fechamento manual', exact: true })
    .click();
  await expect(chat).toContainText('Despedida revisada.');
  await expect(
    chat.getByRole('button', { name: 'Simular fechamento manual' }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
