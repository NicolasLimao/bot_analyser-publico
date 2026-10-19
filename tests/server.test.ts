import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createAppServer } from '../src/server.ts';
import { fixtures } from './fixtures.ts';

test('API-04: profile selection uses the server catalog and rejects cross-account drafts', async (t) => {
  const { draft, catalog } = fixtures();
  const qaDraft = { ...draft, accountId: 'qa-account' };
  const server = createAppServer({
    initialDraft: draft,
    catalog: async () => ({ ...catalog, fetchedAt: new Date().toISOString() }),
    profiles: {
      qa: {
        label: 'QA local',
        initialDraft: qaDraft,
        catalog: async () => ({
          ...catalog,
          source: 'snapshot',
          accountId: 'qa-account',
          questions: undefined,
          fetchedAt: new Date().toISOString(),
        }),
      },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const bootstrap = await fetch(`${base}/api/bootstrap?profile=qa`).then((r) =>
    r.json(),
  );
  assert.equal(bootstrap.catalog.source, 'snapshot');
  assert.equal(bootstrap.draft.accountId, 'qa-account');
  assert.equal(
    (await fetch(`${base}/api/bootstrap?profile=__proto__`)).status,
    400,
  );
  const post = (body: unknown) =>
    fetch(`${base}/api/preview?profile=qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await post(draft)).status, 422);
  const result = await post(qaDraft).then((r) => r.json());
  assert.equal(result.status, 'preview');
  assert.equal(result.catalogSource, 'snapshot');
  assert.ok(result.warnings.includes('LOCAL_CATALOG_SNAPSHOT'));
});

test('API-01/02: serves demo and revalidates with server-owned catalog', async (t) => {
  const { draft, catalog } = fixtures();
  let queries = 0;
  const server = createAppServer({
    initialDraft: draft,
    catalog: async () => {
      queries++;
      return { ...catalog, fetchedAt: new Date().toISOString() };
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const bootstrap = await fetch(`${base}/api/bootstrap`).then((r) => r.json());
  assert.equal(bootstrap.mode, 'demo');
  assert.equal(bootstrap.catalog.source, 'simulated');
  const post = (
    body: string,
    headers: Record<string, string> = { 'Content-Type': 'application/json' },
  ) => fetch(`${base}/api/preview`, { method: 'POST', headers, body });
  assert.equal((await post('{')).status, 400);
  assert.equal(
    (await post('{}', { 'Content-Type': 'text/plain' })).status,
    415,
  );
  assert.equal(
    (await post(JSON.stringify({ ...draft, accountId: 'foreign' }))).status,
    422,
  );
  assert.equal((await post(JSON.stringify({ ...draft, catalog }))).status, 422);
  const result = await post(JSON.stringify(draft)).then((r) => r.json());
  assert.equal(result.status, 'preview');
  assert.equal(result.importReady, false);
  assert.ok(queries >= 4);
  assert.equal((await post(' '.repeat(262_145))).status, 413);
  assert.equal(
    (
      await post(JSON.stringify(draft), {
        'Content-Type': 'application/json',
        Origin: 'https://unrelated.example',
      })
    ).status,
    403,
  );
});

test('API-03: failed refresh returns no generated bot or internal error', async (t) => {
  const { draft } = fixtures();
  const server = createAppServer({
    initialDraft: draft,
    catalog: async () => {
      throw new Error('PRIVATE_TOKEN');
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const response = await fetch(`${base}/api/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('PRIVATE_TOKEN'));
});
