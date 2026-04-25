import * as http from 'node:http';
import express, { type Application } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { WebSocketServer } from 'ws';

// ─── Logger ──────────────────────────────────────────────────────────────────

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// ─── Express app ─────────────────────────────────────────────────────────────

export const app: Application = express();

app.use(pinoHttp({ logger }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─── HTTP server + WebSocket server ──────────────────────────────────────────

export const server = http.createServer(app);

export const wss = new WebSocketServer({ noServer: true });

// Route WebSocket upgrades on /ws to the wss instance.
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  ws.on('error', (err) => {
    logger.error({ err }, 'WebSocket error');
  });

  ws.on('message', (data) => {
    // Echo back by default — replace with domain logic.
    ws.send(data);
  });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Azure Container App sends SIGTERM 30 s before SIGKILL.
// Drain: stop accepting → close WS server → close HTTP server → exit.

const DRAIN_TIMEOUT_MS = 25_000;

function shutdown(signal: string): void {
  logger.info({ signal }, 'Received shutdown signal — draining');

  const drainTimer = setTimeout(() => {
    logger.warn('Drain timeout reached — forcing exit');
    process.exit(1);
  }, DRAIN_TIMEOUT_MS);

  // Don't let the timer prevent Node from exiting.
  drainTimer.unref();

  wss.close(() => {
    server.close(() => {
      logger.info('Server closed — exiting cleanly');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Entry point ─────────────────────────────────────────────────────────────
// Guard with require.main so tests can import without binding a port.

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => {
    logger.info({ port }, 'Server listening');
  });
}
