import type { Draft, Step } from '../../src/domain/types.ts';
import { pruneBranch } from './flow-model.ts';
import { behaviorRules } from './behavior-model.ts';
import type { BehaviorRule } from './behavior-model.ts';

export type Template = 'standard' | 'direct' | 'copy';

export type GuidedStep =
  | {
      kind: 'template' | 'identity' | 'review' | 'test';
      label: string;
    }
  | { kind: 'behavior'; rule: BehaviorRule; label: string }
  | { kind: 'message' | 'department'; nodeId: string; label: string }
  | { kind: 'options'; nodeId: string; label: string };

export function guidedSteps(draft: Draft): GuidedStep[] {
  const steps: GuidedStep[] = [
    { kind: 'template', label: 'Modelo' },
    { kind: 'identity', label: 'Identificação' },
  ];
  for (const [index, node] of draft.nodes.entries()) {
    const label = node.name || `Etapa ${index + 1}`;
    if (node.kind === 'menu' || node.kind === 'message') {
      steps.push({ kind: 'message', nodeId: node.id, label });
      if (node.kind === 'menu') {
        steps.push({
          kind: 'options',
          nodeId: node.id,
          label: `${label} · opções`,
        });
      }
    } else if (node.kind === 'transfer') {
      steps.push({ kind: 'department', nodeId: node.id, label });
    }
  }
  return [
    ...steps,
    ...behaviorRules.map(
      (rule): GuidedStep => ({
        kind: 'behavior',
        rule: rule.id,
        label: rule.label,
      }),
    ),
    { kind: 'review', label: 'Revisão' },
    { kind: 'test', label: 'Teste da conversa' },
  ];
}

export function addGuidedOption(draft: Draft, menuId: string): Draft {
  const menu = draft.nodes.find((node) => node.id === menuId);
  const stop = draft.nodes.find((node) => node.kind === 'stop');
  if (
    menu?.kind !== 'menu' ||
    menu.options.length >= 20 ||
    draft.nodes.length + (stop ? 1 : 2) > 200
  )
    return draft;
  let value = 1;
  while (menu.options.some((option) => option.value === String(value))) value++;
  const target = `step-${crypto.randomUUID()}`;
  const end = stop?.id ?? `step-${crypto.randomUUID()}`;
  return {
    ...draft,
    nodes: [
      ...draft.nodes.map(
        (node): Step =>
          node.id === menuId
            ? {
                ...menu,
                options: [
                  ...menu.options,
                  {
                    id: crypto.randomUUID(),
                    value: String(value),
                    label: `Nova opção ${value}`,
                    target,
                  },
                ],
              }
            : node,
      ),
      {
        id: target,
        kind: 'transfer',
        name: `Destino da opção ${value} · ${menu.name || 'Menu'}`,
        departmentId: '',
        userId: null,
        next: end,
      },
      ...(!stop ? [{ id: end, kind: 'stop' as const }] : []),
    ],
  };
}

export function removeGuidedOption(
  draft: Draft,
  menuId: string,
  optionId: string,
): Draft {
  const menu = draft.nodes.find((node) => node.id === menuId);
  if (menu?.kind !== 'menu' || menu.options.length <= 1) return draft;
  const option = menu.options.find((item) => item.id === optionId);
  if (!option) return draft;
  let number = 1;
  const destinationNames = new Map<string, { before: string; after: string }>();
  const options = menu.options
    .filter((item) => item.id !== optionId)
    .map((item) => {
      // Keep zero (back to the main menu) and custom text replies intact.
      if (!/^[1-9]\d*$/.test(item.value)) return item;
      const value = String(number++);
      destinationNames.set(item.target, {
        before: `Destino da opção ${item.value} · ${menu.name || 'Menu'}`,
        after: `Destino da opção ${value} · ${menu.name || 'Menu'}`,
      });
      return {
        ...item,
        value,
        label:
          item.label === `Nova opção ${item.value}`
            ? `Nova opção ${value}`
            : item.label,
      };
    });
  const next = {
    ...draft,
    nodes: draft.nodes.map(
      (node): Step =>
        node.id === menuId
          ? {
              ...menu,
              options,
            }
          : destinationNames.has(node.id) &&
              node.name === destinationNames.get(node.id)!.before
            ? { ...node, name: destinationNames.get(node.id)!.after }
            : node,
    ),
  };
  return pruneBranch(draft, next, option.target);
}

