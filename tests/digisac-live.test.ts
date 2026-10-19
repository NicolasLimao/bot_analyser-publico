import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import {
  DigisacClient,
  DigisacError,
  instanceOrigin,
  publicAddress,
} from '../src/digisac/client.ts';
import type { UpstreamRequest, Transport } from '../src/digisac/client.ts';
import { Connections } from '../src/digisac/connections.ts';
import { createAppServer } from '../src/server.ts';
import { fixtures } from './fixtures.ts';
import type { Draft } from '../src/domain/types.ts';

const account = '11111111-1111-4111-8111-111111111111';
const department = '22222222-2222-4222-8222-222222222222';
const botId = '33333333-3333-4333-8333-333333333333';
const credentials = {
  origin: 'https://demo-publico.digisac.chat',
  username: 'operator@example.test',
  password: 'TEST_PASSWORD_ONLY',
};
const token = 'TEST_ACCESS_TOKEN_ONLY';
const row = {
  id: department,
  accountId: account,
  name: 'Departamento de teste',
  archivedAt: null,
};
const questionId = '77777777-7777-4777-8777-777777777777';
const questionRow = {
  id: questionId,
  accountId: account,
  name: 'Avaliação de teste',
  type: 'csat',
  questionMessage: 'Dê uma nota de 1 a 5.',
  duration: 30,
  tries: 3,
  successMessage: 'Obrigado!',
  invalidMessage: 'Digite uma nota válida.',
  reasonMessage: '',
  deletedAt: null,
};
const page = (
  data: unknown[] = [row],
  currentPage = 1,
  total = data.length,
) => ({
  data,
  total,
  currentPage,
  lastPage: Math.max(1, Math.ceil(total / 40)),
  limit: 40,
  skip: (currentPage - 1) * 40,
});
const draft = (): Draft => ({
  schemaVersion: 1,
  id: 'test-bot',
  name: 'Teste de integração',
  accountId: account,
  entryNodeId: 'transfer',
  behavior: { firstMessageOnly: true, stopOnAttendantMessage: true },
  nodes: [
    {
      id: 'transfer',
      kind: 'transfer',
      departmentId: department,
      userId: null,
      next: 'stop',
    },
    { id: 'stop', kind: 'stop' },
  ],
});
function harness(now = Date.now) {
  const requests: UpstreamRequest[] = [];
  const state = {
    catalog: page(),
    catalogStatus: 200,
    users: page([]),
    usersStatus: 200,
    questions: page([questionRow]),
    questionsStatus: 200,
    botStatus: 200,
    botBody: { id: botId, private: token } as unknown,
    networkFailure: false,
  };
  const transport: Transport = async (input) => {
    requests.push(input);
    if (input.url.pathname === '/') return { status: 200, body: null };
    if (input.url.pathname.endsWith('/oauth/token'))
      return {
        status: 200,
        body: {
          access_token: token,
          token_type: 'Bearer',
          expires_in: 1209599,
          refresh_token: 'IGNORED_REFRESH_TOKEN',
        },
      };
    if (input.url.pathname.endsWith('/departments'))
      return { status: state.catalogStatus, body: state.catalog };
    if (input.url.pathname.endsWith('/users'))
      return { status: state.usersStatus, body: state.users };
    if (input.url.pathname.endsWith('/questions'))
      return { status: state.questionsStatus, body: state.questions };
    if (input.url.pathname.endsWith('/bots')) {
      if (state.networkFailure) throw new Error(token);
      return { status: state.botStatus, body: state.botBody };
    }
    throw new Error('Unexpected route');
  };
  const client = new DigisacClient(transport, now);
  const connections = new Connections(client, now);
  return { requests, state, client, connections };
}
const publishBody = (
  connectionId: string,
  requestId = crypto.randomUUID(),
) => ({ draft: draft(), connectionId, requestId });

