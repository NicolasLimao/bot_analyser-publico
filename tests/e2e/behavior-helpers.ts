import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { BehaviorRule } from '../../web/src/behavior-model.ts';

export async function closeBehaviorRules(page: Page) {
  if (await page.locator('.behavior-wizard').isVisible())
    await page
      .getByRole('button', { name: 'Voltar ao robô', exact: true })
      .click();
}

export async function openBehaviorRule(page: Page, rule: BehaviorRule) {
  await closeBehaviorRules(page);
  await page
    .getByRole('button', { name: 'Configurar regras', exact: true })
    .click();
  for (let index = 0; index < 8; index++) {
    if (await page.locator(`[data-behavior-rule="${rule}"]`).isVisible())
      return;
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  }
  throw new Error(`Rule ${rule} was not reached`);
}

export async function setBehaviorRule(
  page: Page,
  rule: BehaviorRule,
  enabled: boolean,
) {
  await openBehaviorRule(page, rule);
  await page.getByRole('radio', { name: enabled ? /^Sim/ : /^Não/ }).check();
  await closeBehaviorRules(page);
}

export async function editGuidedRule(page: Page, label: string) {
  const summary = page.getByText('Revisar regras do atendimento', {
    exact: true,
  });
  const edit = page.getByRole('button', {
    name: `Alterar ${label}`,
    exact: true,
  });
  if (!(await edit.isVisible())) await summary.click();
  await edit.click();
  await expect(page.getByRole('radio')).toHaveCount(2);
}
