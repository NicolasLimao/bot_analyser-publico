import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeEach(async ({ page }, info) => {
  await page.goto(
    `http://127.0.0.1:${info.project.name === 'mobile' ? 3007 : 3006}`,
  );
});

test('company name resolves before login, sends no credentials in discovery and remembers the chosen URL', async ({
  page,
}, info) => {
  const discovery: unknown[] = [];
  const authentications: any[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/connection/resolve'))
      discovery.push(request.postDataJSON());
    if (
      request.url().endsWith('/api/connection') &&
      request.method() === 'POST'
    )
      authentications.push(request.postDataJSON());
  });
  const origin = page.getByLabel('URL da instância', { exact: true });
  await expect(origin).toHaveAttribute('type', 'text');
  await origin.fill('empresa-exemplo');
  await page.getByLabel('Usuário Digisac').fill('discovery@example.test');
  await expect(page.getByRole('status')).toContainText(
    'Instância encontrada: empresa-exemplo.digisac.io',
  );
  expect(discovery).toEqual([{ origin: 'empresa-exemplo' }]);
  expect(authentications).toHaveLength(0);
  await page.getByLabel('Senha Digisac').fill('TEST_PASSWORD_ONLY');
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/instance-found-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Conectar à Digisac', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Como você quer começar?' }),
  ).toBeVisible();
  expect(authentications).toHaveLength(1);
  expect(authentications[0].origin).toBe('https://empresa-exemplo.digisac.io');
  expect(
    await page.evaluate(() => localStorage.getItem('bot-analyser:instance')),
  ).toBe('https://empresa-exemplo.digisac.io');
});

test('several matching domains require an explicit selection before authentication', async ({
  page,
}, info) => {
  let authentications = 0;
  page.on('request', (request) => {
    if (
      request.url().endsWith('/api/connection') &&
      request.method() === 'POST'
    )
      authentications++;
  });
  await page.getByLabel('URL da instância', { exact: true }).fill('multiple');
  await page.getByLabel('Usuário Digisac').fill('multiple@example.test');
  await page.getByLabel('Senha Digisac').fill('TEST_PASSWORD_ONLY');
  const choices = page.getByRole('combobox', {
    name: 'Encontramos mais de um endereço. Qual é sua instância?',
  });
  await expect(choices).toBeVisible();
  await expect(choices.getByRole('option')).toHaveCount(3);
  const connect = page.getByRole('button', {
    name: 'Conectar à Digisac',
    exact: true,
  });
  await expect(connect).toBeDisabled();
  expect(authentications).toBe(0);
  await choices.selectOption('https://multiple.digisac.chat');
  await expect(connect).toBeEnabled();
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/instance-choice-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const login = page.waitForRequest(
    (request) =>
      request.url().endsWith('/api/connection') && request.method() === 'POST',
  );
  await connect.click();
  expect((await login).postDataJSON().origin).toBe(
    'https://multiple.digisac.chat',
  );
  await expect(
    page.getByRole('heading', { name: 'Como você quer começar?' }),
  ).toBeVisible();
  expect(authentications).toBe(1);
});

test('missing pages and unsafe URLs stay in the address field and do not send the password', async ({
  page,
}) => {
  let authentications = 0;
  page.on('request', (request) => {
    if (
      request.url().endsWith('/api/connection') &&
      request.method() === 'POST'
    )
      authentications++;
  });
  const origin = page.getByLabel('URL da instância', { exact: true });
  await origin.fill('missing');
  await page.getByLabel('Usuário Digisac').fill('missing@example.test');
  await expect(page.getByRole('alert')).toContainText('cinco domínios');
  await expect(origin).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Senha Digisac').fill('TEST_PASSWORD_ONLY');
  await page
    .getByRole('button', { name: 'Conectar à Digisac', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('cinco domínios');
  expect(authentications).toBe(0);
  await expect(page.getByLabel('Senha Digisac')).toHaveValue(
    'TEST_PASSWORD_ONLY',
  );
  await origin.fill('https://empresa-exemplo.digisac.io.evil.test');
  await origin.press('Tab');
  await expect(page.getByRole('alert')).toContainText(
    'Informe o nome da instância',
  );
  expect(authentications).toBe(0);
  await origin.fill('example.digisac.app');
  await origin.press('Tab');
  await expect(page.getByRole('status')).toContainText('example.digisac.app');
  await expect(origin).toHaveAttribute('aria-invalid', 'false');
});

test('late discovery and temporary failures never replace a newer address', async ({
  page,
}) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/connection/resolve', async (route) => {
    if (route.request().postDataJSON().origin === 'old-instance') {
      await hold;
      await route.fulfill({
        json: { origins: ['https://old-instance.digisac.me'] },
      });
    } else await route.continue();
  });
  const origin = page.getByLabel('URL da instância', { exact: true });
  await origin.fill('old-instance');
  await origin.press('Tab');
  await expect(page.getByRole('status')).toContainText('Verificando');
  await origin.fill('empresa-exemplo.digisac.io');
  await origin.press('Tab');
  await expect(page.getByRole('status')).toContainText(
    'empresa-exemplo.digisac.io',
  );
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/connection/resolve') &&
      response.request().postDataJSON().origin === 'old-instance',
  );
  release();
  await oldResponse;
  await expect(page.getByRole('status')).toContainText(
    'empresa-exemplo.digisac.io',
  );
  await page.unroute('**/api/connection/resolve');
  await page.route('**/api/connection/resolve', (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: 'INSTANCE_UNAVAILABLE',
        error:
          'Não foi possível verificar a página da instância. Tente novamente.',
      },
    }),
  );
  await origin.fill('temporary');
  await origin.press('Tab');
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível verificar',
  );
  await page.unroute('**/api/connection/resolve');
  await origin.fill('https://example.digisac.app');
  await origin.press('Tab');
  await expect(page.getByRole('status')).toContainText('example.digisac.app');
});