test('LIVE-17: loads every questions page on login, retaining account configuration and excluding deleted selections', async () => {
  const questions = Array.from({ length: 41 }, (_, i) => ({
    ...questionRow,
    id: `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`,
    deletedAt: i === 0 ? '2026-09-01T00:00:00Z' : null,
  }));
  const requests: URL[] = [];
  const client = new DigisacClient(async (input) => {
    if (input.url.pathname.endsWith('/departments'))
      return { status: 200, body: page() };
    if (input.url.pathname.endsWith('/users'))
      return { status: 200, body: page([]) };
    assert.equal(input.url.pathname, '/api/v1/questions');
    assert.equal(input.headers.Authorization, `Bearer ${token}`);
    assert.equal(input.url.searchParams.has('query'), false);
    requests.push(input.url);
    const current = Number(input.url.searchParams.get('page'));
    return {
      status: 200,
      body: page(
        questions.slice((current - 1) * 40, current * 40),
        current,
        questions.length,
      ),
    };
  });
  const catalog = await client.catalog({
    origin: credentials.origin,
    token,
    expiresAt: Date.now() + 100_000,
  });
  assert.deepEqual(
    requests.map((u) => u.searchParams.get('page')),
    ['1', '2'],
  );
  assert.equal(catalog.questions?.state, 'ready');
  assert.equal(catalog.questions?.items.length, 41);
  assert.equal(catalog.questions?.items[0].active, false);
  assert.equal(
    catalog.questions?.items[1].questionMessage,
    questionRow.questionMessage,
  );
  const h = harness();
  const login = await h.connections.login(credentials);
  assert.ok(h.requests.some((r) => r.url.pathname === '/api/v1/questions'));
  assert.equal(login.catalog.questions?.items[0].id, questionId);
});

test('LIVE-18: questions failures do not block existing robots and never expose partial or foreign lists', async () => {
  for (const status of [403, 404, 429, 500]) {
    const h = harness();
    h.state.questionsStatus = status;
    const login = await h.connections.login(credentials);
    assert.deepEqual(login.catalog.questions, {
      state: 'unavailable',
      items: [],
    });
    assert.equal(
      (
        await h.connections.publish(
          login.cookie,
          publishBody(login.connection.connectionId),
        )
      ).status,
      'sent',
    );
    const withEvaluation = publishBody(login.connection.connectionId);
    withEvaluation.draft.behavior!.afterTicketClosedEvaluation = {
      enabled: true,
      questionId,
    };
    await assert.rejects(h.connections.publish(login.cookie, withEvaluation), {
      code: 'INVALID_DRAFT',
    });
  }
  for (const data of [
    [{ ...questionRow, tries: '3' }],
    [{ ...questionRow, questionMessage: null }],
    [questionRow, questionRow],
  ]) {
    const h = harness();
    h.state.questions = page(data);
    const login = await h.connections.login(credentials);
    assert.deepEqual(login.catalog.questions, {
      state: 'unavailable',
      items: [],
    });
  }
  const foreign = harness();
  foreign.state.questions = page([{ ...questionRow, accountId: botId }]);
  await assert.rejects(foreign.connections.login(credentials), {
    code: 'ACCOUNT_CHANGED',
  });
  const expired = harness();
  const login = await expired.connections.login(credentials);
  expired.state.questionsStatus = 401;
  await assert.rejects(
    expired.connections.catalog(expired.connections.require(login.cookie)),
    { code: 'SESSION_EXPIRED' },
  );
  assert.equal(expired.connections.session(login.cookie), null);
});

