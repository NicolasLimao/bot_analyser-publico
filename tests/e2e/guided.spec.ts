import { test, expect } from '@playwright/test';
import { prepareEditorSession } from './editor-session.ts';
test.beforeEach(async ({ page }) => {
  await prepareEditorSession(page);
});
import { mkdir, readFile } from 'node:fs/promises';
import { completeGuidedPrompts } from './guided-helpers.ts';

test('guides one decision at a time, revisits answers, tests and exports the personalized script', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByLabel('Departamentos disponíveis').selectOption('qa');
  await page.getByRole('button', { name: 'Novo robô' }).click();
  await expect(
    page.getByRole('button', { name: /Modelo padrão/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Ver fluxo', exact: true }).click();
  await page.getByRole('button', { name: 'Seu fluxo', exact: true }).click();
  await expect(page.getByLabel('Mapa do atendimento')).toHaveCount(1);
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Preencher etapa' }).click();
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/focused-models-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await expect(page.getByRole('textbox')).toHaveCount(2);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.getByLabel('Nome da empresa', { exact: true }).fill('Acme');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await expect(
    page.getByLabel('Mensagem de Menu principal', { exact: true }),
  ).toHaveValue(/{{contact_name}}.*Acme/);
  await page.screenshot({
    path: `.impeccable/review/focused-message-${info.project.name}.png`,
    fullPage: true,
  });
  await page.keyboard.press('Tab');
  await expect(
    page.getByLabel('Mensagem de Menu principal', { exact: true }),
  ).toBeFocused();
  expect(
    await page
      .getByLabel('Mensagem de Menu principal', { exact: true })
      .evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      }),
  ).toBe(true);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveCount(3);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page
    .getByLabel('Opção 1 de Menu principal', { exact: true })
    .fill('Vendas');
  await page.screenshot({
    path: `.impeccable/review/focused-options-${info.project.name}.png`,
    fullPage: true,
  });
  await completeGuidedPrompts(page, '00000000-0000-4000-8000-000000000111');
  await expect(
    page.getByRole('heading', { name: 'Atendimento da Acme' }),
  ).toBeVisible();
  if (info.project.name === 'desktop')
    await expect(page.getByLabel('Mapa do atendimento')).toBeVisible();
  else await expect(page.getByLabel('Mapa do atendimento')).not.toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Simulação da conversa' }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `.impeccable/review/focused-review-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByText('Revisar minhas respostas', { exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Editar Menu principal · opções',
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel('Opção 1 de Menu principal', { exact: true }),
  ).toHaveValue('Vendas');
  await page
    .getByRole('button', { name: 'Voltar à revisão', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tudo pronto para testar?' }),
  ).toBeVisible();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Ver fluxo', exact: true }).click();
  await expect(page.getByLabel('Mapa do atendimento')).toContainText(
    'Se escolher 1 · Vendas',
  );
  if (info.project.name === 'mobile')
    await page
      .getByRole('button', { name: 'Preencher etapa', exact: true })
      .click();
  await page
    .getByRole('button', { name: 'Testar conversa', exact: true })
    .click();
  await expect(page.getByLabel('Mapa do atendimento')).toHaveCount(1);
  const chat = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await expect(chat.getByLabel('Mensagem de entrada')).not.toBeVisible();
  await chat.getByRole('button', { name: '1 Vendas', exact: true }).click();
  await chat
    .getByRole('button', { name: '0 Voltar ao início', exact: true })
    .click();
  await chat.getByRole('button', { name: '3 Financeiro', exact: true }).click();
  await expect(chat).toContainText('Encaminhamento: Comercial');
  await expect(chat).toContainText('O robô parou');
  await chat
    .getByRole('button', { name: 'Testar fluxo novamente', exact: true })
    .click();
  await expect(chat).not.toContainText('O robô parou');
  await expect(
    chat.getByRole('button', { name: '1 Vendas', exact: true }),
  ).toBeVisible();
  await chat.getByLabel('Responder como contato').fill('Resposta em edição');
  await chat
    .getByRole('button', { name: 'Testar fluxo novamente', exact: true })
    .click();
  await expect(chat.getByLabel('Responder como contato')).toHaveValue('');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `.impeccable/review/focused-chat-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Criar meu rascunho' }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu robô está montado' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gerar prévia' })).toHaveCount(
    0,
  );
  const completeFlow = page.locator('details').filter({
    has: page.locator('summary', { hasText: 'Ver fluxo completo' }),
  });
  await expect(completeFlow).not.toHaveAttribute('open', '');
  await expect(
    page.getByRole('button', { name: 'Exportar JSON do robô' }),
  ).toBeEnabled();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `.impeccable/review/completed-${info.project.name}.png`,
    fullPage: true,
  });
  await completeFlow.locator('summary').click();
  await expect(completeFlow.getByLabel('Mapa do atendimento')).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `.impeccable/review/completed-flow-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Editar atendimento', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Roteiro por caminhos' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Atendimento da Acme',
  );
  await page.getByRole('tab', { name: 'Exportar e enviar' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar JSON do robô' }).click();
  const download = await pending;
  const bot = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(bot.name).toBe('Atendimento da Acme');
  expect(JSON.stringify(bot)).toContain('Você deseja comprar ou vender?');
  expect(JSON.stringify(bot)).not.toContain('demo-sales');
});

test('preserves edits across templates and cancellation, and keeps missing destinations and storage errors recoverable', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Nome do robô').fill('Meu atendimento original');
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await page.getByLabel('Nome do robô').fill('Versão personalizada');
  await page.getByLabel('Nome da empresa').fill('Minha empresa');
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByRole('button', { name: /Atendimento direto/ }).click();
  await page.getByRole('button', { name: /Modelo padrão/ }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Versão personalizada',
  );
  await expect(page.getByLabel('Nome da empresa')).toHaveValue('Minha empresa');
  await completeGuidedPrompts(page);
  await expect(
    page.getByText('4 pendências para resolver antes de exportar ou enviar.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao roteiro atual' }).click();
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Meu atendimento original',
  );
  await expect(
    page.getByRole('button', { name: 'Novo robô', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: /Usar meu roteiro atual/ }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Cópia de Meu atendimento original',
  );
  await completeGuidedPrompts(page);
  await page
    .getByRole('button', { name: 'Testar conversa', exact: true })
    .click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Unavailable');
    };
  });
  await page.getByRole('button', { name: 'Criar meu rascunho' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível guardar o roteiro atual',
  );
});

