import type { Step } from './types.ts';
export function menuText(node: Extract<Step, { kind: 'menu' }>): string {
  return `${node.message}\n\n${node.options.map((o) => `${o.value} - ${o.label}`).join('\n')}`;
}