test('LIVE-19: revalidates the selected evaluation before POST and sends its latest configuration last', async () => {
  for (const removed of ['missing', 'deleted', 'unavailable']) {
    const h = harness();
    const login = await h.connections.login(credentials);
    const input = publishBody(login.connection.connectionId);
    input.draft.behavior!.afterTicketClosedEvaluation = {
      enabled: true,
      questionId,
    };
    if (removed === 'missing') h.state.questions = page([]);
    else if (removed === 'deleted')
      h.state.questions = page([
        { ...questionRow, deletedAt: '2026-10-09T12:00:00Z' },
      ]);
    else h.state.questionsStatus = 403;
    await assert.rejects(h.connections.publish(login.cookie, input), {
      code: 'CATALOG_CHANGED',
    });
    assert.equal(
      h.requests.filter(
        (r) => r.method === 'POST' && r.url.pathname.endsWith('/bots'),
      ).length,
      0,
    );
  }
  const h = harness();
  const login = await h.connections.login(credentials);
  const input = publishBody(login.connection.connectionId);
  input.draft.behavior!.afterTicketClosedEvaluation = {
    enabled: true,
    questionId,
  };
  input.draft.behavior!.afterTicketClosed = {
    enabled: true,
    message: 'Despedida antes da avaliação.',
  };
  h.state.questions = page([
    { ...questionRow, questionMessage: 'Pergunta atualizada.' },
  ]);
  assert.equal(
    (await h.connections.publish(login.cookie, input)).status,
    'sent',
  );
  const bot = JSON.parse(
    h.requests.find(
      (r) => r.method === 'POST' && r.url.pathname.endsWith('/bots'),
    )!.body!,
  );
  const evaluation = bot.flowJson.nodes.find(
    (n: { type: string }) => n.type === 'SEND_QUESTION_NODE',
  );
  assert.equal(
    evaluation.data.question.questionMessage,
    'Pergunta atualizada.',
  );
  assert.ok(
    !bot.flowJson.edges.some(
      (e: { source: string }) => e.source === evaluation.id,
    ),
  );
  const runtime = JSON.parse(bot.defaultContexts);
  assert.deepEqual(runtime[evaluation.id].triggers.ENTER_CONTEXT[0].actions, [
    {
      value: 'SEND_QUESTION',
      name: 'Avaliação',
      data: { question: questionId },
    },
  ]);
  assert.equal(runtime['@EVERY'].triggers.TICKET_CLOSED.length, 1);
});

test('LIVE-11: loads paginated users with explicit memberships and rejects incomplete or foreign resources', async () => {
  const users = Array.from({ length: 41 }, (_, i) => ({
    ...row,
    id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`,
    archivedAt: i === 0 ? '2026-09-01T00:00:00Z' : null,
    departments: i === 1 ? [] : [{ id: department }],
  }));
  const requested: number[] = [];
  const access = {
    origin: credentials.origin,
    token,
    expiresAt: Date.now() + 100_000,
  };
  const client = new DigisacClient(async (request) => {
    if (request.url.pathname.endsWith('/departments'))
      return { status: 200, body: page() };
    const current = Number(request.url.searchParams.get('page'));
    assert.deepEqual(JSON.parse(request.url.searchParams.get('query')!), {
      include: [{ model: 'departments', attributes: ['id', 'name'] }],
    });
    requested.push(current);
    return {
      status: 200,
      body: page(
        users.slice((current - 1) * 40, current * 40),
        current,
        users.length,
      ),
    };
  });
  const catalog = await client.catalog(access);
  assert.deepEqual(requested, [1, 2]);
  assert.equal(catalog.users.length, 41);
  assert.equal(catalog.users[0].active, false);
  assert.deepEqual(catalog.users[1].departmentIds, []);
  assert.deepEqual(catalog.users[2].departmentIds, [department]);
  for (const data of [
    [{ ...users[0], departments: undefined }],
    [{ ...users[0], departments: [{ id: 'invalid-id' }] }],
    [{ ...users[0], departments: [null] }],
    [{ ...users[0], departments: [{}] }],
    [users[0], users[0]],
  ]) {
    const h = harness();
    h.state.users = page(data);
    await assert.rejects(h.connections.login(credentials), {
      code: 'INVALID_CATALOG',
    });
  }
  const foreign = harness();
  foreign.state.users = page([{ ...users[0], accountId: botId }]);
  await assert.rejects(foreign.connections.login(credentials), {
    code: 'ACCOUNT_CHANGED',
  });
  foreign.state.users = page([
    { ...users[0], departments: [{ id: department, accountId: botId }] },
  ]);
  await assert.rejects(foreign.connections.login(credentials), {
    code: 'ACCOUNT_CHANGED',
  });
  const forbidden = harness();
  forbidden.state.usersStatus = 403;
  await assert.rejects(forbidden.connections.login(credentials), {
    code: 'FORBIDDEN',
  });
});

test('LIVE-16: keeps all users across pages with repeated or unlisted department references, without authorizing unavailable destinations', async () => {
  const users = Array.from({ length: 60 }, (_, i) => ({
    ...row,
    id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`,
    departments:
      i < 40
        ? [{ id: department }]
        : [{ id: department }, { id: department }, { id: botId }],
  }));
  const requests: UpstreamRequest[] = [];
  const client = new DigisacClient(async (request) => {
    requests.push(request);
    if (request.url.pathname === '/') return { status: 200, body: null };
    if (request.url.pathname.endsWith('/oauth/token'))
      return {
        status: 200,
        body: { access_token: token, token_type: 'Bearer', expires_in: 3600 },
      };
    if (request.url.pathname.endsWith('/departments'))
      return { status: 200, body: page() };
    if (request.url.pathname.endsWith('/users')) {
      const current = Number(request.url.searchParams.get('page'));
      return {
        status: 200,
        body: page(
          users.slice((current - 1) * 40, current * 40),
          current,
          users.length,
        ),
      };
    }
    if (request.url.pathname.endsWith('/bots'))
      return { status: 200, body: { id: botId } };
    throw new Error('Unexpected request');
  });
  const connections = new Connections(client);
  const login = await connections.login(credentials);
  assert.equal(login.catalog.users.length, 60);
  assert.deepEqual(login.catalog.users[40].departmentIds, [department, botId]);
  assert.equal(
    login.catalog.departments.some((d) => d.id === botId),
    false,
  );
  const body = publishBody(login.connection.connectionId);
  const transfer = body.draft.nodes[0];
  assert.equal(transfer.kind, 'transfer');
  if (transfer.kind !== 'transfer') return;
  transfer.userId = users[40].id;
  transfer.departmentId = botId;
  await assert.rejects(connections.publish(login.cookie, body), {
    code: 'INVALID_DRAFT',
  });
  assert.equal(
    requests.some((r) => r.url.pathname.endsWith('/bots')),
    false,
  );
  transfer.departmentId = department;
  assert.equal((await connections.publish(login.cookie, body)).status, 'sent');
  assert.equal(
    requests.filter((r) => r.url.pathname.endsWith('/bots')).length,
    1,
  );
});

