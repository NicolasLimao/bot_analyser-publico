import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test(
  'production npm start reads .env and builds the interface before serving',
  { timeout: 30_000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'bot-analyser-start-'));
    const probe = createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    await writeFile(
      join(directory, '.env'),
      `PUBLIC_ORIGIN=https://creator.squareweb.app\nPORT=${port}\n`,
    );
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    );
    const [runtime, ...args] = manifest.scripts.start.split(' ') as string[];
    assert.equal(runtime, 'node');
    args[args.length - 1] = fileURLToPath(
      new URL(`../${args.at(-1)}`, import.meta.url),
    );
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production' };
    delete env.PUBLIC_ORIGIN;
    delete env.PORT;
    delete env.HOST;
    const child = spawn(process.execPath, args, {
      cwd: directory,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = once(child, 'close');
        child.kill();
        await stopped;
      }
      await unlink(join(directory, '.env'));
      await rmdir(directory);
    });
    let output = '';
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Startup timeout: ${output}`)),
        20_000,
      );
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Startup exited ${code}: ${output}`));
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes(`escutando em 0.0.0.0:${port}`)) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    assert.match(output, /building client environment for production/);
    const get = (path: string) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        request(
          {
            host: '127.0.0.1',
            port,
            path,
            headers: { Host: 'creator.squareweb.app' },
          },
          (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
              body += chunk;
            });
            response.on('error', reject);
            response.on('end', () =>
              resolve({ status: response.statusCode!, body }),
            );
          },
        )
          .on('error', reject)
          .end();
      });
    const html = await get('/');
    assert.equal(html.status, 200);
    const assets = [
      ...html.body.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g),
    ].map((match) => match[1]);
    assert.ok(assets.length >= 2);
    for (const asset of assets) assert.equal((await get(asset)).status, 200);
    const bootstrap = await get('/api/bootstrap');
    assert.equal(bootstrap.status, 200);
    assert.equal(JSON.parse(bootstrap.body).mode, 'demo');
  },
);
