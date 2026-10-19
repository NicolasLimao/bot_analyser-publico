import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogUrl, loadCatalog } from '../src/digisac/catalog.ts';
import type { DecodedPage } from '../src/digisac/catalog.ts';

test('CAT-01: normalizes API base and preserves external pagination and include', () => {
  for (const base of [
    'https://demo.digisac.io',
    'https://demo.digisac.io/api/',
    'https://demo.digisac.io/api/v1',
  ]) {
    const url = buildCatalogUrl(base, 'users', 2);
    assert.equal(url.pathname, '/api/v1/users');
    assert.equal(url.searchParams.get('perPage'), '40');
    assert.equal(url.searchParams.get('page'), '2');
    assert.deepEqual(JSON.parse(url.searchParams.get('query')!), {
      include: [{ model: 'departments', attributes: ['id', 'name'] }],
    });
    assert.equal(
      buildCatalogUrl(base, 'departments', 1).searchParams.has('query'),
      false,
    );
  }
  for (const base of [
    'http://host',
    'https://user:secret@host',
    'https://host/unknown',
    'https://host?token=x',
  ]) {
    assert.throws(() => buildCatalogUrl(base, 'users', 1));
  }
});

test('CAT-02: loads all pages, preserving homonyms and explicit links', async () => {
  const requests: URL[] = [];
  const catalog = await loadCatalog({
    accountId: 'demo',
    baseUrl: 'https://demo.digisac.io',
    source: 'simulated',
    request: async (url) => {
      requests.push(url);
      if (url.pathname.endsWith('/departments'))
        return {
          records: [{ id: 'd', name: 'Dept', active: true }],
          hasMore: false,
        };
      const page = Number(url.searchParams.get('page'));
      return {
        records: [
          { id: `u${page}`, name: 'Alex', active: true, departmentIds: ['d'] },
        ],
        hasMore: page < 2,
      };
    },
    decode: (_resource, value) => value as DecodedPage,
    now: () => 1000,
  });
  assert.equal(catalog.complete, true);
  assert.equal(catalog.source, 'simulated');
  assert.equal(catalog.users.length, 2);
  assert.equal(requests.length, 3);
});

test('CAT-03: fails closed on a later transport error without leaking secrets', async () => {
  await assert.rejects(
    loadCatalog({
      accountId: 'demo',
      baseUrl: 'https://demo.digisac.io',
      source: 'simulated',
      request: async (url) => {
        if (url.searchParams.get('page') === '2')
          throw new Error('Bearer PRIVATE_TOKEN');
        return {
          records: [{ id: 'd', name: 'Dept', active: true }],
          hasMore: true,
        };
      },
      decode: (_resource, value) => value as DecodedPage,
    }),
    (e) =>
      e instanceof Error &&
      e.message === 'Não foi possível concluir a consulta do catálogo.',
  );
});

test('CAT-03/04: rejects malformed, repeated and endless pages', async () => {
  for (const page of [
    { records: [], hasMore: true },
    { records: [{ id: 'd', name: 'Dept', active: true }], hasMore: 'false' },
    { records: [{ id: 'd', name: 'Dept', active: true }], hasMore: true },
  ]) {
    await assert.rejects(
      loadCatalog({
        accountId: 'demo',
        baseUrl: 'https://demo.digisac.io',
        source: 'simulated',
        maxPages: 2,
        request: async () => page,
        decode: (_resource, value) => value as DecodedPage,
      }),
    );
  }
});
