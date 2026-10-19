import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DigisacClient } from '../src/digisac/client.ts';
import type { UpstreamRequest } from '../src/digisac/client.ts';
import { Connections } from '../src/digisac/connections.ts';
import { createAppServer } from '../src/server.ts';
import { fixtures } from './fixtures.ts';

const accountId = '11111111-1111-4111-8111-111111111111';
const departmentId = '22222222-2222-4222-8222-222222222222';
const credentials = {
  origin: 'https://demo-publico.digisac.chat',
  username: 'inactivity@example.test',
  password: 'TEST_PASSWORD_ONLY',
};
const token = 'TEST_TOKEN_ONLY';
function account() {
  return {
    id: accountId,
    name: 'Empresa de teste',
    wizardProgress: 'finished',
    defaultDepartment: {
      id: departmentId,
      accountId,
      name: 'Equipe',
      updatedAt: '2026-10-14T10:00:00Z',
    },
    settings: {
      ticketInactiveTime: 10,
      userAwayMinutesTime: 20,
      topicRequired: true,
      workPlan: [{ start: '08:00', end: '18:00', weekDays: ['mon'] }],
      flags: { 'bots-v3': true, futureFlag: false },
      absence: { enabled: false },
      unknownFutureSetting: {
        private: 'PRIVATE_SETTINGS_ONLY',
        values: [0, false, null],
      },
    },
    // GET metadata must not be echoed in the PUT or returned to the browser.
    serverOnly: 'PRIVATE_METADATA_ONLY',
  };
}
function harness() {
  let now = Date.parse('2026-10-14T12:00:00Z');
  const state = {
    account: account() as unknown,
    getStatus: 200,
    putStatus: 200,
    putFailure: false,
    readFailure: false,
    loseUnrelatedSetting: false,
    beforeRead: undefined as (() => void) | undefined,
    afterPut: undefined as (() => void) | undefined,
    holdPut: undefined as Promise<void> | undefined,
  };
  const requests: UpstreamRequest[] = [];
  const client = new DigisacClient(
    async (input) => {
      requests.push(input);
      if (input.url.pathname === '/') return { status: 200, body: null };
      if (input.url.pathname.endsWith('/oauth/token'))
        return {
          status: 200,
          body: { access_token: token, token_type: 'Bearer', expires_in: 3600 },
        };
      if (input.url.pathname.endsWith('/departments'))
        return {
          status: 200,
          body: {
            data: [
              { id: departmentId, accountId, name: 'Equipe', archivedAt: null },
            ],
            total: 1,
            limit: 40,
            currentPage: 1,
            lastPage: 1,
          },
        };
      if (
        input.url.pathname.endsWith('/users') ||
        input.url.pathname.endsWith('/questions')
      )
        return {
          status: 200,
          body: { data: [], total: 0, limit: 40, currentPage: 1, lastPage: 1 },
        };
      assert.equal(input.url.pathname, '/api/v1/me/account');
      assert.equal(
        input.url.searchParams.get('include[0]'),
        'defaultDepartment',
      );
      assert.equal(input.headers.Authorization, `Bearer ${token}`);
      if (input.method === 'GET') {
        state.beforeRead?.();
        if (state.readFailure) throw new Error('PRIVATE_SETTINGS_ONLY');
        return {
          status: state.getStatus,
          body: structuredClone(state.account),
        };
      }
      assert.equal(input.method, 'PUT');
      await state.holdPut;
      if (state.putFailure) throw new Error(token);
      if (state.putStatus >= 200 && state.putStatus < 300) {
        state.account = JSON.parse(input.body!);
        if (state.loseUnrelatedSetting)
          delete (state.account as any).settings.topicRequired;
        state.afterPut?.();
      }
      return { status: state.putStatus, body: { private: token } };
    },
    () => now,
  );
  const connections = new Connections(client, () => now);
  return {
    state,
    requests,
    connections,
    advance: (ms: number) => {
      now += ms;
    },
    puts: () => requests.filter((r) => r.method === 'PUT'),
  };
}

test('account inactivity reads only the integer time and an opaque revision without exposing other settings', async () => {
  const h = harness();
  const login = await h.connections.login(credentials);
  const view = await h.connections.inactivityTime(
    login.cookie,
    login.connection.connectionId,
  );
  assert.equal(view.ticketInactiveTime, 10);
  assert.deepEqual(Object.keys(view).sort(), [
    'revision',
    'ticketInactiveTime',
  ]);
  assert.match(view.revision, /^[a-f0-9-]{36}$/);
  assert.equal(h.puts().length, 0);
  assert.ok(!JSON.stringify(view).includes('PRIVATE'));
});

