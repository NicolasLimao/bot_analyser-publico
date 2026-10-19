import { test, expect } from '@playwright/test';
import { prepareEditorSession } from './editor-session.ts';
test.beforeEach(async ({ page }) => {
  await prepareEditorSession(page);
});
import { mkdir, readFile } from 'node:fs/promises';

test('long conversations reveal each new exchange without scrolling the page', async ({
  page,
}, info) => {
  await page.goto('/');
  if (info.project.name === 'mobile')
    await page
      .getByRole('button', { name: 'Testar conversa', exact: true })
      .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  for (let i = 0; i < 5; i++) {
    await chat
      .getByRole('button', { name: '1 Comercial', exact: true })
      .click();
    await chat
      .getByRole('button', { name: '0 Voltar ao início', exact: true })
      .click();
  }
  const content = chat.locator('.chat-content');
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  const input = chat.getByRole('textbox', { name: 'Responder como contato' });
  await input.fill('1');
  const pagePosition = await page.evaluate(() => scrollY);
  await input.press('Enter');
  await expect(chat).toContainText('Escolha uma opção:');
  await expect
    .poll(() =>
      content.evaluate((el) => {
        const last =
          el.querySelector('.chat-item.bot:last-of-type') ??
          [...el.querySelectorAll('.chat-item.bot')].at(-1)!;
        return (
          last.getBoundingClientRect().top >= el.getBoundingClientRect().top &&
          last.getBoundingClientRect().top < el.getBoundingClientRect().bottom
        );
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => scrollY)).toBe(pagePosition);
  await chat
    .getByRole('button', { name: 'Simular mensagem do atendente' })
    .click();
  await expect
    .poll(() =>
      content.evaluate((el) => {
        const last = [...el.querySelectorAll('.chat-item')].at(-1)!;
        return (
          last.getBoundingClientRect().bottom <=
          el.getBoundingClientRect().bottom + 1
        );
      }),
    )
    .toBe(true);
  await mkdir('.impeccable/review', { recursive: true });
  await chat.screenshot({
    path: `.impeccable/review/paths-long-chat-${info.project.name}.png`,
    animations: 'disabled',
  });
});

test('builds menu branches inline, previews typed replies, undoes removal and exports', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByLabel('Departamentos disponíveis').selectOption('qa');
  const editor = page.getByRole('region', { name: 'Roteiro por caminhos' });
  await expect(editor).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Etapas do roteiro' }),
  ).toHaveCount(0);
  const root = editor.locator('.inline-step').first();
  await root.locator(':scope > input').fill('Etapa comercial');
  await root
    .locator(':scope > textarea')
    .fill('Olá {{contact_name}}! Você quer comprar ou vender?');
  const branches = root.locator(':scope > .inline-options > fieldset');
  await branches
    .nth(0)
    .getByRole('textbox', { name: 'Texto da opção', exact: true })
    .first()
    .fill('Comprar');
  await branches
    .nth(0)
    .locator(':scope > .branch-next > select')
    .selectOption('transfer');
  await branches
    .nth(0)
    .getByRole('combobox', { name: 'Departamento', exact: true })
    .selectOption('00000000-0000-4000-8000-000000000111');
  await expect(branches.nth(0)).toContainText('O robô termina este caminho');
  await branches
    .nth(1)
    .getByRole('textbox', { name: 'Texto da opção', exact: true })
    .first()
    .fill('Vender');
  await branches
    .nth(1)
    .locator(':scope > .branch-next > select')
    .selectOption('menu');
  const submenu = branches.nth(1).locator('.inline-step').first();
  await submenu.locator(':scope > input').fill('Etapa de venda');
  await submenu.locator(':scope > textarea').fill('O que você quer vender?');
  const suboptions = submenu.locator(':scope > .inline-options > fieldset');
  await suboptions
    .nth(0)
    .getByRole('textbox', { name: 'Texto da opção', exact: true })
    .fill('Apartamento');
  await suboptions
    .nth(1)
    .getByRole('textbox', { name: 'Texto da opção', exact: true })
    .fill('Casa');
  await branches.nth(1).locator(':scope > button').click();
  await expect(root.locator(':scope > .inline-options > fieldset')).toHaveCount(
    1,
  );
  await editor.getByRole('button', { name: 'Desfazer alteração' }).click();
  await expect(root.locator(':scope > .inline-options > fieldset')).toHaveCount(
    2,
  );
  await expect(
    editor.getByRole('textbox', { name: 'Nome da etapa', exact: true }).last(),
  ).toHaveValue('Etapa de venda');
  await root
    .locator(':scope > .inline-step-heading')
    .getByRole('button', { name: 'Testar este menu' })
    .click();
  if (info.project.name === 'mobile') {
    await expect(
      page.getByRole('complementary', { name: 'Simulação da conversa' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Montar roteiro', exact: true })
      .click();
  }
  await mkdir('.impeccable/review', { recursive: true });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `.impeccable/review/paths-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  if (info.project.name === 'mobile')
    await page
      .getByRole('button', { name: 'Testar conversa', exact: true })
      .click();
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await expect(chat).toContainText(
    'Olá Contato de teste! Você quer comprar ou vender?',
  );
  await expect(chat).toContainText('1 - Comprar');
  await chat.getByRole('textbox', { name: 'Responder como contato' }).fill('9');
  await chat
    .getByRole('button', { name: 'Enviar resposta', exact: true })
    .click();
  await expect(chat).toContainText('Resposta sem correspondência');
  await chat.getByRole('textbox', { name: 'Responder como contato' }).fill('2');
  await chat
    .getByRole('button', { name: 'Enviar resposta', exact: true })
    .click();
  await expect(chat).toContainText('O que você quer vender?');
  await chat
    .getByRole('button', { name: '1 Apartamento', exact: true })
    .click();
  await expect(chat).toContainText('O robô parou');
  await expect(
    chat.getByRole('textbox', { name: 'Responder como contato' }),
  ).toBeDisabled();
  await chat.getByRole('button', { name: 'Reiniciar simulação' }).click();
  await chat.getByRole('button', { name: '1 Comprar', exact: true }).click();
  await expect(chat).toContainText('Encaminhamento: Comercial');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `.impeccable/review/paths-chat-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Exportar JSON do robô', exact: true })
    .click();
  const download = await downloadPromise;
  const bot = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(JSON.stringify(bot)).toContain('O que você quer vender?');
  expect(JSON.stringify(bot)).toContain('00000000-0000-4000-8000-000000000111');
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Roteiro por caminhos' }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Nome da etapa', exact: true }).first(),
  ).toHaveValue('Etapa comercial');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
