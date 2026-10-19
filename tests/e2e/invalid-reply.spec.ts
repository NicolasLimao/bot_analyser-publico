import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { prepareEditorSession } from './editor-session.ts';
import { completeGuidedPrompts } from './guided-helpers.ts';
import {
  openBehaviorRule,
  closeBehaviorRules,
  editGuidedRule,
} from './behavior-helpers.ts';

test.beforeEach(async ({ page }) => prepareEditorSession(page));

test('invalid reply settings persist, validate, export and keep the current menu in conversation', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByLabel('Departamentos disponíveis').selectOption('qa');
  await openBehaviorRule(page, 'invalidReply');
  const rules = page.locator('.behavior-question');
  const toggle = rules.getByRole('radio', { name: /^Sim/ });
  const field = rules.getByLabel('Mensagem para resposta inválida', {
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
  await openBehaviorRule(page, 'invalidReply');
  await expect(toggle).toBeChecked();
  await expect(field).toHaveValue('');
  const message =
    'Não reconheci essa opção, {{contact_name}}. Escolha no menu abaixo.';
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
  await openBehaviorRule(page, 'invalidReply');
  await expect(field).toHaveValue(message);
  await mkdir('.impeccable/review', { recursive: true });
  await rules.screenshot({
    path: `.impeccable/review/invalid-reply-${info.project.name}.png`,
    animations: 'disabled',
  });
  await closeBehaviorRules(page);
  if (info.project.name === 'mobile')
    await page
      .getByRole('button', { name: 'Testar conversa', exact: true })
      .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  const reply = chat.getByLabel('Responder como contato');
  const notices = chat
    .locator('.chat-item.bot')
    .filter({ hasText: 'Não reconheci essa opção, Contato de teste.' });
  await reply.fill('01');
  await reply.press('Enter');
  await expect(notices).toHaveCount(1);
  await expect(chat.locator('.chat-item.bot').last()).toContainText(
    'Como podemos ajudar?',
  );
  await chat.getByRole('button', { name: '1 Comercial', exact: true }).click();
  await expect(notices).toHaveCount(1);
  await reply.fill('2');
  await reply.press('Enter');
  await expect(notices).toHaveCount(2);
  await expect(chat.locator('.chat-item.bot').last()).toContainText(
    'Voltar ao início',
  );
  await chat
    .getByRole('button', { name: '0 Voltar ao início', exact: true })
    .click();
  await chat.getByRole('button', { name: '2 Suporte', exact: true }).click();
  await expect(reply).toBeDisabled();
  await expect(notices).toHaveCount(2);
  await chat.getByRole('button', { name: 'Reiniciar simulação' }).click();
  await chat
    .getByRole('button', { name: 'Simular mensagem do atendente' })
    .click();
  await expect(reply).toBeDisabled();
  await expect(notices).toHaveCount(0);
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  const bot = JSON.parse(await readFile((await download.path())!, 'utf8'));
  const runtime = JSON.parse(bot.defaultContexts);
  expect(runtime['@FALLBACK'].triggers).toEqual({});
  expect(runtime['@EVERY'].triggers.MESSAGE_RECEIVED).toBeUndefined();
  expect(bot.defaultContexts).toContain(message);
  expect(
    bot.flowJson.nodes.filter((n: any) => n.data.waitForResponse),
  ).toHaveLength(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('guided copy edits the invalid reply policy and shows it in review and chat', async ({
  page,
}) => {
  await page.goto('/');
  await openBehaviorRule(page, 'invalidReply');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  await page
    .getByLabel('Mensagem para resposta inválida', { exact: true })
    .fill('Empresa X: escolha uma opção.');
  await closeBehaviorRules(page);
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: /Usar meu roteiro atual/ }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await completeGuidedPrompts(page);
  const review = page.getByLabel('Revisão do roteiro', { exact: true });
  await review.getByText('Ver funções ativadas', { exact: true }).click();
  await expect(review).toContainText('Empresa X: escolha uma opção.');
  await editGuidedRule(page, 'Opções inválidas');
  await expect(page.getByRole('radio', { name: /^Sim/ })).toBeChecked();
  await page
    .getByLabel('Mensagem para resposta inválida', { exact: true })
    .fill('Escolha revisada.');
  await page
    .getByRole('button', { name: 'Voltar à revisão', exact: true })
    .click();
  await expect(review).toContainText('Escolha revisada.');
  await page
    .getByRole('button', { name: 'Testar conversa', exact: true })
    .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await chat.getByLabel('Responder como contato').fill('9');
  await chat.getByLabel('Responder como contato').press('Enter');
  await expect(
    chat.locator('.chat-item.bot').filter({ hasText: 'Escolha revisada.' }),
  ).toHaveCount(1);
  await expect(
    chat.getByRole('button', { name: '1 Comercial', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
