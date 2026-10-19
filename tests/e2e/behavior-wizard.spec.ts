import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { prepareEditorSession } from './editor-session.ts';
import { openBehaviorRule, closeBehaviorRules } from './behavior-helpers.ts';

test.beforeEach(async ({ page }) => prepareEditorSession(page));

test('guided creation presents the same focused rules and preserves the chosen preview after them', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: /Atendimento direto/ }).click();
  const mobile = info.project.name === 'mobile';
  if (mobile)
    await page.getByRole('button', { name: 'Ver fluxo', exact: true }).click();
  await page.getByRole('button', { name: 'Seu fluxo', exact: true }).click();
  if (mobile)
    await page
      .getByRole('button', { name: 'Preencher etapa', exact: true })
      .click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  for (
    let index = 0;
    index < 10 && !(await page.locator('.behavior-question').isVisible());
    index++
  )
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.locator('.behavior-question')).toBeVisible();
  for (let index = 0; index < 8; index++) {
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByRole('radio')).toHaveCount(2);
    await expect(page.getByRole('complementary')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Ver fluxo', exact: true }),
    ).toHaveCount(0);
    const bounds = await page
      .getByRole('radio', { name: /^Sim/ })
      .boundingBox();
    expect(bounds!.width).toBe(20);
    expect(bounds!.height).toBe(20);
    if (index === 2) {
      await page.getByRole('radio', { name: /^Sim/ }).check();
      await page
        .getByLabel('Mensagem fora do horário')
        .fill('Retornaremos no próximo expediente.');
      await mkdir('.impeccable/review', { recursive: true });
      await page.screenshot({
        path: `.impeccable/review/guided-rules-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('button', {
        name: index === 7 ? 'Conferir meu fluxo' : 'Continuar',
        exact: true,
      })
      .click();
  }
  if (mobile)
    await page.getByRole('button', { name: 'Ver fluxo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Seu fluxo', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Mapa do atendimento')).toBeVisible();
});

test('rules use one question at a time, preserve answers and allow direct corrections from review', async ({
  page,
}, info) => {
  await page.goto('/');
  const overview = page.getByRole('region', {
    name: 'Regras do atendimento',
    exact: true,
  });
  await expect(overview.getByRole('radio')).toHaveCount(0);
  await expect(overview.getByRole('textbox')).toHaveCount(0);
  await overview
    .getByRole('button', { name: 'Configurar regras', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByText('Regra 1 de 8', { exact: true })).toBeVisible();
  await expect(page.getByRole('complementary')).toHaveCount(0);
  const yes = page.getByRole('radio', { name: /^Sim/ });
  const no = page.getByRole('radio', { name: /^Não/ });
  await no.focus();
  await no.press('ArrowUp');
  await expect(yes).toBeChecked();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByRole('radio')).toHaveCount(2);
  await yes.check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const message = page.getByLabel('Mensagem fora do horário');
  await expect(message).toHaveCount(0);
  await yes.check();
  await message.fill('Estamos fora do horário. Retornaremos em breve.');
  await no.check();
  await expect(message).toHaveCount(0);
  await yes.check();
  await expect(message).toHaveValue(
    'Estamos fora do horário. Retornaremos em breve.',
  );
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(yes).toBeChecked();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(message).toHaveValue(
    'Estamos fora do horário. Retornaremos em breve.',
  );
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/rules-wizard-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /tema escuro/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: `.impeccable/review/rules-wizard-dark-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /tema claro/i }).click();
  for (let index = 0; index < 5; index++) {
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('radio')).toHaveCount(2);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  }
  await page
    .getByRole('button', { name: 'Revisar regras', exact: true })
    .click();
  const review = page.getByRole('list', { name: 'Revisão das regras' });
  await expect(review.getByRole('listitem')).toHaveCount(8);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await review
    .getByRole('button', {
      name: 'Alterar Horário de atendimento',
      exact: true,
    })
    .click();
  await expect(message).toHaveValue(
    'Estamos fora do horário. Retornaremos em breve.',
  );
  await message.fill('');
  await page
    .getByRole('button', { name: 'Voltar à revisão', exact: true })
    .click();
  await expect(
    review.getByRole('listitem').filter({ hasText: 'Horário de atendimento' }),
  ).toContainText('Falta completar');
  await page
    .getByRole('button', { name: 'Concluir configuração', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Configurar regras', exact: true }),
  ).toBeFocused();
  await expect(overview).toContainText('1 regra precisa de atenção');
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await openBehaviorRule(page, 'businessHours');
  await expect(message).toHaveValue('');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('pending review opens the correct rule and returning early preserves the edited draft', async ({
  page,
}) => {
  await page.goto('/');
  await openBehaviorRule(page, 'invalidReply');
  await page.getByRole('radio', { name: /^Sim/ }).check();
  const message = page.getByLabel('Mensagem para resposta inválida', {
    exact: true,
  });
  await message.fill('');
  await closeBehaviorRules(page);
  await page
    .getByRole('button', {
      name: /Preencha a mensagem para resposta inválida/,
    })
    .click();
  await expect(
    page.locator('[data-behavior-rule="invalidReply"]'),
  ).toBeVisible();
  await message.fill('Escolha uma opção do menu.');
  await closeBehaviorRules(page);
  await openBehaviorRule(page, 'invalidReply');
  await expect(message).toHaveValue('Escolha uma opção do menu.');
  await expect(page.getByRole('radio', { name: /^Sim/ })).toBeChecked();
});
