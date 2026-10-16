import { createServer } from 'node:http';
import { createApp } from './app.js';
import env from './config/env.js';
import { poolEnd } from './database/pool.js';
import { startPortalUserSync } from './services/portalUserSync.js';

const app = createApp();
const server = createServer(app);
server.listen(env.port, () => {
  const users = env.portalDb ? `${env.portalDb.host} dbo.users` : `${env.database.host} dbo.users`;
  console.log(`Orbit API listening on port ${env.port}; app tables ${env.database.host}; users ${users}`);
});
startPortalUserSync();

const shutdown = async (signal: string) => {
  console.log(`${signal} received; closing database and HTTP connections.`);
  server.close(async () => {
    await poolEnd();
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
