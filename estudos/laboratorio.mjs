// Execute na raiz: node estudos/laboratorio.mjs
// Usa somente arquivos locais e o compilador real; não grava nem envia dados.
import { readFileSync } from 'node:fs';
import { compilePreview } from '../src/domain/compiler.ts';

function readExample(filename) {
  return JSON.parse(
    readFileSync(new URL(`../examples/${filename}`, import.meta.url), 'utf8'),
  );
}

const draft = readExample('triage.json');
const catalog = readExample('catalog.simulated.json');

// Relógio fixo para que a validade temporal não dependa do dia do estudo.
const now = Date.parse('2026-09-22T12:00:00Z');
catalog.fetchedAt = new Date(now).toISOString();

function show(title, input, resources = catalog) {
  const result = compilePreview(input, resources, now);
  console.log(`\n${title}`);
  console.log(
    JSON.stringify(
      {
        status: result.status,
        importReady: result.importReady,
        ...(result.status === 'preview'
          ? {
              nodes: result.bot.flowJson.nodes.length,
              edges: result.bot.flowJson.edges.length,
            }
          : {}),
        diagnostics: result.diagnostics,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
  return result;
}

const original = show('1. Roteiro original: compilação válida', draft);

if (original.status === 'preview') {
  const menu = original.bot.flowJson.nodes.find((node) =>
    node.data.text?.startsWith('Olá'),
  );
  console.log('\nMensagem do menu inicial, já com as opções:');
  console.log(menu?.data.text);

  // defaultContexts é uma string JSON dentro do objeto do robô.
  const runtime = JSON.parse(original.bot.defaultContexts);
  const transfer = original.bot.flowJson.nodes.find(
    (node) => node.type === 'TRANSFER_TICKET_NODE',
  );
  if (transfer) {
    console.log('\nAções de uma transferência na representação serializada:');
    console.log(
      JSON.stringify(
        runtime[transfer.id].triggers.ENTER_CONTEXT[0].actions,
        null,
        2,
      ),
    );
  }
}

const withBehavior = structuredClone(draft);
withBehavior.behavior = {
  firstMessageOnly: true,
  stopOnAttendantMessage: true,
};
show(
  '2. Duas regras de comportamento: observe os nós adicionais',
  withBehavior,
);

const wrongAccount = structuredClone(draft);
wrongAccount.accountId = 'outra-conta';
show('3. Conta incompatível com o catálogo', wrongAccount);

const missingTarget = structuredClone(draft);
missingTarget.nodes.find((node) => node.id === 'welcome').options[0].target =
  'etapa-inexistente';
show('4. Uma opção aponta para um destino inexistente', missingTarget);

const automaticCycle = structuredClone(draft);
automaticCycle.nodes.find((node) => node.id === 'waiting').next = 'waiting';
show(
  '5. A mensagem aponta para si mesma, sem esperar resposta',
  automaticCycle,
);

const staleCatalog = structuredClone(catalog);
staleCatalog.fetchedAt = new Date(now - 6 * 60_000).toISOString();
show('6. Catálogo com seis minutos de idade', draft, staleCatalog);
