import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { openBehaviorRule, closeBehaviorRules } from './behavior-helpers.ts';

async function connect(page: Page, mobile: boolean) {
  await page.goto(`http://127.0.0.1:${mobile ? 3005 : 3004}`);
  await page
    .getByLabel('URL da instância')
    .fill('https://demo-publico.digisac.chat');
  await page.getByLabel('Usuário Digisac').fill('inactivity@example.test');
  await page.getByLabel('Senha Digisac').fill('TEST_PASSWORD_ONLY');
  await page
    .getByRole('button', { name: 'Conectar à Digisac', exact: true })
    .click();
}

test('connected inactivity shows only the time, changes it explicitly and preserves the robot message', async ({
  page,
}, info) => {
  await connect(page, info.project.name === 'mobile');
  await page.getByRole('button', { name: /Montar manualmente/ }).click();
  await openBehaviorRule(page, 'ticketInactivity');
  let writes = 0;
  page.on('request', (request) => {
    if (
      request.url().endsWith('/api/company/inactivity-time') &&
      request.method() === 'PUT'
    )
      writes++;
  });
  const company = page.getByRole('region', {
    name: 'Prazo de inatividade da empresa',
  });
  const yes = page.getByRole('radio', { name: /^Sim/ });
  await expect(company).toHaveCount(0);
  await yes.check();
  const minutes = company.getByLabel('Tempo de inatividade (minutos)');
  const save = company.getByRole('button', {
    name: 'Atualizar prazo da empresa',
    exact: true,
  });
  await expect(minutes).toHaveValue('10');
  await expect(save).toBeDisabled();
  await expect(company).toContainText('outros robôs e atendimentos');
  await minutes.fill('0');
  await expect(minutes).toHaveAttribute('aria-invalid', 'true');
  await expect(save).toBeDisabled();
  await minutes.fill('1.5');
  await expect(save).toBeDisabled();
  await minutes.fill('25');
  expect(writes).toBe(0);
  const message = page.getByLabel('Mensagem de encerramento por inatividade');
  await message.fill('Seu atendimento será encerrado por inatividade.');
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/company/inactivity-time', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    await hold;
    await route.continue();
  });
  await save.click();
  await expect(
    page.getByRole('button', { name: 'Continuar', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Voltar ao robô', exact: true }),
  ).toBeDisabled();
  await expect(yes).toBeDisabled();
  release();
  await expect(company).toContainText('Prazo atualizado para 25 minutos.');
  expect(writes).toBe(1);
  await expect(minutes).toHaveValue('25');
  await expect(message).toHaveValue(
    'Seu atendimento será encerrado por inatividade.',
  );
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/account-inactivity-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await closeBehaviorRules(page);
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  expect(writes).toBe(1);
  await page.reload();
  await openBehaviorRule(page, 'ticketInactivity');
  await expect(minutes).toHaveValue('25');
  await expect(message).toHaveValue(
    'Seu atendimento será encerrado por inatividade.',
  );
});

test('inactivity conflicts and failed reads preserve edits and require a fresh consultation', async ({
  page,
}, info) => {
  await connect(page, info.project.name === 'mobile');
  await page.getByRole('button', { name: /Montar manualmente/ }).click();
  await openBehaviorRule(page, 'ticketInactivity');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  const company = page.getByRole('region', {
    name: 'Prazo de inatividade da empresa',
  });
  const minutes = company.getByLabel('Tempo de inatividade (minutos)');
  await expect(minutes).toHaveValue('10');
  await minutes.fill('30');
  await page
    .getByLabel('Mensagem de encerramento por inatividade')
    .fill('Mensagem preservada.');
  await page.route('**/api/company/inactivity-time', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 409,
          json: {
            code: 'INACTIVITY_CHANGED',
            error:
              'A configuração da empresa mudou. Consulte novamente antes de alterar.',
          },
        })
      : route.continue(),
  );
  await company
    .getByRole('button', { name: 'Atualizar prazo da empresa', exact: true })
    .click();
  await expect(company.getByRole('alert')).toContainText('Consulte novamente');
  await expect(minutes).toHaveCount(0);
  await page.unroute('**/api/company/inactivity-time');
  const refresh = company.getByRole('button', {
    name: 'Consultar prazo novamente',
    exact: true,
  });
  await refresh.click();
  await expect(minutes).toHaveValue('30');
  await expect(company).toContainText('Prazo atual da empresa: 10 minutos');
  for (const [status, error] of [
    [403, 'Este acesso não tem permissão para consultar o prazo da empresa.'],
    [401, 'A conexão expirou. Conecte novamente à Digisac.'],
  ] as const) {
    await page.route('**/api/company/inactivity-time', (route) =>
      route.fulfill({ status, json: { error } }),
    );
    await refresh.click();
    await expect(company.getByRole('alert')).toHaveText(error);
    await expect(minutes).toHaveCount(0);
    await expect(
      page.getByLabel('Mensagem de encerramento por inatividade'),
    ).toHaveValue('Mensagem preservada.');
    await page.unroute('**/api/company/inactivity-time');
  }
  await refresh.click();
  await expect(minutes).toHaveValue('30');
});

test('guided inactivity reconciles an uncertain update with GET without automatically repeating the write', async ({
  page,
}, info) => {
  await connect(page, info.project.name === 'mobile');
  await page
    .getByRole('button', { name: /Criar a partir de um modelo/ })
    .click();
  await page.getByRole('button', { name: /Atendimento direto/ }).click();
  await page
    .getByRole('button', { name: 'Personalizar este modelo', exact: true })
    .click();
  for (
    let index = 0;
    index < 20 &&
    !(await page
      .locator('[data-behavior-rule="ticketInactivity"]')
      .isVisible());
    index++
  )
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('radio', { name: /^Sim/ }).check();
  const company = page.getByRole('region', {
    name: 'Prazo de inatividade da empresa',
  });
  const minutes = company.getByLabel('Tempo de inatividade (minutos)');
  await expect(minutes).toHaveValue('10');
  await minutes.fill('15');
  let writes = 0;
  await page.route('**/api/company/inactivity-time', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++;
    await route.fetch();
    await route.fulfill({
      status: 502,
      json: {
        code: 'INACTIVITY_UPDATE_UNKNOWN',
        error:
          'Não foi possível confirmar a alteração. Consulte o prazo novamente antes de tentar outra mudança.',
      },
    });
  });
  await company
    .getByRole('button', { name: 'Atualizar prazo da empresa', exact: true })
    .click();
  await expect(company.getByRole('alert')).toContainText(
    'Não foi possível confirmar',
  );
  expect(writes).toBe(1);
  await company
    .getByRole('button', { name: 'Consultar prazo novamente', exact: true })
    .click();
  await expect(company).toContainText('Prazo atual da empresa: 15 minutos');
  await expect(minutes).toHaveValue('15');
  await expect(
    company.getByRole('button', {
      name: 'Atualizar prazo da empresa',
      exact: true,
    }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(minutes).toHaveValue('15');
  expect(writes).toBe(1);
});