test('LIVE-12: revalidates attendant membership before sending and exports the selected user', async () => {
  const user = {
    ...row,
    id: '44444444-4444-4444-8444-444444444444',
    departments: [{ id: department }],
  };
  for (const change of ['removed', 'unlinked', 'archived', 'valid']) {
    const h = harness();
    h.state.users = page([user]);
    const login = await h.connections.login(credentials);
    const body = publishBody(login.connection.connectionId);
    const transfer = body.draft.nodes[0];
    assert.equal(transfer.kind, 'transfer');
    if (transfer.kind === 'transfer') transfer.userId = user.id;
    if (change === 'removed') h.state.users = page([]);
    if (change === 'unlinked')
      h.state.users = page([{ ...user, departments: [] }]);
    if (change === 'archived')
      h.state.users = page([{ ...user, archivedAt: '2026-09-01T00:00:00Z' }]);
    if (change === 'valid') {
      assert.equal(
        (await h.connections.publish(login.cookie, body)).status,
        'sent',
      );
      assert.ok(
        h.requests
          .find((r) => r.url.pathname.endsWith('/bots'))
          ?.body?.includes(user.id),
      );
    } else {
      await assert.rejects(h.connections.publish(login.cookie, body), {
        code: 'CATALOG_CHANGED',
      });
      assert.equal(
        h.requests.some((r) => r.url.pathname.endsWith('/bots')),
        false,
      );
    }
  }
});

