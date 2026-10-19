import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compilePreview } from './domain/compiler.ts';
import { isCatalog } from './domain/catalog-schema.ts';
import type { Catalog, Draft } from './domain/types.ts';
import { Connections } from './digisac/connections.ts';
import { DigisacError } from './digisac/client.ts';
import { readServerConfig } from './server-config.ts';

interface AppOptions {
  publicOrigin?: string;
  connections?: Connections;
  initialDraft: Draft;
  catalog: () => Promise<Catalog>;
  profiles?: Record<
    string,
    {
      label: string;
      initialDraft: Draft;
      catalog: () => Promise<Catalog>;
    }
  >;
}
const WEB_ROOT = fileURLToPath(new URL('../web/dist/', import.meta.url));
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function send(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}
async function readJson(request: IncomingMessage): Promise<unknown> {
  if (
    request.headers['content-type']?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  )
    throw new RequestError(415, 'Envie o roteiro como JSON.');
  const chunks: Buffer[] = [];
  let bytes = 0;
  // Drain the request rather than destroying the socket when the body is too big.
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes <= 262_144) chunks.push(chunk);
  }
  if (bytes > 262_144)
    throw new RequestError(413, 'O roteiro excede o limite de 256 KiB.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, 'O conteúdo enviado não é JSON válido.');
  }
}
export function createAppServer(options: AppOptions) {
  const connections = options.connections ?? new Connections();
  const publicOrigin = options.publicOrigin;
  const publicHost = publicOrigin ? new URL(publicOrigin).host : undefined;
  const secureCookie = publicOrigin ? '; Secure' : '';
  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host ?? '';
      if (
        publicHost
          ? host !== publicHost
          : !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)
      )
        throw new RequestError(403, 'Host de requisição não permitido.');
      const url = new URL(request.url ?? '/', `http://${host}`);
      if (['POST', 'PUT'].includes(request.method ?? '')) {
        const origin = request.headers.origin;
        if (
          request.headers['sec-fetch-site'] === 'cross-site' ||
          (origin &&
            !(
              publicOrigin
                ? [publicOrigin]
                : [
                    `http://${host}`,
                    'http://127.0.0.1:5173',
                    'http://localhost:5173',
                  ]
            ).includes(origin))
        ) {
          throw new RequestError(403, 'Origem de requisição não permitida.');
        }
      }
      const cookie = request.headers.cookie;
      if (
        url.pathname === '/api/connection/resolve' &&
        request.method === 'POST'
      ) {
        send(
          response,
          200,
          await connections.resolveInstance(await readJson(request)),
        );
        return;
      }
      if (url.pathname === '/api/company/inactivity-time') {
        if (request.method === 'GET') {
          send(
            response,
            200,
            await connections.inactivityTime(
              cookie,
              request.headers['x-connection-id'],
            ),
          );
          return;
        }
        if (request.method === 'PUT') {
          send(
            response,
            200,
            await connections.updateInactivityTime(
              cookie,
              await readJson(request),
            ),
          );
          return;
        }
      }
      if (url.pathname === '/api/connection' && request.method === 'GET') {
        const session = connections.session(cookie);
        send(response, 200, {
          connection: session ? connections.summary(session) : null,
        });
        return;
      }
      if (url.pathname === '/api/connection' && request.method === 'POST') {
        const result = await connections.login(await readJson(request), cookie);
        response.setHeader('Set-Cookie', result.cookie + secureCookie);
        send(response, 200, {
          connection: result.connection,
          catalog: result.catalog,
        });
        return;
      }
      if (url.pathname === '/api/disconnect' && request.method === 'POST') {
        await readJson(request);
        connections.logout(cookie);
        response.setHeader(
          'Set-Cookie',
          'ba_session=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0' +
            secureCookie,
        );
        send(response, 200, { connection: null });
        return;
      }
      if (url.pathname === '/api/bots' && request.method === 'POST') {
        const result = await connections.publish(
          cookie,
          await readJson(request),
        );
        send(response, 200, result);
        return;
      }
      const profileId = url.searchParams.get('profile') ?? 'demo';
      const live =
        profileId === 'live'
          ? connections.require(cookie, request.headers['x-connection-id'])
          : null;
      const profile = live
        ? {
            initialDraft: connections.initialDraft(live),
            catalog: () => connections.catalog(live),
          }
        : profileId === 'demo'
          ? options
          : Object.hasOwn(options.profiles ?? {}, profileId)
            ? options.profiles![profileId]
            : null;
      if (!profile) throw new RequestError(400, 'Catálogo local desconhecido.');
      if (
        request.method === 'GET' &&
        ['/api/bootstrap', '/api/catalog'].includes(url.pathname)
      ) {
        const catalog = await profile.catalog();
        if (!isCatalog(catalog)) throw new Error('Invalid internal catalog');
        send(
          response,
          200,
          url.pathname === '/api/bootstrap'
            ? {
                mode: profileId,
                draft: profile.initialDraft,
                catalog,
                connection: connections.session(cookie)
                  ? connections.summary(connections.session(cookie)!)
                  : null,
                profiles: [
                  { id: 'demo', label: 'Demonstração — recursos fictícios' },
                  ...Object.entries(options.profiles ?? {}).map(([id, p]) => ({
                    id,
                    label: p.label,
                  })),
                  ...(connections.session(cookie)
                    ? [
                        {
                          id: 'live',
                          label: `Digisac conectada — ${new URL(connections.session(cookie)!.origin).hostname}`,
                        },
                      ]
                    : []),
                ],
              }
            : { catalog },
        );
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/preview') {
        const draft = await readJson(request);
        const catalog = await profile.catalog();
        const result = compilePreview(draft, catalog);
        send(response, result.status === 'preview' ? 200 : 422, result);
        return;
      }
      if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
        const filename = resolve(
          WEB_ROOT,
          url.pathname === '/'
            ? 'index.html'
            : `.${decodeURIComponent(url.pathname)}`,
        );
        if (
          !filename.startsWith(`${resolve(WEB_ROOT)}${sep}`) ||
          !MIME[extname(filename)]
        )
          throw new RequestError(404, 'Arquivo não encontrado.');
        try {
          const content = await readFile(filename);
          response.writeHead(200, {
            'Content-Type': MIME[extname(filename)],
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",
          });
          response.end(content);
        } catch {
          throw new RequestError(
            404,
            'Interface não compilada. Execute npm run build.',
          );
        }
        return;
      }
      send(response, 404, { error: 'Rota não encontrada.' });
    } catch (error) {
      if (error instanceof DigisacError && error.diagnostic)
        process.stderr.write(
          `[Digisac catalog] ${JSON.stringify(error.diagnostic)}\n`,
        );
      const known =
        error instanceof RequestError || error instanceof DigisacError;
      const status = known ? error.status : 503;
      send(response, status, {
        error: known
          ? error.message
          : 'Não foi possível atualizar os dados. Preserve o rascunho e tente novamente.',
        ...(error instanceof DigisacError ? { code: error.code } : {}),
      });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

export async function startServer(env: NodeJS.ProcessEnv = process.env) {
  const { host, port, publicOrigin } = readServerConfig(env);
  if (env.NODE_ENV === 'production') {
    const { build } = await import('vite');
    await build({
      root: fileURLToPath(new URL('../web/', import.meta.url)),
      configFile: fileURLToPath(
        new URL('../web/vite.config.ts', import.meta.url),
      ),
    });
  }
  const initialDraft: Draft = JSON.parse(
    await readFile(new URL('../examples/triage.json', import.meta.url), 'utf8'),
  );
  const simulated: Catalog = JSON.parse(
    await readFile(
      new URL('../examples/catalog.simulated.json', import.meta.url),
      'utf8',
    ),
  );
  const server = createAppServer({
    publicOrigin,
    initialDraft,
    catalog: async () => ({
      ...structuredClone(simulated),
      fetchedAt: new Date().toISOString(),
    }),
    profiles: {
      qa: {
        label: 'Demonstração — departamentos fictícios',
        initialDraft: {
          ...structuredClone(initialDraft),
          id: 'triagem-qa',
          name: 'Triagem de demonstração - QA',
          accountId: '00000000-0000-4000-8000-000000000001',
          behavior: { firstMessageOnly: true, stopOnAttendantMessage: true },
          nodes: initialDraft.nodes.map((node) =>
            node.kind === 'transfer'
              ? {
                  ...node,
                  departmentId:
                    node.departmentId === 'demo-sales'
                      ? '00000000-0000-4000-8000-000000000111'
                      : '00000000-0000-4000-8000-000000000105',
                  userId: null,
                }
              : structuredClone(node),
          ),
        },
        catalog: async () => ({
          ...JSON.parse(
            await readFile(
              new URL('../examples/catalog.qa-snapshot.json', import.meta.url),
              'utf8',
            ),
          ),
          // Local load time only; the UI identifies the source as a dated snapshot.
          fetchedAt: new Date().toISOString(),
        }),
      },
    },
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    process.stderr.write(
      error.code === 'EADDRINUSE'
        ? `A porta ${port} já está em uso. Encerre o servidor anterior antes de iniciar novamente.\n`
        : `Não foi possível iniciar o servidor: ${error.message}\n`,
    );
    process.exitCode = 1;
  });
  server.listen(port, host, () =>
    process.stdout.write(
      `Criador: ${publicOrigin ?? `http://${host}:${port}`} (escutando em ${host}:${port})\n`,
    ),
  );
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await startServer();
}
