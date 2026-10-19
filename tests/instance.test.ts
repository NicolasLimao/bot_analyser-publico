import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import {
  instanceCandidates,
  instanceOrigin,
  instanceSuffixes,
  InstanceResolver,
} from '../src/digisac/instance.ts';
import { DigisacClient } from '../src/digisac/client.ts';
import type { UpstreamRequest, Transport } from '../src/digisac/client.ts';
import { Connections } from '../src/digisac/connections.ts';
import { createAppServer } from '../src/server.ts';
import { fixtures } from './fixtures.ts';

const credentials = {
  origin: 'empresa-exemplo',
  username: 'operator@example.test',
  password: 'TEST_PASSWORD_ONLY',
};
const authentication = {
  status: 200,
  body: {
    access_token: 'TEST_TOKEN_ONLY',
    token_type: 'Bearer',
    expires_in: 3600,
  },
};

test('instance candidates normalize a company name and accept the five suffixes and existing complete URLs', () => {
  assert.deepEqual(instanceCandidates(' \u200BEMPRESA-EXEMPLO\uFEFF '), [
    'https://empresa-exemplo.digisac.me',
    'https://empresa-exemplo.digisac.app',
    'https://empresa-exemplo.digisac.co',
    'https://empresa-exemplo.digisac.chat',
    'https://empresa-exemplo.digisac.io',
  ]);
  for (const suffix of [...instanceSuffixes, 'digisac.com.br']) {
    assert.deepEqual(instanceCandidates(`empresa-exemplo.${suffix}`), [
      `https://empresa-exemplo.${suffix}`,
    ]);
    assert.deepEqual(
      instanceCandidates(`https://empresa-exemplo.${suffix}/api/v1/`),
      [`https://empresa-exemplo.${suffix}`],
    );
    assert.equal(
      instanceOrigin(`https://empresa-exemplo.${suffix}`),
      `https://empresa-exemplo.${suffix}`,
    );
  }
  for (const input of [
    '',
    'https://',
    'http://empresa-exemplo.digisac.io',
    'https://evil.test',
    'https://empresa-exemplo.digisac.io.evil.test',
    'https://user:secret@empresa-exemplo.digisac.io',
    'https://empresa-exemplo.digisac.io:444',
    'https://empresa-exemplo.digisac.io?token=secret',
    'https://empresa-exemplo.digisac.io/#secret',
    'https://extra.empresa-exemplo.digisac.io',
    '127.0.0.1',
    'https://[::1]',
    '-invalid',
    'invalid-',
    'a'.repeat(64),
    'a'.repeat(301),
  ])
    assert.throws(() => instanceCandidates(input), {
      code: 'INVALID_INSTANCE',
    });
});