test('live sidebar follows edits and the active destination without losing the focused prompt', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Ver fluxo', exact: true }).click();
  await page.getByRole('button', { name: 'Seu fluxo', exact: true }).click();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Preencher etapa' }).click();
  const sidebar = page.getByRole('complementary', {
    name: 'Prévia do fluxo',
    exact: true,
    includeHidden: true,
  });
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await page.getByLabel('Nome da empresa').fill('Loja Horizonte');
  await expect(sidebar).toContainText('Atendimento da Loja Horizonte');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page
    .getByLabel('Mensagem de Menu principal', { exact: true })
    .fill('Olá! Bem-vindo à Loja Horizonte.');
  await expect(sidebar.locator('[aria-current="step"]').first()).toContainText(
    'Olá! Bem-vindo à Loja Horizonte.',
  );
  await expect(
    page.getByLabel('Mensagem de Menu principal', { exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page
    .getByLabel('Opção 1 de Menu principal', { exact: true })
    .fill('Nossos produtos');
  await expect(sidebar).toContainText('Se escolher 1 · Nossos produtos');
  for (let index = 0; index < 10; index++) {
    if (
      await page
        .getByRole('combobox', { name: 'Departamento', exact: true })
        .isVisible()
    )
      break;
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  }
  const department = page.getByRole('combobox', {
    name: 'Departamento',
    exact: true,
  });
  const user = page.getByRole('combobox', {
    name: 'Atendente opcional',
    exact: true,
  });
  await expect(user).toBeDisabled();
  await department.selectOption('demo-sales');
  await expect(user.getByRole('option')).toHaveCount(2);
  await user.selectOption('demo-user-1');
  await expect(sidebar.locator('[aria-current="step"]').first()).toContainText(
    'Alex',
  );
  await department.selectOption('demo-support');
  await expect(user).toHaveValue('');
  await expect(
    user.getByRole('option', { name: 'Alex — demonstração', exact: true }),
  ).toHaveAttribute('value', 'demo-user-2');
  await user.selectOption('demo-user-2');
  await expect(sidebar.locator('[aria-current="step"]').first()).toContainText(
    'Suporte',
  );
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Ver fluxo', exact: true }).click();
    await expect(department).not.toBeVisible();
  } else {
    expect(
      await page.locator('.guided-workspace').evaluate((el) => {
        const fields = el
          .querySelector('.guided-focus')!
          .getBoundingClientRect();
        const flow = el
          .querySelector('.guided-live-flow')!
          .getBoundingClientRect();
        return flow.left >= fields.right;
      }),
    ).toBe(true);
  }
  await expect(sidebar).toBeVisible();
  expect(
    await sidebar.locator('.guided-flow-scroll').evaluate((el) => {
      const active = el
        .querySelector('[aria-current="step"]')!
        .getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return active.top >= box.top && active.bottom <= box.bottom;
    }),
  ).toBe(true);
  await page.screenshot({
    path: `.impeccable/review/sidebar-active-${info.project.name}.png`,
    fullPage: true,
  });
  if (info.project.name === 'mobile') {
    await page
      .getByRole('button', { name: 'Preencher etapa', exact: true })
      .click();
    await expect(department).toHaveValue('demo-support');
    await expect(user).toHaveValue('demo-user-2');
  } else {
    for (const width of [900, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(sidebar).toBeVisible();
      await expect(department).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Ver fluxo', exact: true }),
      ).not.toBeVisible();
      expect(
        await page.locator('.guided-workspace').evaluate((el) => {
          const fields = el
            .querySelector('.guided-focus')!
            .getBoundingClientRect();
          const preview = el
            .querySelector('.guided-live-flow')!
            .getBoundingClientRect();
          return (
            preview.left >= fields.right &&
            Math.abs(preview.top - fields.top) < 1
          );
        }),
      ).toBe(true);
      await page.getByRole('button', { name: 'Chat', exact: true }).click();
      await department.selectOption('demo-sales');
      await expect(sidebar).toContainText('Encaminhamento: Comercial');
      await expect(department).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.impeccable/review/sidebar-split-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole('button', { name: 'Seu fluxo', exact: true })
        .click();
    }
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