test('account inactivity re-reads, preserves all settings in the observed PUT shape and confirms by GET', async () => {
  const h = harness();
  const login = await h.connections.login(credentials);
  const view = await h.connections.inactivityTime(
    login.cookie,
    login.connection.connectionId,
  );
  const updated = await h.connections.updateInactivityTime(login.cookie, {
    ...view,
    connectionId: login.connection.connectionId,
    ticketInactiveTime: 30,
  });
  assert.equal(updated.ticketInactiveTime, 30);
  assert.notEqual(updated.revision, view.revision);
  const expected = account();
  expected.settings.ticketInactiveTime = 30;
  const { serverOnly: _, ...payload } = expected;
  assert.deepEqual(JSON.parse(h.puts()[0].body!), payload);
  assert.deepEqual(
    h.requests
      .filter((r) => r.url.pathname.endsWith('/me/account'))
      .map((r) => r.method),
    ['GET', 'GET', 'PUT', 'GET'],
  );
  await assert.rejects(
    h.connections.updateInactivityTime(login.cookie, {
      ...view,
      connectionId: login.connection.connectionId,
      ticketInactiveTime: 40,
    }),
    { code: 'INACTIVITY_RELOAD_REQUIRED' },
  );
  await h.connections.updateInactivityTime(login.cookie, {
    ...updated,
    connectionId: login.connection.connectionId,
  });
  assert.equal(
    h.puts().length,
    1,
    'An unchanged value must not cause another write',
  );
});

test('account inactivity rejects changes in unrelated company settings, stale readings and forged values before PUT', async () => {
  const h = harness();
  const login = await h.connections.login(credentials);
  const view = await h.connections.inactivityTime(
    login.cookie,
    login.connection.connectionId,
  );
  (h.state.account as any).settings.flags.futureFlag = true;
  await assert.rejects(
    h.connections.updateInactivityTime(login.cookie, {
      ...view,
      connectionId: login.connection.connectionId,
      ticketInactiveTime: 30,
    }),
    { code: 'INACTIVITY_CHANGED' },
  );
  const fresh = await h.connections.inactivityTime(
    login.cookie,
    login.connection.connectionId,
  );
  for (const invalid of [0, -1, 1.5, '30', null, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      h.connections.updateInactivityTime(login.cookie, {
        ...fresh,
        connectionId: login.connection.connectionId,
        ticketInactiveTime: invalid,
      }),
      { code: 'INVALID_INACTIVITY_TIME' },
    );
  }
  await assert.rejects(
    h.connections.updateInactivityTime(login.cookie, {
      ...fresh,
      connectionId: login.connection.connectionId,
      settings: { topicRequired: false },
    }),
    { code: 'INVALID_INACTIVITY_TIME' },
  );
  h.advance(300_001);
  await assert.rejects(
    h.connections.updateInactivityTime(login.cookie, {
      ...fresh,
      connectionId: login.connection.connectionId,
      ticketInactiveTime: 30,
    }),
    { code: 'INACTIVITY_RELOAD_REQUIRED' },
  );
  assert.equal(h.puts().length, 0);
});

test('account inactivity refuses malformed and foreign responses without leaking raw configuration', async () => {
  for (const broken of [
    null,
    {},
    { ...account(), settings: {} },
    { ...account(), settings: { ticketInactiveTime: '10' } },
    { ...account(), defaultDepartment: undefined },
    { ...account(), settings: { ticketInactiveTime: -1 } },
  ]) {
    const h = harness();
    const login = await h.connections.login(credentials);
    h.state.account = broken;
    await assert.rejects(
      h.connections.inactivityTime(login.cookie, login.connection.connectionId),
      { code: 'INVALID_ACCOUNT_CONFIGURATION' },
    );
    assert.equal(h.puts().length, 0);
  }
  const h = harness();
  const login = await h.connections.login(credentials);
  (h.state.account as any).id = departmentId;
  await assert.rejects(
    h.connections.inactivityTime(login.cookie, login.connection.connectionId),
    { code: 'ACCOUNT_CHANGED' },
  );
  h.state.account = account();
  h.state.readFailure = true;
  await assert.rejects(
    h.connections.inactivityTime(login.cookie, login.connection.connectionId),
    { code: 'INACTIVITY_READ_FAILED', message: /consultar o prazo/ },
  );
});

