import {
  openBehaviorRule,
  closeBehaviorRules,
  setBehaviorRule,
} from './behavior-helpers.ts';
import { test, expect } from '@playwright/test';
import { prepareEditorSession } from './editor-session.ts';
test.beforeEach(async ({ page }) => {
  await prepareEditorSession(page);
});
import { finishGuidedDraft } from './guided-helpers.ts';
import { mkdir, readFile } from 'node:fs/promises';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('bot-analyser:editor-mode', 'advanced'),
  );
});

test('step names remain subtitles, identify destinations and persist without changing the conversation', async ({
  page,
}, info) => {
  await page.goto('/');
  const field = page.getByRole('textbox', {
    name: 'Nome da etapa opcional',
    exact: true,
  });
  await field.fill('Boas-vindas e identificação');
  const first = page.getByRole('button', { name: /^1\. Menu de opções/ });
  await expect(first.locator('strong')).toHaveText('1. Menu de opções');
  await expect(first.locator('.step-subtitle')).toHaveText(
    'Boas-vindas e identificação',
  );
  await expect(page.locator('.editor-subtitle')).toHaveText(
    'Boas-vindas e identificação',
  );
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await expect(chat).not.toContainText('Boas-vindas e identificação');
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await expect(field).toHaveValue('Boas-vindas e identificação');
  await page.getByRole('button', { name: /^2\. Menu de opções/ }).click();
  await expect(
    page
      .getByRole('option', {
        name: '1. Menu de opções — Boas-vindas e identificação',
        exact: true,
      })
      .first(),
  ).toHaveAttribute('value', 'welcome');
  await first.click();
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(
    page.getByRole('button', { name: 'Baixar prévia técnica' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/renamed-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await field.fill('');
  await expect(first.locator('.step-subtitle')).toHaveCount(0);
  await expect(page.locator('.editor-subtitle')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Baixar prévia técnica' }),
  ).toBeDisabled();
});

test('edits and persists the draft, simulates a submenu, and prepares the preview automatically', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Seu atendimento, passo a passo.' }),
  ).toBeVisible();
  await page.getByLabel('Nome do robô').fill('Triagem de teste');
  await page
    .getByLabel('Mensagem para o contato')
    .fill('Olá! Escolha seu atendimento.');
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await page.reload();
  await expect(page.getByLabel('Nome do robô')).toHaveValue('Triagem de teste');
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await expect(chat).toContainText('Olá! Escolha seu atendimento.');
  await chat.getByRole('button', { name: '1 Comercial', exact: true }).click();
  await chat
    .getByRole('button', { name: '0 Voltar ao início', exact: true })
    .click();
  await chat.getByRole('button', { name: '2 Suporte', exact: true }).click();
  await expect(chat).toContainText('O robô parou. O chamado continua aberto.');
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(
    page.getByText(
      'Prévia técnica disponível. Os arquivos acompanham suas alterações.',
    ),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar prévia técnica' }).click();
  const download = await downloadPromise;
  const result = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(result.status).toBe('preview');
  expect(result.importReady).toBe(false);
  expect(result.catalogSource).toBe('simulated');
  expect(result.bot.name).toBe('Triagem de teste');
  expect(errors).toEqual([]);
});

test('preparation failure keeps the draft editable and tabs work by keyboard before retrying', async ({
  page,
}) => {
  let attempts = 0;
  let sends = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/bots') sends++;
  });
  await page.route('**/api/preview?*', async (route) => {
    attempts++;
    if (attempts === 1)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Não foi possível consultar os departamentos.',
        }),
      });
    else await route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('tabpanel')).toContainText(
    'Não foi possível consultar os departamentos.',
  );
  await expect(
    page.getByRole('button', { name: 'Baixar prévia técnica' }),
  ).toBeDisabled();
  await page.getByRole('tab', { name: 'Exportar e enviar' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(
    page.getByRole('tab', { name: 'Rascunho', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Rascunho salvo neste navegador.',
  );
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(
    page.getByRole('tab', { name: 'Exportar e enviar' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Tentar preparar novamente' }).click();
  await expect(
    page.getByRole('button', { name: 'Baixar prévia técnica' }),
  ).toBeEnabled();
  expect(attempts).toBe(2);
  expect(sends).toBe(0);
});

test('changing departments clears an incompatible attendant and incomplete choices block generation', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: /^3\. Transferir atendimento/ })
    .click();
  await expect(page.getByLabel('Atendente opcional')).toHaveValue(
    'demo-user-1',
  );
  await page
    .getByRole('combobox', { name: 'Departamento', exact: true })
    .selectOption('demo-support');
  await expect(page.getByLabel('Atendente opcional')).toHaveValue('');
  await expect(
    page.getByLabel('Atendente opcional').locator('option'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: /^1\. Menu de opções/ }).click();
  await page
    .getByRole('button', { name: 'Adicionar opção', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Pontos para revisar' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Baixar prévia técnica' }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Remover opção 3', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'As etapas estão conectadas' }),
  ).toBeVisible();
});

test('editing during generation discards the outdated preview', async ({
  page,
}) => {
  let release!: () => void;
  let entered!: () => void;
  const requested = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const resume = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/preview?*', async (route) => {
    const response = await route.fetch();
    entered();
    await resume;
    await route.fulfill({ response });
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await requested;
  await page
    .getByLabel('Nome do robô')
    .fill('Roteiro alterado durante a geração');
  release();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar prévia técnica' }).click();
  const downloaded = await pending;
  const preview = JSON.parse(
    await readFile((await downloaded.path())!, 'utf8'),
  );
  expect(preview.bot.name).toBe('Roteiro alterado durante a geração');
  await expect(page.getByRole('button', { name: 'Gerar prévia' })).toHaveCount(
    0,
  );
});

test('QA rules persist, simulate both events, and export the bot object with real departments', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Departamentos disponíveis').selectOption('qa');
  const yes = page.getByRole('radio', { name: /^Sim/ });
  await openBehaviorRule(page, 'firstMessageOnly');
  await expect(yes).toBeChecked();
  await openBehaviorRule(page, 'stopOnAttendantMessage');
  await expect(yes).toBeChecked();
  await closeBehaviorRules(page);
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await chat.getByLabel('Mensagem de entrada').selectOption('later');
  await expect(chat).toContainText('Não é a primeira mensagem');
  await expect(
    chat.getByRole('button', { name: '2 Suporte', exact: true }),
  ).toHaveCount(0);
  await chat.getByLabel('Mensagem de entrada').selectOption('first');
  await chat.getByRole('button', { name: '1 Comercial', exact: true }).click();
  await chat
    .getByRole('button', { name: 'Simular mensagem do atendente' })
    .click();
  await expect(chat).toContainText('Mensagem do atendente: o robô parou');
  await expect(
    chat.getByRole('button', { name: '0 Voltar ao início', exact: true }),
  ).toHaveCount(0);
  await setBehaviorRule(page, 'firstMessageOnly', false);
  await setBehaviorRule(page, 'stopOnAttendantMessage', false);
  await chat
    .getByRole('button', { name: 'Simular mensagem do atendente' })
    .click();
  await expect(chat).toContainText('o robô continua');
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel('Departamentos disponíveis')).toHaveValue('qa');
  await openBehaviorRule(page, 'firstMessageOnly');
  await expect(yes).not.toBeChecked();
  await yes.check();
  await openBehaviorRule(page, 'stopOnAttendantMessage');
  await expect(yes).not.toBeChecked();
  await yes.check();
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar JSON do robô' }).click();
  const download = await pending;
  const bot = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(bot.name).toBe('Triagem de demonstração - QA');
  expect(bot.accountId).toBe('00000000-0000-4000-8000-000000000001');
  expect(bot.bot).toBeUndefined();
  expect(JSON.stringify(bot)).not.toMatch(/demo-(account|sales|support|user)/);
  expect(bot.flowJson.nodes).toHaveLength(13);
  const defaults = JSON.parse(bot.defaultContexts);
  expect(defaults['@EVERY'].triggers.USER_MESSAGE_SENT).toHaveLength(1);
  const transfers = Object.values(defaults)
    .flatMap((c: any) => Object.values(c.triggers).flat())
    .flatMap((r: any) => r.actions)
    .filter((a: any) => a.value === 'TRANSFER_TICKET');
  expect(transfers.map((a: any) => a.data.department).sort()).toEqual(
    [
      '00000000-0000-4000-8000-000000000111',
      '00000000-0000-4000-8000-000000000105',
    ].sort(),
  );
  expect(transfers.every((a: any) => !('user' in a.data))).toBe(true);
  await setBehaviorRule(page, 'firstMessageOnly', false);
  await expect(
    page.getByRole('button', { name: 'Exportar JSON do robô' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: /Atendimento direto/ }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await finishGuidedDraft(page, '00000000-0000-4000-8000-000000000111');
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Atendimento da Empresa X',
  );
  await openBehaviorRule(page, 'firstMessageOnly');
  await expect(yes).not.toBeChecked();
  await openBehaviorRule(page, 'stopOnAttendantMessage');
  await expect(yes).toBeChecked();
  await closeBehaviorRules(page);
  await page.getByLabel('Nome do robô').fill('Novo atendimento QA');
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(
    page.getByRole('button', { name: 'Exportar JSON do robô' }),
  ).toBeEnabled();
});

test('captures the complete initial view with no horizontal overflow', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Triagem de demonstração',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
});

test('new robot preserves unsaved edits and storage failure leaves the current draft open', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Nome do robô').fill('Roteiro recuperável');
  await setBehaviorRule(page, 'firstMessageOnly', true);
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await finishGuidedDraft(page);
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Atendimento da Empresa X',
  );
  await page.reload();
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Roteiro recuperável',
  );
  await openBehaviorRule(page, 'firstMessageOnly');
  await expect(page.getByRole('radio', { name: /^Sim/ })).toBeChecked();
  await closeBehaviorRules(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable');
    };
  });
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'o novo robô não foi criado',
  );
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Roteiro recuperável',
  );
});