// Templates contain copy and connections, never resource IDs from another account.
export function createGuidedDraft(template: Template, current: Draft): Draft {
  const base: Draft = {
    schemaVersion: 1,
    id: `robo-${crypto.randomUUID()}`,
    name: 'Atendimento da Empresa X',
    accountId: current.accountId,
    entryNodeId: 'welcome',
    behavior: { firstMessageOnly: false, stopOnAttendantMessage: true },
    nodes: [],
  };
  if (template === 'copy')
    return {
      ...structuredClone(current),
      id: base.id,
      name: `Cópia de ${current.name}`.slice(0, 200),
    };
  const end: Step = { id: 'end', kind: 'stop', name: 'Fim do robô' };
  const waiting: Step = {
    id: 'waiting',
    kind: 'message',
    name: 'Aguardar a equipe',
    text: 'Aguarde. Em breve nossa equipe continuará seu atendimento.',
    next: 'end',
  };
  const transfer = (id: string, name: string): Step => ({
    id,
    name,
    kind: 'transfer',
    departmentId: '',
    userId: null,
    next: 'waiting',
  });
  if (template === 'direct') {
    base.nodes = [
      {
        id: 'welcome',
        kind: 'message',
        name: 'Boas-vindas',
        text: 'Olá {{contact_name}}! Boas-vindas à Empresa X. Vamos encaminhar você para nossa equipe.',
        next: 'team',
      },
      transfer('team', 'Equipe de atendimento'),
      waiting,
      end,
    ];
  } else {
    base.nodes = [
      {
        id: 'welcome',
        kind: 'menu',
        name: 'Menu principal',
        message:
          'Olá {{contact_name}}! Boas-vindas à Empresa X. Como podemos ajudar?',
        options: [
          {
            id: 'commercial',
            value: '1',
            label: 'Comercial',
            target: 'commercial-menu',
          },
          {
            id: 'support',
            value: '2',
            label: 'Suporte',
            target: 'support-team',
          },
          {
            id: 'finance',
            value: '3',
            label: 'Financeiro',
            target: 'finance-team',
          },
        ],
      },
      {
        id: 'commercial-menu',
        kind: 'menu',
        name: 'Menu comercial',
        message: 'Você deseja comprar ou vender?',
        options: [
          { id: 'buy', value: '1', label: 'Comprar', target: 'buy-team' },
          { id: 'sell', value: '2', label: 'Vender', target: 'sell-team' },
          {
            id: 'back',
            value: '0',
            label: 'Voltar ao início',
            target: 'welcome',
          },
        ],
      },
      transfer('buy-team', 'Atendimento de compras'),
      transfer('sell-team', 'Atendimento de vendas'),
      transfer('support-team', 'Atendimento de suporte'),
      transfer('finance-team', 'Atendimento financeiro'),
      waiting,
      end,
    ];
  }
  return base;
}

export function replaceCompany(
  draft: Draft,
  previous: string,
  company: string,
): Draft {
  if (!previous) return draft;
  const replace = (text: string) => text.replaceAll(previous, company);
  return {
    ...draft,
    name: replace(draft.name),
    ...(draft.behavior
      ? {
          behavior: {
            ...draft.behavior,
            ...(draft.behavior.invalidReply
              ? {
                  invalidReply: {
                    ...draft.behavior.invalidReply,
                    message: replace(draft.behavior.invalidReply.message),
                  },
                }
              : {}),
            ...(draft.behavior.businessHours
              ? {
                  businessHours: {
                    ...draft.behavior.businessHours,
                    closedMessage: replace(
                      draft.behavior.businessHours.closedMessage,
                    ),
                  },
                }
              : {}),
            ...(draft.behavior.ticketInactivity
              ? {
                  ticketInactivity: {
                    ...draft.behavior.ticketInactivity,
                    message: replace(draft.behavior.ticketInactivity.message),
                  },
                }
              : {}),
            ...(draft.behavior.afterTicketClosed
              ? {
                  afterTicketClosed: {
                    ...draft.behavior.afterTicketClosed,
                    message: replace(draft.behavior.afterTicketClosed.message),
                  },
                }
              : {}),
          },
        }
      : {}),
    nodes: draft.nodes.map(
      (node): Step =>
        node.kind === 'menu'
          ? { ...node, message: replace(node.message) }
          : node.kind === 'message'
            ? { ...node, text: replace(node.text) }
            : node,
    ),
  };
}
