import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Walk the actual prompts, leaving suggested copy intact and optionally resolving destinations.
export async function completeGuidedPrompts(page: Page, department?: string) {
  for (let step = 0; step < 400; step++) {
    if (
      await page
        .getByRole('heading', { name: 'Tudo pronto para testar?', exact: true })
        .isVisible()
    )
      return;
    const select = page.getByRole('combobox', {
      name: 'Departamento',
      exact: true,
    });
    if (department && (await select.isVisible()))
      await select.selectOption(department);
    await page
      .getByRole('button', { name: /^(Continuar|Conferir meu fluxo)$/ })
      .click();
  }
  throw new Error('Guided flow did not reach review');
}

export async function finishGuidedDraft(page: Page, department?: string) {
  await completeGuidedPrompts(page, department);
  await page
    .getByRole('button', { name: 'Testar conversa', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Experimente seu atendimento.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Criar meu rascunho' }).click();
}
