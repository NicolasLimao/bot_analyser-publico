import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';

async function checkEntryContrast(page: Page) {
  const failures = await page.evaluate(() => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = (color: number[]) =>
      color
        .slice(0, 3)
        .map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const issues: string[] = [];
    for (const element of document.querySelectorAll(
      '.entry-shell h1, .entry-shell p, .entry-shell label, .entry-shell button, .entry-shell strong, .entry-shell span, .entry-shell summary, .entry-shell input, .entry-footer',
    )) {
      if (
        !element.getBoundingClientRect().width ||
        !element.getBoundingClientRect().height
      )
        continue;
      const input = element instanceof HTMLInputElement ? element : null;
      const text = input
        ? input.value || input.placeholder
        : [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent)
            .join('')
            .trim();
      if (!text) continue;
      const style = getComputedStyle(
        element,
        input && !input.value ? '::placeholder' : null,
      );
      let background: Element | null = element;
      let bg = [255, 255, 255];
      while (background) {
        const parsed = rgb(getComputedStyle(background).backgroundColor);
        if (parsed.length === 3 || parsed[3] === 1) {
          bg = parsed;
          break;
        }
        background = background.parentElement;
      }
      const fgL = luminance(rgb(style.color));
      const bgL = luminance(bg);
      const ratio = (Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05);
      const large =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.66 &&
          Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5))
        issues.push(`${text}: ${ratio.toFixed(2)}`);
    }
    return issues;
  });
  expect(failures).toEqual([]);
}

test('connects first, offers two creation paths and remembers the theme', async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(
    `http://127.0.0.1:${info.project.name === 'mobile' ? 3003 : 3002}`,
  );
  await expect(
    page.getByRole('heading', { name: 'Conecte sua Digisac.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Nome do robô')).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await mkdir('.impeccable/review', { recursive: true });
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await checkEntryContrast(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.impeccable/review/entry-login-${theme}-${info.project.name}.png`,
      fullPage: true,
    });
  }
  await page
    .getByLabel('URL da instância')
    .fill('https://demo-publico.digisac.chat');
  await page.getByLabel('Usuário Digisac').fill('operator@example.test');
  await page.getByLabel('Senha Digisac').fill('wrong-password');
  await page
    .getByRole('button', { name: 'Conectar à Digisac', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Senha Digisac').fill('TEST_PASSWORD_ONLY');
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(page.getByLabel('Senha Digisac')).toHaveAttribute(
    'type',
    'text',
  );
  await page
    .getByRole('button', { name: 'Conectar à Digisac', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Como você quer começar?' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Como você quer começar?' }),
  ).toBeFocused();
  await expect(page.locator('.creation-choices button')).toHaveCount(2);
  await expect(page.getByLabel('Nome do robô')).toHaveCount(0);
  for (const theme of ['dark', 'light']) {
    if (theme === 'light')
      await page.getByRole('button', { name: 'Ativar tema claro' }).click();
    await checkEntryContrast(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.impeccable/review/entry-choice-${theme}-${info.project.name}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: /Montar manualmente/ }).click();
  await expect(page.getByLabel('Nome do robô')).toHaveValue('Novo atendimento');
  await expect(page.getByLabel('Departamentos disponíveis')).toHaveValue(
    'live',
  );
  await page.getByLabel('Nome do robô').fill('Meu atendimento manual');
  await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
  await page.getByRole('tab', { name: 'Rascunho', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar rascunho', exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Meu atendimento manual',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: `.impeccable/review/entry-manual-dark-${info.project.name}.png`,
    fullPage: true,
  });
  const toggle = page.getByRole('button', { name: 'Abrir menu', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'Início', exact: true }).click();
  await page
    .getByRole('button', { name: /Criar a partir de um modelo/ })
    .click();
  await expect(
    page.getByRole('button', { name: /Modelo padrão/ }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: `.impeccable/review/entry-model-dark-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Voltar ao roteiro atual' }).click();
  await page.getByRole('button', { name: 'Continuar rascunho salvo' }).click();
  await expect(page.getByLabel('Nome do robô')).toHaveValue(
    'Meu atendimento manual',
  );
});

test('system dark theme and demonstration work without a Digisac account', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .getByRole('button', { name: 'Experimentar com dados de demonstração' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Como você quer começar?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Montar manualmente/ }).click();
  await expect(page.getByLabel('Nome do robô')).toHaveValue('Novo atendimento');
  const snapshot = await page
    .getByLabel('Departamentos disponíveis')
    .inputValue();
  expect(snapshot).toBe('demo');
});
