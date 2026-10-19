import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { prepareEditorSession } from './editor-session.ts';
import { completeGuidedPrompts } from './guided-helpers.ts';
import {
  openBehaviorRule,
  closeBehaviorRules,
  setBehaviorRule,
  editGuidedRule,
} from './behavior-helpers.ts';

test.beforeEach(async ({ page }) => prepareEditorSession(page));

test('entry rules preserve incomplete drafts, block export, simulate precedence and export coherent policies', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByLabel('Departamentos disponíveis').selectOption('qa');
  await openBehaviorRule(page, 'respectHolidays');
  await expect(page.getByRole('radio', { name: /^Não/ })).toBeChecked();
  await page.getByRole('radio', { name: /^Sim/ }).check();
  await openBehaviorRule(page, 'businessHours');
  const rules = page.locator('.behavior-question');
  const hours = rules.getByRole('radio', { name: /^Sim/ });
  await expect(hours).not.toBeChecked();
  await hours.check();
  await expect(rules.getByLabel('Mensagem fora do horário')).toContainText(
    'Olá {{contact_name}}!',
  );
  await rules.getByLabel('Mensagem fora do horário').fill('');
  await expect(rules.getByLabel('Mensagem fora do horário')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await setBehaviorRule(page, 'firstMessageOnly', true);
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(
    page.getByRole('button', { name: 'Exportar JSON do robô', exact: true }),
  ).toBeDisabled();
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await openBehaviorRule(page, 'respectHolidays');
  await expect(page.getByRole('radio', { name: /^Sim/ })).toBeChecked();
  await openBehaviorRule(page, 'businessHours');
  await expect(hours).toBeChecked();
  await expect(rules.getByLabel('Mensagem fora do horário')).toHaveValue('');
  await rules
    .getByLabel('Mensagem fora do horário')
    .fill('Olá {{contact_name}}, voltaremos no próximo expediente.');
  await rules.getByRole('radio', { name: /^Não/ }).check();
  await expect(rules.getByLabel('Mensagem fora do horário')).toHaveCount(0);
  await hours.check();
  await expect(rules.getByLabel('Mensagem fora do horário')).toHaveValue(
    'Olá {{contact_name}}, voltaremos no próximo expediente.',
  );
  await setBehaviorRule(page, 'firstMessageOnly', false);
  await setBehaviorRule(page, 'firstMessageOnly', true);
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  if (info.project.name === 'mobile')
    await page
      .getByRole('button', { name: 'Testar conversa', exact: true })
      .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await chat.getByLabel('Horário simulado').selectOption('closed');
  await expect(chat).toContainText(
    'Olá Contato de teste, voltaremos no próximo expediente.',
  );
  await expect(chat).toContainText('O chamado continua aberto.');
  await chat.getByLabel('Dia simulado').selectOption('holiday');
  await expect(chat).toContainText('Feriado simulado');
  await expect(chat).not.toContainText('voltaremos no próximo expediente');
  await chat.getByLabel('Mensagem de entrada').selectOption('later');
  await expect(chat).toContainText('sem iniciar o menu nem enviar avisos');
  await expect(chat).not.toContainText('Feriado simulado');
  await chat.getByLabel('Mensagem de entrada').selectOption('first');
  await chat.getByLabel('Dia simulado').selectOption('normal');
  await chat.getByLabel('Horário simulado').selectOption('open');
  await chat.getByRole('button', { name: '1 Comercial', exact: true }).click();
  await chat
    .getByRole('button', { name: '0 Voltar ao início', exact: true })
    .click();
  await chat
    .getByRole('button', { name: 'Simular mensagem do atendente' })
    .click();
  await expect(chat).toContainText('Mensagem do atendente: o robô parou');
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Exportar JSON do robô', exact: true })
    .click();
  const download = await downloadPromise;
  const bot = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(
    bot.flowJson.nodes.some((n: any) => n.type === 'SEND_HOLIDAY_MESSAGE_NODE'),
  ).toBe(true);
  expect(bot.defaultContexts).toContain('{{is_company_open}}');
  expect(bot.defaultContexts).toContain('@botOnHoliday');
  expect(bot.defaultContexts).toContain('voltaremos no próximo expediente');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir('.impeccable/review', { recursive: true });
  await openBehaviorRule(page, 'businessHours');
  await rules.screenshot({
    path: `.impeccable/review/entry-policies-${info.project.name}.png`,
  });
});

test('return shortcut creates a local option, prevents duplicates and supports undo', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Roteiro por caminhos' });
  const root = editor.locator('.inline-step').first();
  const branches = root.locator(':scope > .inline-options > fieldset');
  await branches
    .nth(1)
    .locator(':scope > .branch-next > select')
    .selectOption('menu');
  const submenu = branches.nth(1).locator('.inline-step').first();
  const shortcut = submenu.getByRole('button', {
    name: 'Adicionar retorno 0 ao menu inicial',
    exact: true,
  });
  await shortcut.click();
  await expect(shortcut).toBeDisabled();
  await expect(
    submenu.getByText('A resposta 0 já está em uso', { exact: false }),
  ).toBeVisible();
  await expect(
    submenu.locator(':scope > .inline-options > fieldset'),
  ).toHaveCount(3);
  await editor.getByRole('button', { name: 'Desfazer alteração' }).click();
  await expect(shortcut).toBeEnabled();
  await expect(
    submenu.locator(':scope > .inline-options > fieldset'),
  ).toHaveCount(2);
  await shortcut.click();
  await root
    .locator(':scope > .inline-step-heading')
    .getByRole('button', { name: 'Testar este menu' })
    .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await chat.getByRole('button', { name: '2 Suporte', exact: true }).click();
  await chat
    .getByRole('button', { name: '0 Voltar ao menu inicial', exact: true })
    .click();
  await expect(
    chat.getByRole('button', { name: '1 Comercial', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('guided copy preserves policies and exposes their own editable review step', async ({
  page,
}, info) => {
  await page.goto('/');
  await setBehaviorRule(page, 'respectHolidays', true);
  await openBehaviorRule(page, 'businessHours');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  await page
    .getByLabel('Mensagem fora do horário')
    .fill('Mensagem de encerramento do expediente.');
  await closeBehaviorRules(page);
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: /Usar meu roteiro atual/ }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await completeGuidedPrompts(page);
  const review = page.getByLabel('Revisão do roteiro', { exact: true });
  await expect(review).toContainText('Mensagem de encerramento do expediente.');
  await editGuidedRule(page, 'Feriados');
  await expect(page.getByRole('radio', { name: /^Sim/ })).toBeChecked();
  await page
    .getByRole('button', { name: 'Voltar à revisão', exact: true })
    .click();
  await editGuidedRule(page, 'Horário de atendimento');
  await expect(page.getByLabel('Mensagem fora do horário')).toHaveValue(
    'Mensagem de encerramento do expediente.',
  );
  await page.getByLabel('Mensagem fora do horário').fill('Novo aviso.');
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/guided-entry-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Voltar à revisão', exact: true })
    .click();
  await expect(review).toContainText('Novo aviso.');
  await page
    .getByRole('button', { name: 'Testar conversa', exact: true })
    .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await chat.getByText('Testar regras do atendimento', { exact: true }).click();
  await chat.getByLabel('Horário simulado').selectOption('closed');
  await expect(chat).toContainText('Novo aviso.');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
