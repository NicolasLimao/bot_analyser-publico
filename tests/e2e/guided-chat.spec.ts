import { test, expect } from '@playwright/test';
import { prepareEditorSession } from './editor-session.ts';
test.beforeEach(async ({ page }) => {
  await prepareEditorSession(page);
});
import { mkdir } from 'node:fs/promises';
import type { Draft } from '../../src/domain/types.ts';
import { completeGuidedPrompts } from './guided-helpers.ts';

test('adds and removes menu options, updates the prompts and tests the new destination', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Etapa 4 de 21', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Adicionar opção', exact: true })
    .click();
  const newOption = page.getByLabel('Opção 4 de Menu principal', {
    exact: true,
  });
  await expect(newOption).toBeFocused();
  await newOption.fill('Agendamentos');
  await page
    .getByRole('button', { name: 'Adicionar opção', exact: true })
    .click();
  await expect(page.getByRole('textbox')).toHaveCount(5);
  await page
    .getByRole('button', { name: 'Remover opção 1', exact: true })
    .click();
  await expect(
    page.getByLabel('Opção 1 de Menu principal', { exact: true }),
  ).toBeFocused();
  await expect(page.getByText('Etapa 4 de 19', { exact: true })).toBeVisible();
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/guided-options-edit-${info.project.name}.png`,
    fullPage: true,
  });
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Ver fluxo', exact: true }).click();
  const chat = page.getByRole('region', { name: 'Chat da etapa atual' });
  await expect(chat).toContainText('1 - Suporte');
  await expect(chat).toContainText('2 - Financeiro');
  await expect(chat).toContainText('3 - Agendamentos');
  await expect(chat).toContainText('4 - Nova opção 4');
  await expect(chat).not.toContainText('Comercial');
  await page.screenshot({
    path: `.impeccable/review/guided-options-preview-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Seu fluxo', exact: true }).click();
  await expect(page.getByLabel('Mapa do atendimento')).toContainText(
    'Se escolher 3 · Agendamentos',
  );
  await expect(page.getByLabel('Mapa do atendimento')).not.toContainText(
    'Menu comercial',
  );
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Preencher etapa' }).click();
  await page
    .getByRole('button', { name: 'Remover opção 4', exact: true })
    .click();
  await expect(page.getByText('Etapa 4 de 18', { exact: true })).toBeVisible();
  await completeGuidedPrompts(page, 'demo-support');
  await expect(
    page.getByText('Roteiro conectado e pronto para testar.', { exact: true }),
  ).toBeVisible();
  await page.getByText('Revisar minhas respostas', { exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Editar Menu principal · opções',
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel('Opção 3 de Menu principal', { exact: true }),
  ).toHaveValue('Agendamentos');
  await page
    .getByRole('button', { name: 'Remover opção 1', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Remover opção 1', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Remover opção 1', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Voltar à revisão', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Testar conversa', exact: true })
    .click();
  const simulation = page.getByRole('complementary', {
    name: 'Simulação da conversa',
  });
  await simulation
    .getByRole('button', { name: '1 Agendamentos', exact: true })
    .click();
  await expect(simulation).toContainText('Encaminhamento: Suporte');
  await expect(simulation).toContainText('O robô parou');
  await page.getByRole('button', { name: 'Criar meu rascunho' }).click();
  await expect(
    page.getByRole('heading', { name: 'Seu robô está montado' }),
  ).toBeVisible();
});

test('stage chat follows live edits, full menus and destinations while preserving the selected view', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  const mobile = info.project.name === 'mobile';
  if (!mobile) await page.setViewportSize({ width: 900, height: 900 });
  async function preview() {
    if (mobile)
      await page
        .getByRole('button', { name: 'Ver fluxo', exact: true })
        .click();
  }
  async function edit() {
    if (mobile)
      await page.getByRole('button', { name: 'Preencher etapa' }).click();
  }
  await preview();
  await expect(
    page.getByRole('button', { name: 'Chat', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page
      .getByRole('group', { name: 'Tipo de prévia' })
      .getByRole('button')
      .first(),
  ).toHaveText('Chat');
  const chat = page.getByRole('region', {
    name: 'Chat da etapa atual',
    includeHidden: true,
  });
  await expect(chat).toContainText('Olá Contato de teste!');
  await expect(chat).toContainText('1 - Comercial');
  await expect(chat).toContainText('2 - Suporte');
  await expect(chat).toContainText('3 - Financeiro');
  await edit();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await page.getByLabel('Nome da empresa').fill('Loja Horizonte');
  await expect(chat).toContainText('Loja Horizonte');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const message = page.getByLabel('Mensagem de Menu principal', {
    exact: true,
  });
  await message.fill('Olá {{contact_name}}! Como podemos ajudar?');
  await expect(chat).toContainText(
    'Olá Contato de teste! Como podemos ajudar?',
  );
  await expect(message).toBeFocused();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const option = page.getByLabel('Opção 1 de Menu principal', { exact: true });
  await option.fill('Nossos produtos');
  await expect(chat).toContainText('1 - Nossos produtos');
  await expect(option).toBeFocused();
  await preview();
  await expect(
    page.getByRole('button', { name: 'Chat', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => scrollTo(0, 0));
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: `.impeccable/review/guided-stage-chat-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Seu fluxo', exact: true }).click();
  await expect(page.getByLabel('Mapa do atendimento')).toContainText(
    'Nossos produtos',
  );
  await page.getByRole('button', { name: 'Chat', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(chat).toBeVisible();
  await edit();
  await expect(option).toHaveValue('Nossos produtos');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(chat).toContainText('Você deseja comprar ou vender?');
  await expect(chat).toContainText('0 - Voltar ao início');
  await expect(chat).not.toContainText('Nossos produtos');
  await page.getByLabel('Mensagem de Menu comercial', { exact: true }).fill('');
  await expect(chat).toContainText('1 - Comprar');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(chat).toContainText('escolha um departamento');
  await page
    .getByLabel('Departamento', { exact: true })
    .selectOption('demo-support');
  await expect(chat).toContainText('Encaminhamento: Suporte');
});

test('copied menus show all editable options and the complete chat', async ({
  page,
}, info) => {
  await page.route('**/api/bootstrap?*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const draft: Draft = data.draft;
    const menu = draft.nodes.find((node) => node.id === draft.entryNodeId);
    if (menu?.kind !== 'menu') throw new Error('Expected a menu fixture');
    menu.options = Array.from({ length: 7 }, (_, index) => ({
      id: `choice-${index}`,
      value: String(index + 1),
      label: `Serviço ${index + 1}`,
      target: menu.options[0].target,
    }));
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo robô', exact: true }).click();
  await page.getByRole('button', { name: /Usar meu roteiro atual/ }).click();
  await page.getByRole('button', { name: 'Personalizar este modelo' }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveCount(7);
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Ver fluxo', exact: true }).click();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  const chat = page.getByRole('region', { name: 'Chat da etapa atual' });
  for (let index = 1; index <= 7; index++)
    await expect(chat).toContainText(`${index} - Serviço ${index}`);
});