test('LIVE-10: explicit name conflicts propagate through the API; generic and uncertain errors remain distinct', async (t) => {
  const h = harness();
  const { draft: demo, catalog } = fixtures();
  const server = createAppServer({
    initialDraft: demo,
    catalog: async () => catalog,
    connections: h.connections,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await h.connections.login(credentials);
  const body = publishBody(login.connection.connectionId);
  for (const upstream of [
    {
      status: 422,
      body: { errors: [{ path: 'name', message: 'name must be unique' }] },
      duplicate: true,
    },
    {
      status: 409,
      body: { message: 'A bot with this name already exists' },
      duplicate: true,
    },
    {
      status: 400,
      body: { error: 'Já existe um robô com esse nome na plataforma.' },
      duplicate: true,
    },
    {
      status: 422,
      body: { errors: { name: ['has already been taken'] } },
      duplicate: true,
    },
    {
      status: 422,
      body: { errors: [{ path: 'departmentId', type: 'unique violation' }] },
      duplicate: false,
    },
    {
      status: 409,
      body: { message: 'Conflict', private: token },
      duplicate: false,
    },
    { status: 422, body: { message: 'name is required' }, duplicate: false },
    { status: 422, body: null, duplicate: false },
  ]) {
    h.state.botStatus = upstream.status;
    h.state.botBody = upstream.body;
    const response = await fetch(`${base}/api/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: login.cookie },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, upstream.duplicate ? 409 : 422);
    const error = await response.json();
    assert.equal(
      error.code,
      upstream.duplicate ? 'BOT_NAME_DUPLICATE' : 'BOT_REJECTED',
    );
    assert.equal(error.error.includes('Já existe um robô'), upstream.duplicate);
    assert.ok(!JSON.stringify(error).includes(token));
  }
  h.state.botStatus = 503;
  h.state.botBody = { message: 'name must be unique' };
  const uncertain = await h.connections.publish(login.cookie, body);
  assert.equal(uncertain.status, 'unknown');
  const count = h.requests.length;
  assert.deepEqual(await h.connections.publish(login.cookie, body), uncertain);
  assert.equal(h.requests.length, count);
});

test('LIVE-01: limits origins and rejects private, link-local, reserved and mapped addresses', () => {
  assert.equal(
    instanceOrigin(credentials.origin + '/api/v1/'),
    credentials.origin,
  );
  for (const origin of [
    'http://demo-publico.digisac.chat',
    'https://localhost',
    'https://demo-publico.digisac.chat.evil.test',
    'https://foo@demo-publico.digisac.chat',
    'https://demo-publico.digisac.chat:444',
    'https://demo-publico.digisac.chat/api/v1/bots',
    'https://demo-publico.digisac.chat?url=internal',
  ])
    assert.throws(() => instanceOrigin(origin));
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.20.0.1',
    '192.168.0.1',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
    'fe80::1',
    'not-ip',
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('1.1.1.1'), true);
  assert.equal(publicAddress('2606:4700::1111'), true);
});

test('LIVE-02: authenticates with form encoding, returns only safe metadata and expires local sessions', async () => {
  let clock = Date.now();
  const h = harness(() => clock);
  const login = await h.connections.login(credentials);
  assert.match(login.cookie, /HttpOnly; SameSite=Strict/);
  assert.ok(!JSON.stringify(login).includes(token));
  assert.ok(!JSON.stringify(login).includes(credentials.password));
  const form = new URLSearchParams(
    h.requests.find((r) => r.url.pathname.endsWith('/oauth/token'))!.body,
  );
  assert.equal(form.get('grant_type'), 'password');
  assert.equal(form.get('username'), credentials.username);
  assert.equal(form.get('password'), credentials.password);
  assert.equal(
    h.requests.find((r) => r.url.pathname.endsWith('/departments'))!.headers
      .Authorization,
    `Bearer ${token}`,
  );
  assert.equal(h.connections.require(login.cookie).accountId, account);
  clock += 28_800_001;
  assert.equal(h.connections.session(login.cookie), null);
});

test('LIVE-03: pages departments and rejects repeated pages or changing accounts', async () => {
  const rows = Array.from({ length: 41 }, (_, i) => ({
    ...row,
    id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
  }));
  const requested: number[] = [];
  const access = {
    origin: credentials.origin,
    token,
    expiresAt: Date.now() + 100_000,
  };
  const client = new DigisacClient(async (r) => {
    const current = Number(r.url.searchParams.get('page'));
    requested.push(current);
    return {
      status: 200,
      body: page(rows.slice((current - 1) * 40, current * 40), current, 41),
    };
  });
  const catalog = await client.departments(access);
  assert.equal(catalog.departments.length, 41);
  assert.deepEqual(requested, [1, 2]);
  assert.deepEqual(catalog.users, []);
  const repeated = new DigisacClient(async () => ({
    status: 200,
    body: page(rows.slice(0, 40), 1, 41),
  }));
  await assert.rejects(repeated.departments(access), {
    code: 'INVALID_CATALOG',
  });
  const foreign = new DigisacClient(async () => ({
    status: 200,
    body: page([row, { ...row, id: botId, accountId: botId }]),
  }));
  await assert.rejects(foreign.departments(access), {
    code: 'ACCOUNT_CHANGED',
  });
});

test('LIVE-04: archived and empty catalogs remain explicit; no invented account or users', async () => {
  const h = harness();
  h.state.catalog = page([{ ...row, archivedAt: '2026-09-10T12:00:00Z' }]);
  const login = await h.connections.login(credentials);
  assert.equal(login.catalog.departments[0].active, false);
  h.state.catalog = page([]);
  assert.deepEqual(
    (await h.connections.catalog(h.connections.require(login.cookie)))
      .departments,
    [],
  );
  await assert.rejects(h.connections.login(credentials), {
    code: 'EMPTY_CATALOG',
  });
});

test('LIVE-05: revalidates before sending and coalesces duplicate or concurrent requests', async () => {
  const h = harness();
  const login = await h.connections.login(credentials);
  const body = publishBody(login.connection.connectionId);
  const [a, b] = await Promise.all([
    h.connections.publish(login.cookie, body),
    h.connections.publish(login.cookie, body),
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(a, {
    status: 'sent',
    botId,
    name: 'Teste de integração',
    origin: credentials.origin,
  });
  await h.connections.publish(
    login.cookie,
    publishBody(login.connection.connectionId),
  );
  const posts = h.requests.filter((r) => r.url.pathname.endsWith('/bots'));
  assert.equal(posts.length, 1);
  const posted = JSON.parse(posts[0].body!);
  assert.equal(posted.name, 'Teste de integração');
  assert.equal(posted.bot, undefined);
  assert.equal(posted.accountId, account);
  assert.ok(
    h.requests.filter((r) => r.url.pathname.endsWith('/departments')).length >=
      2,
  );
  assert.equal(
    JSON.parse(posted.defaultContexts)[
      posted.contexts.find((c: { id: string }) => c.id.startsWith('TRANSFER_'))
        .id
    ].triggers.ENTER_CONTEXT[0].actions[0].data.department,
    department,
  );
  await assert.rejects(
    h.connections.publish(login.cookie, {
      ...body,
      draft: { ...draft(), name: 'Different' },
    }),
    { code: 'REQUEST_CHANGED' },
  );
});

test('LIVE-06: blocks stale sessions, cross-account drafts, removed departments and foreign connection IDs', async () => {
  const h = harness();
  const login = await h.connections.login(credentials);
  await assert.rejects(
    h.connections.publish(login.cookie, publishBody(botId)),
    { code: 'CONNECTION_CHANGED' },
  );
  await assert.rejects(
    h.connections.publish(login.cookie, {
      ...publishBody(login.connection.connectionId),
      draft: { ...draft(), accountId: botId },
    }),
    { code: 'INVALID_DRAFT' },
  );
  h.state.catalog = page([]);
  await assert.rejects(
    h.connections.publish(
      login.cookie,
      publishBody(login.connection.connectionId),
    ),
    { code: 'CATALOG_CHANGED' },
  );
  assert.equal(
    h.requests.filter((r) => r.url.pathname.endsWith('/bots')).length,
    0,
  );
  h.connections.logout(login.cookie);
  await assert.rejects(
    h.connections.publish(
      login.cookie,
      publishBody(login.connection.connectionId),
    ),
    { code: 'SESSION_EXPIRED' },
  );
});

test('LIVE-07: ambiguous creation is never retried, while 401 invalidates the session', async () => {
  for (const failure of ['network', '500']) {
    const h = harness();
    h.state.networkFailure = failure === 'network';
    h.state.botStatus = 500;
    const login = await h.connections.login(credentials);
    const body = publishBody(login.connection.connectionId);
    assert.equal(
      (await h.connections.publish(login.cookie, body)).status,
      'unknown',
    );
    assert.equal(
      (await h.connections.publish(login.cookie, body)).status,
      'unknown',
    );
    assert.equal(
      h.requests.filter((r) => r.url.pathname.endsWith('/bots')).length,
      1,
    );
  }
  const h = harness();
  const login = await h.connections.login(credentials);
  h.state.catalogStatus = 401;
  await assert.rejects(
    h.connections.publish(
      login.cookie,
      publishBody(login.connection.connectionId),
    ),
    { code: 'SESSION_EXPIRED' },
  );
  assert.equal(h.connections.session(login.cookie), null);
});

test('LIVE-08: API sessions are isolated, tokens stay server-side and cross-origin writes fail', async (t) => {
  const h = harness();
  const { draft: demo, catalog } = fixtures();
  const server = createAppServer({
    initialDraft: demo,
    catalog: async () => catalog,
    connections: h.connections,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const response = await fetch(`${base}/api/connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const cookie = response.headers.get('set-cookie')!;
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(!JSON.stringify(body).includes(token));
  assert.equal((await fetch(`${base}/api/bootstrap?profile=live`)).status, 401);
  const connected = await fetch(`${base}/api/bootstrap?profile=live`, {
    headers: { Cookie: cookie },
  }).then((r) => r.json());
  assert.equal(connected.catalog.source, 'digisac');
  assert.equal(connected.draft.accountId, account);
  const denied = await fetch(`${base}/api/bots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      Origin: 'https://evil.test',
    },
    body: JSON.stringify(publishBody(body.connection.connectionId)),
  });
  assert.equal(denied.status, 403);
  assert.equal(
    h.requests.filter((r) => r.url.pathname.endsWith('/bots')).length,
    0,
  );
});

test('DEPLOY: HTTPS proxy accepts the configured origin, isolates sessions and secures cookies', async (t) => {
  const h = harness();
  const { draft: demo, catalog } = fixtures();
  const publicOrigin = 'https://creator.squareweb.app';
  const server = createAppServer({
    initialDraft: demo,
    catalog: async () => catalog,
    connections: h.connections,
    publicOrigin,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    new Promise<{ status: number; cookie: string; body: string }>(
      (resolve, reject) => {
        const req = request(
          `${base}${path}`,
          {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
              Host: 'creator.squareweb.app',
              Origin: publicOrigin,
              'Content-Type': 'application/json',
              ...headers,
            },
          },
          (response) => {
            let content = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
              content += chunk;
            });
            response.on('error', reject);
            response.on('end', () =>
              resolve({
                status: response.statusCode!,
                cookie: response.headers['set-cookie']?.[0] ?? '',
                body: content,
              }),
            );
          },
        );
        req.on('error', reject);
        req.end(body === undefined ? undefined : JSON.stringify(body));
      },
    );
  assert.equal((await call('/api/bootstrap')).status, 200);
  assert.equal(
    (
      await call('/api/bootstrap', undefined, {
        Host: 'evil.test',
        'X-Forwarded-Host': 'creator.squareweb.app',
      })
    ).status,
    403,
  );
  assert.equal(
    (await call('/api/bootstrap', undefined, { Host: '127.0.0.1' })).status,
    403,
  );
  for (const Origin of [
    'https://evil.test',
    'http://creator.squareweb.app',
    'http://localhost:5173',
    'null',
  ]) {
    assert.equal(
      (await call('/api/connection', credentials, { Origin })).status,
      403,
    );
  }
  assert.equal(
    (
      await call('/api/connection', credentials, {
        'Sec-Fetch-Site': 'cross-site',
      })
    ).status,
    403,
  );
  assert.equal(h.requests.length, 0);
  const login = await call('/api/connection', credentials);
  assert.equal(login.status, 200);
  assert.match(login.cookie, /; Secure/);
  assert.match(login.cookie, /HttpOnly; SameSite=Strict/);
  assert.ok(!login.body.includes(token));
  const Cookie = login.cookie.split(';')[0];
  assert.equal((await call('/api/bootstrap?profile=live')).status, 401);
  assert.equal(
    (await call('/api/bootstrap?profile=live', undefined, { Cookie })).status,
    200,
  );
  const preview = await call('/api/preview?profile=live', draft(), { Cookie });
  assert.equal(preview.status, 200);
  const logout = await call('/api/disconnect', {}, { Cookie });
  assert.equal(logout.status, 200);
  assert.match(logout.cookie, /Max-Age=0; Secure/);
  assert.equal(
    (await call('/api/bootstrap?profile=live', undefined, { Cookie })).status,
    401,
  );
});

test('LIVE-09: auth and transport errors are sanitized and login attempts are bounded', async () => {
  const raw = new DigisacClient(async (input) => {
    if (input.url.pathname === '/') return { status: 200, body: null };
    throw new Error(credentials.password + token);
  });
  await assert.rejects(
    raw.login(credentials),
    (e: unknown) =>
      e instanceof DigisacError &&
      !e.message.includes(token) &&
      !e.message.includes(credentials.password),
  );
  const h = harness();
  for (let i = 0; i < 5; i++) await h.connections.login(credentials);
  await assert.rejects(h.connections.login(credentials), {
    code: 'RATE_LIMIT',
  });
});

test('LIVE-13: login matches Digisac input cleanup and preserves internal spaces and encoded characters', async () => {
  const h = harness();
  const login = await h.connections.login({
    ...credentials,
    username: ' \u200Boperator@example.test\uFEFF ',
    password: ' \u200BExample +&%= ç password\u200D\r\n',
  });
  const request = h.requests.find((r) =>
    r.url.pathname.endsWith('/oauth/token'),
  )!;
  const form = new URLSearchParams(request.body);
  assert.equal(form.get('username'), credentials.username);
  assert.equal(form.get('password'), 'Example +&%= ç password');
  assert.equal(login.connection.username, credentials.username);
  await assert.rejects(
    h.client.login({ ...credentials, password: ' \u200B\uFEFF ' }),
    { code: 'INVALID_CREDENTIALS' },
  );
  assert.equal(
    h.requests.filter((r) => r.url.pathname.endsWith('/oauth/token')).length,
    1,
  );
});

test('LIVE-14: configuration errors and API restrictions are not classified as credential rejection', async () => {
  for (const error of [
    'invalid_client',
    'unauthorized_client',
    'unsupported_grant_type',
    'invalid_scope',
  ]) {
    const client = new DigisacClient(async (input) =>
      input.url.pathname === '/'
        ? { status: 200, body: null }
        : {
            status: 401,
            body: { error, error_description: token + credentials.password },
          },
    );
    await assert.rejects(
      client.login(credentials),
      (reason: unknown) =>
        reason instanceof DigisacError &&
        reason.code === 'LOGIN_CONFIGURATION' &&
        !reason.message.includes(token) &&
        !reason.message.includes(credentials.password),
    );
  }
  const denied = new DigisacClient(async (input) =>
    input.url.pathname === '/'
      ? { status: 200, body: null }
      : {
          status: 403,
          body: { error: 'access_denied' },
        },
  );
  await assert.rejects(denied.login(credentials), {
    code: 'LOGIN_FORBIDDEN',
    status: 403,
  });
  const rejected = new DigisacClient(async (input) =>
    input.url.pathname === '/'
      ? { status: 200, body: null }
      : {
          status: 401,
          body: { error: 'invalid_grant' },
        },
  );
  await assert.rejects(rejected.login(credentials), {
    code: 'LOGIN_REJECTED',
    status: 401,
  });
});

test('LIVE-15: catalog diagnostics identify the incompatible field without recording upstream values', async () => {
  const h = harness();
  h.state.users = page([
    { ...row, name: token, archivedAt: undefined, departments: [] },
  ]);
  await assert.rejects(h.connections.login(credentials), (error: unknown) => {
    assert.ok(error instanceof DigisacError);
    assert.equal(error.code, 'INVALID_CATALOG');
    assert.match(error.message, /archivedAt/);
    assert.deepEqual(error.diagnostic?.record, {
      id: 'string',
      name: 'string',
      accountId: 'string',
      archivedAt: 'undefined',
      departments: 'array',
      departmentIds: 'undefined',
      isActive: 'undefined',
      active: 'undefined',
    });
    const diagnostic = JSON.stringify(error.diagnostic);
    for (const value of [token, credentials.password, account, department])
      assert.equal(diagnostic.includes(value), false);
    return true;
  });
});
