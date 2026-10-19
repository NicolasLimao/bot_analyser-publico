// Test-only server. All upstream requests are simulated; no traffic reaches Digisac.
import { randomUUID } from 'node:crypto';
import { createAppServer } from '../../src/server.ts';
import { Connections } from '../../src/digisac/connections.ts';
import { DigisacClient } from '../../src/digisac/client.ts';
import { fixtures } from '../fixtures.ts';

const { draft, catalog } = fixtures();
const tokens = new Set<string>();
// Independent synthetic accounts per test login; real company sharing is covered by the integration tests.
const accounts = new Map<string, ReturnType<typeof accountConfiguration>>();
function accountConfiguration() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Empresa de teste',
    wizardProgress: 'finished',
    defaultDepartment: {
      id: '22222222-2222-4222-8222-222222222222',
      accountId: '11111111-1111-4111-8111-111111111111',
      name: 'Departamento de teste',
    },
    settings: {
      ticketInactiveTime: 10,
      userAwayMinutesTime: 20,
      topicRequired: false,
      flags: { 'bots-v3': true },
    },
  };
}
const client = new DigisacClient(async (input) => {
  if (input.url.pathname === '/') {
    const host = input.url.hostname;
    return {
      status: [
        'demo-publico.digisac.chat',
        'empresa-exemplo.digisac.io',
        'multiple.digisac.me',
        'multiple.digisac.chat',
        'example.digisac.app',
      ].includes(host)
        ? 200
        : 404,
      body: null,
    };
  }
  if (input.url.pathname.endsWith('/oauth/token')) {
    const form = new URLSearchParams(input.body);
    if (
      !form.get('username')?.endsWith('@example.test') ||
      form.get('password') !== 'TEST_PASSWORD_ONLY'
    )
      return { status: 401, body: {} };
    const token = `FAKE_TOKEN_${randomUUID()}`;
    tokens.add(token);
    accounts.set(token, accountConfiguration());
    return {
      status: 200,
      body: { access_token: token, token_type: 'Bearer', expires_in: 3600 },
    };
  }
  const token = input.headers.Authorization?.replace(/^Bearer /, '');
  if (!tokens.has(token)) return { status: 401, body: {} };
  if (input.url.pathname === '/api/v1/me/account') {
    if (input.method === 'PUT') {
      const payload = JSON.parse(input.body!);
      const current = accounts.get(token)!;
      if (
        payload.settings.userAwayMinutesTime !==
          current.settings.userAwayMinutesTime ||
        payload.settings.flags['bots-v3'] !== true ||
        payload.id !== current.id
      )
        return { status: 422, body: {} };
      accounts.set(token, payload);
      return { status: 200, body: payload };
    }
    return { status: 200, body: structuredClone(accounts.get(token)) };
  }
  if (input.url.pathname.endsWith('/questions'))
    return {
      status: 200,
      body: {
        data: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            accountId: '11111111-1111-4111-8111-111111111111',
            name: 'Avaliação de teste',
            type: 'csat',
            questionMessage:
              'Como foi nosso atendimento? Dê uma nota de 1 a 5.',
            duration: 30,
            tries: 3,
            successMessage: 'Obrigado pela avaliação!',
            invalidMessage: 'Digite uma nota válida.',
            reasonMessage: '',
            deletedAt: null,
          },
        ],
        total: 1,
        limit: 40,
        currentPage: 1,
        lastPage: 1,
      },
    };
  if (input.url.pathname.endsWith('/users'))
    return {
      status: 200,
      body: {
        data: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            name: 'Ana de teste',
            accountId: '11111111-1111-4111-8111-111111111111',
            archivedAt: null,
            departments: [{ id: '22222222-2222-4222-8222-222222222222' }],
          },
          {
            id: '55555555-5555-4555-8555-555555555555',
            name: 'Bruno sem departamento',
            accountId: '11111111-1111-4111-8111-111111111111',
            archivedAt: null,
            departments: [],
          },
          {
            id: '66666666-6666-4666-8666-666666666666',
            name: 'Carla arquivada',
            accountId: '11111111-1111-4111-8111-111111111111',
            archivedAt: '2026-09-01T00:00:00Z',
            departments: [{ id: '22222222-2222-4222-8222-222222222222' }],
          },
        ],
        total: 3,
        limit: 40,
        currentPage: 1,
        lastPage: 1,
      },
    };
  if (input.url.pathname.endsWith('/departments'))
    return {
      status: 200,
      body: {
        data: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Departamento de teste',
            accountId: '11111111-1111-4111-8111-111111111111',
            archivedAt: null,
          },
        ],
        total: 1,
        limit: 40,
        currentPage: 1,
        lastPage: 1,
      },
    };
  if (input.url.pathname.endsWith('/bots')) {
    const bot = JSON.parse(input.body!);
    if (bot.name.startsWith('Expirado')) {
      tokens.delete(token);
      return { status: 401, body: {} };
    }
    if (bot.name.startsWith('Incerto'))
      throw new Error('Simulated connection failure after POST');
    if (bot.name.startsWith('Duplicado'))
      return {
        status: 422,
        body: { errors: [{ path: 'name', message: 'name must be unique' }] },
      };
    if (bot.name.startsWith('Recusado'))
      return { status: 422, body: { message: 'Invalid department' } };
    return { status: 200, body: { id: randomUUID(), name: bot.name } };
  }
  throw new Error('Unexpected upstream route');
});
// Device projects get independent session/login limits, as separate app instances.
for (const port of [3002, 3003, 3004, 3005, 3006, 3007]) {
  createAppServer({
    initialDraft: draft,
    catalog: async () => ({ ...catalog, fetchedAt: new Date().toISOString() }),
    connections: new Connections(client),
  }).listen(port, '127.0.0.1', () =>
    process.stdout.write(
      `Test server: simulated Digisac transport on ${port}\n`,
    ),
  );
}
