import { createServer } from 'node:http';
import { createApp } from './app.js';
import env from './config/env.js';
import { poolEnd } from './database/pool.js';

const app = createApp();
const server = createServer(app);
const io = env.socketIoEnabled ? undefined : undefined;
server.listen(env.port, () => console.log(`Orbit API listening on http://localhost:${env.port}`));

const shutdown = async (signal: string) => {
  console.log(`${signal} received; closing database and HTTP connections.`);
  server.close(async () => {
    await poolEnd();
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