test('name discovery checks all five pages concurrently without credentials and authenticates only at the discovered origin', async () => {
  const requests: UpstreamRequest[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client = new DigisacClient(async (input) => {
    requests.push(input);
    if (input.url.pathname === '/') {
      assert.equal(input.method, 'GET');
      assert.deepEqual(input.headers, { Accept: 'text/html' });
      assert.equal(input.body, undefined);
      assert.ok(input.timeoutMs! > 0 && input.timeoutMs! <= 6000);
      await pending;
      return {
        status: input.url.hostname === 'empresa-exemplo.digisac.io' ? 200 : 404,
        body: null,
      };
    }
    assert.equal(input.url.origin, 'https://empresa-exemplo.digisac.io');
    assert.equal(input.url.pathname, '/api/v1/oauth/token');
    return authentication;
  });
  const resolving = client.resolveInstance('empresa-exemplo');
  assert.equal(
    requests.length,
    5,
    'All five probes start before any completes',
  );
  release();
  assert.deepEqual(await resolving, {
    origins: ['https://empresa-exemplo.digisac.io'],
  });
  assert.equal(requests.length, 5);
  const access = await client.login(credentials);
  assert.equal(access.origin, 'https://empresa-exemplo.digisac.io');
  assert.deepEqual(
    requests.filter((r) => r.method === 'POST').map((r) => r.url.origin),
    ['https://empresa-exemplo.digisac.io'],
  );
});

test('complete URLs verify only that page and recent discovery is reused until its short validity expires', async () => {
  let now = 100_000;
  let available = true;
  const requests: UpstreamRequest[] = [];
  const client = new DigisacClient(
    async (input) => {
      requests.push(input);
      return input.method === 'GET'
        ? { status: available ? 200 : 404, body: null }
        : authentication;
    },
    () => now,
  );
  await client.resolveInstance('empresa-exemplo.digisac.app');
  await client.login({
    ...credentials,
    origin: 'https://empresa-exemplo.digisac.app',
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.href, 'https://empresa-exemplo.digisac.app/');
  now += 60_001;
  available = false;
  await assert.rejects(
    client.login({
      ...credentials,
      origin: 'https://empresa-exemplo.digisac.app',
    }),
    { code: 'INSTANCE_NOT_FOUND' },
  );
  assert.equal(requests.filter((r) => r.method === 'POST').length, 1);
});

test('multiple available pages require a choice and never broadcast the password across domains', async () => {
  const requests: UpstreamRequest[] = [];
  const client = new DigisacClient(async (input) => {
    requests.push(input);
    return input.method === 'GET'
      ? {
          status:
            input.url.hostname.endsWith('.me') ||
            input.url.hostname.endsWith('.chat')
              ? 200
              : 404,
          body: null,
        }
      : authentication;
  });
  await assert.rejects(client.login(credentials), {
    code: 'INSTANCE_AMBIGUOUS',
  });
  assert.equal(requests.filter((r) => r.method === 'POST').length, 0);
  await client.login({
    ...credentials,
    origin: 'https://empresa-exemplo.digisac.chat',
  });
  assert.deepEqual(
    requests.filter((r) => r.method === 'POST').map((r) => r.url.hostname),
    ['empresa-exemplo.digisac.chat'],
  );
});

test('missing, blocked, failing and invalid addresses stop authentication without exposing transport details', async () => {
  for (const failure of ['404', '410', '403', '503', 'dns', 'transport']) {
    const requests: UpstreamRequest[] = [];
    const client = new DigisacClient(async (input) => {
      requests.push(input);
      if (failure === 'dns')
        throw Object.assign(new Error('PRIVATE_DNS'), { code: 'ENOTFOUND' });
      if (failure === 'transport') throw new Error('PRIVATE_TOKEN_ONLY');
      return { status: Number(failure), body: { token: 'PRIVATE_TOKEN_ONLY' } };
    });
    await assert.rejects(client.login(credentials), (error) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes('PRIVATE'));
      assert.equal(
        (error as any).code,
        ['404', '410', 'dns'].includes(failure)
          ? 'INSTANCE_NOT_FOUND'
          : 'INSTANCE_UNAVAILABLE',
      );
      return true;
    });
    assert.equal(requests.length, 5);
    assert.ok(
      requests.every(
        (request) =>
          request.method === 'GET' &&
          !request.body &&
          !request.headers.Authorization,
      ),
    );
  }
  const never = new DigisacClient(async () => {
    throw new Error('must not run');
  });
  await assert.rejects(
    never.login({ ...credentials, origin: 'https://127.0.0.1' }),
    { code: 'INVALID_INSTANCE' },
  );
});

test('page verification follows only limited redirects inside the same HTTPS origin', async () => {
  const requests: UpstreamRequest[] = [];
  const transport: Transport = async (input) => {
    requests.push(input);
    return input.url.pathname === '/'
      ? { status: 302, body: null, location: '/login' }
      : { status: 200, body: null };
  };
  assert.deepEqual(
    await new InstanceResolver(transport).resolve('empresa-exemplo.digisac.io'),
    { origins: ['https://empresa-exemplo.digisac.io'] },
  );
  assert.deepEqual(
    requests.map((r) => r.url.pathname),
    ['/', '/login'],
  );
  for (const location of [
    'http://empresa-exemplo.digisac.io/',
    'https://other.digisac.io/',
    'https://evil.test/',
    'https://user:secret@empresa-exemplo.digisac.io/',
    '/loop',
  ]) {
    let calls = 0;
    const resolver = new InstanceResolver(async () => {
      calls++;
      return { status: 302, body: null, location };
    });
    await assert.rejects(resolver.resolve('empresa-exemplo.digisac.io'), {
      code: 'INSTANCE_UNAVAILABLE',
    });
    assert.equal(calls, location === '/loop' ? 3 : 1);
  }
});

test('resolution endpoint accepts only the address, checks origin and bounds anonymous lookups without changing sessions', async (t) => {
  let probes = 0;
  const connections = new Connections(
    new DigisacClient(async () => {
      probes++;
      return { status: 200, body: null };
    }),
  );
  const { draft, catalog } = fixtures();
  const server = createAppServer({
    initialDraft: draft,
    catalog: async () => catalog,
    connections,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const lookup = (body: unknown, origin = base) =>
    fetch(`${base}/api/connection/resolve`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await lookup({ origin: 'empresa-exemplo', password: 'MUST_NOT_SEND' }))
      .status,
    400,
  );
  assert.equal(
    (await lookup({ origin: 'empresa-exemplo' }, 'https://evil.test')).status,
    403,
  );
  assert.equal(probes, 0);
  const result = await lookup({ origin: 'empresa-exemplo.digisac.io' });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    origins: ['https://empresa-exemplo.digisac.io'],
  });
  assert.equal(result.headers.get('set-cookie'), null);
  for (let i = 0; i < 9; i++)
    await lookup({ origin: 'empresa-exemplo.digisac.io' });
  assert.equal(
    (await lookup({ origin: 'empresa-exemplo.digisac.io' })).status,
    429,
  );
  assert.equal(probes, 10);
});
