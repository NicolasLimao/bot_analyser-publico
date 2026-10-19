import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';

async function openNavigation(page: Page) {
  const toggle = page.getByRole('button', { name: 'Abrir menu', exact: true });
  if (await toggle.isVisible()) await toggle.click();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('bot-analyser:editor-mode', 'advanced'),
  );
});

test('connects, selects live departments, sends, preserves edits on expiry and reports uncertain delivery', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${info.project.name === 'mobile' ? 3003 : 3002}`,
  );
  await openNavigation(page);
  await page
    .getByLabel('URL da instância')
    .fill('https://demo-publico.digisac.chat');
  await expect(page.getByLabel('URL da instância')).toBeVisible();
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/login-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('Usuário Digisac').fill('operator@example.test');
  await page.getByLabel('Senha Digisac').fill('TEST_PASSWORD_ONLY');
  await page
    .getByRole('button', { name: 'Conectar à Digisac', exact: true })
    .click();
  await page.getByRole('button', { name: /Montar manualmente/ }).click();
  await page.getByRole('button', { name: 'Editar conexões avançadas' }).click();
  await openNavigation(page);
  await expect(
    page.getByRole('heading', { name: 'Digisac conectada' }),
  ).toBeVisible();
  await expect(page.getByLabel('Departamentos disponíveis')).toHaveValue(
    'live',
  );
  await expect(
    page
      .locator('.sidebar')
      .getByRole('region', { name: 'Conexão com a Digisac' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Departamentos e equipe', exact: true })
    .click();
  const users = page.getByRole('table', {
    name: 'Usuários da equipe (3)',
    exact: true,
  });
  await expect(users).toContainText('Ana de teste');
  await expect(users).toContainText('Bruno sem departamento');
  await expect(
    users.getByRole('row', { name: /Carla arquivada/ }),
  ).toContainText('Indisponível');
  await page.screenshot({
    path: `.impeccable/review/team-${info.project.name}.png`,
    fullPage: true,
  });
  await openNavigation(page);
  await page
    .getByRole('button', { name: 'Criador de robôs', exact: true })
    .click();
  if (info.project.name === 'mobile') {
    await expect(
      page.getByRole('button', { name: 'Abrir menu', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false');
    await openNavigation(page);
    await page
      .getByRole('button', { name: 'Fechar menu', exact: true })
      .press('Escape');
    await expect(
      page.getByRole('button', { name: 'Abrir menu', exact: true }),
    ).toBeFocused();
  }
  await page.getByLabel('Nome do robô').fill('Atendimento integrado');
  await page.getByLabel('Nova etapa', { exact: true }).selectOption('transfer');
  await page
    .getByRole('button', { name: 'Adicionar etapa', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Departamento', exact: true })
    .selectOption('22222222-2222-4222-8222-222222222222');
  const attendant = page.getByRole('combobox', {
    name: 'Atendente opcional',
    exact: true,
  });
  await expect(attendant.getByRole('option')).toHaveCount(2);
  await attendant.selectOption('44444444-4444-4444-8444-444444444444');
  await page.getByRole('button', { name: /^1\. Enviar mensagem/ }).click();
  const destination = page.getByRole('combobox', {
    name: 'Próxima etapa',
    exact: true,
  });
  const transferId = await destination
    .getByRole('option', { name: '3. Transferir atendimento', exact: true })
    .getAttribute('value');
  await destination.selectOption(transferId!);
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await expect(
    page.getByRole('region', { name: 'Enviar robô para a Digisac' }),
  ).toContainText('https://demo-publico.digisac.chat');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `.impeccable/review/connected-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page
    .getByRole('button', { name: 'Enviar robô para esta conta' })
    .click();
  await expect(
    page.getByRole('status', { name: 'Resultado do envio' }),
  ).toContainText('A Digisac aceitou o robô');
  await expect(
    page.getByRole('status', { name: 'Resultado do envio' }),
  ).toContainText('ID do robô:');
  await expect(
    page.getByRole('button', { name: 'Envio concluído' }),
  ).toBeDisabled();
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'ba_session')?.httpOnly).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(
    /FAKE_TOKEN|TEST_PASSWORD_ONLY/,
  );
  await page.reload();
  await openNavigation(page);
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Atendimento integrado',
  );
  await expect(
    page.getByRole('heading', { name: 'Digisac conectada' }),
  ).toBeVisible();

  await page.getByLabel('Nome do robô').fill('Expirado - preservar roteiro');
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await page
    .getByRole('button', { name: 'Enviar robô para esta conta' })
    .click();
  await expect(page.getByRole('status')).toContainText('expirou');
  await expect(page.getByLabel('Nome do robô')).toHaveCount(0);
  await expect(page.getByLabel('Senha Digisac')).toBeVisible();
  await page.getByLabel('Usuário Digisac').fill('operator@example.test');
  await page.getByLabel('Senha Digisac').fill('TEST_PASSWORD_ONLY');
  await page
    .getByRole('button', { name: 'Conectar à Digisac', exact: true })
    .click();
  await page.getByRole('button', { name: 'Continuar rascunho salvo' }).click();
  await openNavigation(page);
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Expirado - preservar roteiro',
  );
  await page.getByLabel('Nome do robô').fill('Incerto - conferir plataforma');
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  await page
    .getByRole('button', { name: 'Enviar robô para esta conta' })
    .click();
  await expect(
    page.getByRole('status', { name: 'Resultado do envio' }),
  ).toContainText('Não foi possível confirmar o envio');
  await expect(
    page.getByRole('button', { name: 'Confira o envio na plataforma' }),
  ).toBeDisabled();
  await page.getByLabel('Nome do robô').fill('Incerto - edição preservada');
  await expect(
    page.getByRole('button', { name: 'Baixar prévia técnica' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Confira o envio na plataforma' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Conecte sua Digisac.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem(
        'bot-analyser:draft:11111111-1111-4111-8111-111111111111',
      ),
    ),
  ).toContain('Incerto - edição preservada');
  await expect(
    page.getByRole('heading', { name: 'Digisac conectada' }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('name conflicts and other rejections stay visible beside sending and allow a corrected attempt', async ({
  page,
}, info) => {
  let sends = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/bots') sends++;
  });
  await page.goto(
    `http://127.0.0.1:${info.project.name === 'mobile' ? 3003 : 3002}`,
  );
  await openNavigation(page);
  await page
    .getByLabel('URL da instância')
    .fill('https://demo-publico.digisac.chat');
  await page.getByLabel('Usuário Digisac').fill('operator@example.test');
  await page.getByLabel('Senha Digisac').fill('TEST_PASSWORD_ONLY');
  await page
    .getByRole('button', { name: 'Conectar à Digisac', exact: true })
    .click();
  await page.getByRole('button', { name: /Montar manualmente/ }).click();
  await expect(page.getByLabel('Departamentos disponíveis')).toHaveValue(
    'live',
  );
  await page.getByLabel('Nome do robô').fill('Duplicado - roteiro preservado');
  await page
    .getByRole('button', { name: 'Enviar robô para esta conta' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Já existe um robô com esse nome na plataforma.',
  );
  await expect(page.getByRole('alert')).toContainText('Altere o nome');
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Duplicado - roteiro preservado',
  );
  expect(sends).toBe(1);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `.impeccable/review/duplicate-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel('Nome do robô').fill('Recusado - outro motivo');
  await page
    .getByRole('button', { name: 'Enviar robô para esta conta' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'A Digisac recusou o robô (HTTP 422)',
  );
  await expect(page.getByRole('alert')).not.toContainText('Já existe');
  expect(sends).toBe(2);
  await page.getByLabel('Nome do robô').fill('Nome corrigido');
  await page
    .getByRole('button', { name: 'Enviar robô para esta conta' })
    .click();
  await expect(
    page.getByRole('status', { name: 'Resultado do envio' }),
  ).toContainText('A Digisac aceitou o robô');
  expect(sends).toBe(3);
});
