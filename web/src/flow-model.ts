import type { Draft, Step } from '../../src/domain/types.ts';

export type Branch = { owner: string; option?: string } | null;

export function returnToEntryIssue(
  draft: Draft,
  menuId: string,
): string | null {
  const menu = draft.nodes.find((n) => n.id === menuId);
  const entry = draft.nodes.find((n) => n.id === draft.entryNodeId);
  if (menu?.kind !== 'menu') return 'Selecione um menu.';
  if (entry?.kind !== 'menu')
    return 'O início do roteiro precisa ser um menu para usar este atalho.';
  if (menu.id === entry.id) return 'Este já é o menu inicial.';
  if (menu.options.some((o) => o.value === '0'))
    return 'A resposta 0 já está em uso neste menu. Revise seu destino nas opções.';
  if (menu.options.length >= 20)
    return 'O menu já tem 20 opções. Remova uma opção para adicionar o retorno.';
  return null;
}

export function addReturnToEntry(draft: Draft, menuId: string): Draft {
  if (returnToEntryIssue(draft, menuId)) return draft;
  return {
    ...draft,
    nodes: draft.nodes.map((node) =>
      node.id === menuId && node.kind === 'menu'
        ? {
            ...node,
            options: [
              ...node.options,
              {
                id: `option-${crypto.randomUUID()}`,
                value: '0',
                label: 'Voltar ao menu inicial',
                target: draft.entryNodeId,
              },
            ],
          }
        : node,
    ),
  };
}
export function targets(node: Step): string[] {
  return node.kind === 'menu'
    ? node.options.map((o) => o.target)
    : node.kind === 'stop'
      ? []
      : [node.next];
}
function reachable(draft: Draft, start: string): Set<string> {
  const seen = new Set<string>();
  const pending = [start];
  const nodes = new Map(draft.nodes.map((n) => [n.id, n]));
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.get(id);
    if (node) pending.push(...targets(node));
  }
  return seen;
}
export function branchTarget(draft: Draft, branch: Branch): string {
  if (!branch) return draft.entryNodeId;
  const owner = draft.nodes.find((n) => n.id === branch.owner);
  if (!owner) return '';
  if (owner.kind === 'menu')
    return owner.options.find((o) => o.id === branch.option)?.target ?? '';
  return owner.kind === 'stop' ? '' : owner.next;
}
// Remove only the displaced subtree, preserving shared destinations and pre-existing unrelated steps.
export function pruneBranch(
  before: Draft,
  after: Draft,
  oldTarget: string,
): Draft {
  const candidates = reachable(before, oldTarget);
  const retained = reachable(after, after.entryNodeId);
  // Unrelated roots may also reference the old subtree (advanced/incomplete drafts).
  for (const node of before.nodes) {
    if (!candidates.has(node.id)) {
      const current = after.nodes.find((n) => n.id === node.id);
      if (current)
        for (const target of targets(current)) {
          for (const id of reachable(after, target)) retained.add(id);
        }
    }
  }
  return {
    ...after,
    nodes: after.nodes.filter(
      (n) => !candidates.has(n.id) || retained.has(n.id),
    ),
  };
}
export function changeBranch(
  draft: Draft,
  branch: Branch,
  choice: string,
  id = () => `step-${crypto.randomUUID()}`,
): Draft {
  const oldTarget = branchTarget(draft, branch);
  let nodes = [...draft.nodes];
  let target = choice.startsWith('existing:') ? choice.slice(9) : '';
  if (target && !nodes.some((n) => n.id === target)) return draft;
  if (!target) {
    if (!['menu', 'message', 'transfer', 'stop'].includes(choice)) return draft;
    let stop = nodes.find((n) => n.kind === 'stop')?.id;
    if (!stop) {
      stop = id();
      nodes.push({ id: stop, kind: 'stop' });
    }
    target = choice === 'stop' ? stop : id();
    if (choice === 'menu')
      nodes.push({
        id: target,
        kind: 'menu',
        name: 'Novo menu',
        message: 'Como podemos ajudar? Escolha uma das opções abaixo.',
        options: [
          { id: id(), value: '1', label: 'Conhecer os serviços', target: stop },
          { id: id(), value: '2', label: 'Falar com a equipe', target: stop },
        ],
      });
    if (choice === 'message')
      nodes.push({
        id: target,
        kind: 'message',
        name: 'Mensagem de atendimento',
        text: 'Agradecemos seu contato! Em breve nossa equipe continuará o atendimento.',
        next: stop,
      });
    if (choice === 'transfer')
      nodes.push({
        id: target,
        kind: 'transfer',
        departmentId: '',
        userId: null,
        next: stop,
      });
  }
  const next: Draft = {
    ...draft,
    nodes,
    entryNodeId: branch ? draft.entryNodeId : target,
  };
  if (branch)
    next.nodes = nodes.map((n): Step => {
      if (n.id !== branch.owner) return n;
      if (n.kind === 'menu')
        return {
          ...n,
          options: n.options.map((o) =>
            o.id === branch.option ? { ...o, target } : o,
          ),
        };
      return n.kind === 'stop' ? n : { ...n, next: target };
    });
  const pruned = pruneBranch(draft, next, oldTarget);
  return pruned.nodes.length <= 200 ? pruned : draft;
}
