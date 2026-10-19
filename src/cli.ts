import { readFileSync } from 'node:fs';
import { compilePreview } from './domain/compiler.ts';
import type { Catalog } from './domain/types.ts';

// Local demonstration only: no network, real credentials or production catalog.
const draft: unknown = JSON.parse(
  readFileSync(new URL('../examples/triage.json', import.meta.url), 'utf8'),
);
const catalog: Catalog = JSON.parse(
  readFileSync(
    new URL('../examples/catalog.simulated.json', import.meta.url),
    'utf8',
  ),
);
catalog.fetchedAt = new Date().toISOString();
const result = compilePreview(draft, catalog);
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(
    `${JSON.stringify(
      {
        status: result.status,
        importReady: result.importReady,
        source: catalog.source,
        nodes:
          result.status === 'preview' ? result.bot.flowJson.nodes.length : 0,
        edges:
          result.status === 'preview' ? result.bot.flowJson.edges.length : 0,
        diagnostics: result.diagnostics,
        warnings: result.warnings,
      },
      null,
      2,
    )}\n`,
  );
}
if (result.status === 'invalid') process.exitCode = 1;
