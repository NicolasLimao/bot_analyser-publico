import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readServerConfig } from '../src/server-config.ts';

test('deployment defaults preserve local access and support Square port 80', () => {
  assert.deepEqual(readServerConfig({}), {
    host: '127.0.0.1',
    port: 3001,
    publicOrigin: undefined,
  });
  assert.deepEqual(readServerConfig({ NODE_ENV: 'production' }), {
    host: '0.0.0.0',
    port: 80,
    publicOrigin: 'https://bot-demo.example.com',
  });
  assert.deepEqual(
    readServerConfig({
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://creator.squareweb.app/',
    }),
    {
      host: '0.0.0.0',
      port: 80,
      publicOrigin: 'https://creator.squareweb.app',
    },
  );
  assert.equal(
    readServerConfig({ PORT: '8080', HOST: '127.0.0.1' }).port,
    8080,
  );
});

test('deployment rejects malformed public origins and invalid ports', () => {
  for (const PUBLIC_ORIGIN of [
    'invalid',
    'http://creator.squareweb.app',
    'https://user:pass@example.com',
    'https://example.com/api',
    'https://example.com/?x=1',
    'https://example.com/#x',
  ]) {
    assert.throws(() => readServerConfig({ PUBLIC_ORIGIN }), /PUBLIC_ORIGIN/);
  }
  for (const PORT of ['0', '-1', '65536', '1.5', 'invalid', ''])
    assert.throws(() => readServerConfig({ PORT }), /PORT/);
});
