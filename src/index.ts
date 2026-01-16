import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';

import { loadConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { loadAuthFromEnv } from './core/auth.js';
import { openDb } from './infra/db.js';
import { ScrumState } from './core/state.js';
import { registerRoutes } from './api/routes.js';
import { startRepoWatcher } from './infra/watcher.js';
import type { ScrumEvent } from './core/types.js';
import type WebSocket from 'ws';

// Recent events ring buffer (efficient circular buffer)
class EventRing {
  private buffer: ScrumEvent[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(evt: ScrumEvent): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(evt);
  }

  toArray(): ScrumEvent[] {
    return [...this.buffer];
  }
}

async function main() {
  // Load auth configuration from environment (opt-in)
  loadAuthFromEnv();

  const cfg = loadConfig(process.env);
  const log = createLogger(cfg);
  const app = Fastify({
    logger: {
      level: cfg.SCRUM_LOG_LEVEL,
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        remove: true
      }
    }
  });

  // Websocket clients (shared room speakers)
  const wsClients = new Set<WebSocket>();
  const eventRing = new EventRing(500);

  function broadcast(evt: ScrumEvent) {
    eventRing.push(evt);
    for (const client of wsClients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify(evt));
      }
    }
  }

  await app.register(helmet, { global: true });
  await app.register(rateLimit, { max: cfg.SCRUM_RATE_LIMIT_RPM, timeWindow: '1 minute' });
  await app.register(websocket);

  const db = openDb(cfg);
  const state = new ScrumState(db, log);

  state.setEventListener(broadcast);

  await registerRoutes(app, state, cfg);

  // Minimal event read API for debugging
  app.get('/api/events', async () => ({ ok: true, data: eventRing.toArray() }));

  // Websocket endpoint
  app.get('/ws', { websocket: true }, (socket) => {
    wsClients.add(socket);
    socket.send(JSON.stringify({ type: 'scrum.hello', ts: Date.now() }));

    socket.on('close', () => {
      wsClients.delete(socket);
    });
  });

  // Watch repo changes and broadcast them
  const watcher = startRepoWatcher(cfg.SCRUM_REPO_ROOT, log, broadcast);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down...');
    await watcher.close();
    await app.close();
    db.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  app.addHook('onClose', async () => {
    db.close();
  });

  const addr = await app.listen({ port: cfg.SCRUM_PORT, host: cfg.SCRUM_BIND });
  log.info({ addr }, 'SCRUM listening');
}

main().catch((err) => {
  console.error('Failed to start SCRUM:', err);
  process.exit(1);
});
