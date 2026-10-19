import { startServer } from './server.ts';

await startServer({ ...process.env, NODE_ENV: 'production' });
