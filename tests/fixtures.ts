import { readFileSync } from 'node:fs';
import type { Catalog, Draft } from '../src/domain/types.ts';

export const now = Date.parse('2026-09-09T12:00:30Z');
export function fixtures(): { draft: Draft; catalog: Catalog } {
  return {
    draft: JSON.parse(
      readFileSync(new URL('../examples/triage.json', import.meta.url), 'utf8'),
    ),
    catalog: JSON.parse(
      readFileSync(
        new URL('../examples/catalog.simulated.json', import.meta.url),
        'utf8',
      ),
    ),
  };
}
