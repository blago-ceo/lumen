import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fstatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import './db.js';
import { registerRealtime } from './realtime.js';
import { coreRoutes } from './routes/core.js';
import { accountRoutes } from './routes/accounts.js';
import { chatRoutes } from './routes/chat.js';
import { startScheduler } from './parsers/index.js';
import { startBot } from './bot.js';
import { bootLinkedAccounts } from './lib/tgUser.js';

const app = Fastify({ logger: { level: 'warn' }, trustProxy: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 4 * 1024 * 1024 } });
await app.register(websocket);
await app.register(fstatic, { root: path.join(config.dataDir, 'uploads'), prefix: '/uploads/', decorateReply: false });

await registerRealtime(app);
await app.register(coreRoutes);
await app.register(accountRoutes);
await app.register(chatRoutes);

app.get('/api/health', async () => ({ ok: true }));

// Прод: отдаём собранный фронт (npm run build) с того же порта
if (fs.existsSync(config.webDist)) {
  await app.register(fstatic, { root: config.webDist, prefix: '/' });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api') ? reply.code(404).send({ error: 'not_found' }) : reply.sendFile('index.html'),
  );
}

await app.listen({ port: config.port, host: '::' }); // слушаем и IPv4, и IPv6
console.log(`✦ Lumen API на http://localhost:${config.port}${config.devAuth ? '  (DEV_AUTH: вход без Telegram)' : ''}`);

startScheduler();
startBot();
bootLinkedAccounts();