test('account inactivity distinguishes permission denial, expiration and uncertain writes without retrying', async () => {
  for (const status of [401, 403, 429, 500]) {
    const h = harness();
    const login = await h.connections.login(credentials);
    h.state.getStatus = status;
    await assert.rejects(
      h.connections.inactivityTime(login.cookie, login.connection.connectionId),
      {
        code:
          status === 401
            ? 'SESSION_EXPIRED'
            : status === 403
              ? 'INACTIVITY_FORBIDDEN'
              : status === 429
                ? 'RATE_LIMIT'
                : 'INACTIVITY_READ_FAILED',
      },
    );
    assert.equal(h.connections.session(login.cookie) === null, status === 401);
  }
  for (const failure of [
    'transport',
    '500',
    '408',
    '403',
    '422',
    '401',
    'readback',
    'lostSetting',
  ]) {
    const h = harness();
    const login = await h.connections.login(credentials);
    const view = await h.connections.inactivityTime(
      login.cookie,
      login.connection.connectionId,
    );
    if (failure === 'transport') h.state.putFailure = true;
    else if (failure === 'readback')
      h.state.afterPut = () => {
        h.state.readFailure = true;
      };
    else if (failure === 'lostSetting') h.state.loseUnrelatedSetting = true;
    else h.state.putStatus = Number(failure);
    await assert.rejects(
      h.connections.updateInactivityTime(login.cookie, {
        ...view,
        connectionId: login.connection.connectionId,
        ticketInactiveTime: 30,
      }),
      {
        code:
          failure === '403'
            ? 'INACTIVITY_FORBIDDEN'
            : failure === '422'
              ? 'INACTIVITY_UPDATE_REJECTED'
              : failure === '401'
                ? 'SESSION_EXPIRED'
                : 'INACTIVITY_UPDATE_UNKNOWN',
      },
    );
    assert.equal(h.puts().length, 1);
    await assert.rejects(
      h.connections.updateInactivityTime(login.cookie, {
        ...view,
        connectionId: login.connection.connectionId,
        ticketInactiveTime: 30,
      }),
    );
    assert.equal(h.puts().length, 1);
  }
});

test('account inactivity serializes company writes across sessions and revalidates logout before PUT', async () => {
  const h = harness();
  const first = await h.connections.login(credentials);
  const second = await h.connections.login(credentials);
  const one = await h.connections.inactivityTime(
    first.cookie,
    first.connection.connectionId,
  );
  const two = await h.connections.inactivityTime(
    second.cookie,
    second.connection.connectionId,
  );
  let release!: () => void;
  h.state.holdPut = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = h.connections.updateInactivityTime(first.cookie, {
    ...one,
    connectionId: first.connection.connectionId,
    ticketInactiveTime: 30,
  });
  await assert.rejects(
    h.connections.updateInactivityTime(second.cookie, {
      ...two,
      connectionId: second.connection.connectionId,
      ticketInactiveTime: 40,
    }),
    { code: 'INACTIVITY_UPDATE_BUSY' },
  );
  await assert.rejects(
    h.connections.inactivityTime(second.cookie, second.connection.connectionId),
    { code: 'INACTIVITY_UPDATE_BUSY' },
  );
  release();
  await pending;
  assert.equal(h.puts().length, 1);
  const current = await h.connections.inactivityTime(
    second.cookie,
    second.connection.connectionId,
  );
  h.state.beforeRead = () => h.connections.logout(second.cookie);
  await assert.rejects(
    h.connections.updateInactivityTime(second.cookie, {
      ...current,
      connectionId: second.connection.connectionId,
      ticketInactiveTime: 40,
    }),
    { code: 'SESSION_EXPIRED' },
  );
  assert.equal(h.puts().length, 1);
});

test('account inactivity HTTP limits the payload, requires the current session and guards PUT origins', async (t) => {
  const h = harness();
  const { draft, catalog } = fixtures();
  const server = createAppServer({
    initialDraft: draft,
    catalog: async () => catalog,
    connections: h.connections,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await h.connections.login(credentials);
  const url = `${base}/api/company/inactivity-time`;
  assert.equal(
    (
      await fetch(url, {
        headers: { 'X-Connection-Id': login.connection.connectionId },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(url, {
        headers: {
          Cookie: login.cookie,
          'X-Connection-Id': crypto.randomUUID(),
        },
      })
    ).status,
    409,
  );
  const response = await fetch(url, {
    headers: {
      Cookie: login.cookie,
      'X-Connection-Id': login.connection.connectionId,
    },
  });
  const view = await response.json();
  assert.deepEqual(Object.keys(view).sort(), [
    'revision',
    'ticketInactiveTime',
  ]);
  const update = (origin: string) =>
    fetch(url, {
      method: 'PUT',
      headers: {
        Cookie: login.cookie,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...view,
        connectionId: login.connection.connectionId,
        ticketInactiveTime: 30,
      }),
    });
  assert.equal((await update('https://foreign.example')).status, 403);
  assert.equal(h.puts().length, 0);
  const saved = await update(base);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).ticketInactiveTime, 30);
  assert.equal(h.puts().length, 1);
});
