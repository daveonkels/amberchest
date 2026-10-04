import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { privateBackup } from '@amberchest/core';
import type { AmberChestApp } from '@amberchest/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { isIngressAddress } from './addon.js';
import { AuthGuard } from './auth.js';
import { registerRoutes } from './routes.js';

export interface ServerOptions {
  app: AmberChestApp;
  auth: AuthGuard;
  /** Directory holding the built frontend; omitted during frontend dev. */
  webRoot?: string | null;
  host?: string;
  port?: number;
  /** Desktop only: hands a file to the operating system. */
  openFile?: ((path: string) => Promise<void>) | undefined;
}

export interface RunningServer {
  server: FastifyInstance;
  url: string;
  port: number;
  close: () => Promise<void>;
}

export async function createServer(options: ServerOptions): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false,
    // Do not trust client-supplied forwarding headers.
    trustProxy: false,
    // A transferred message file is the largest body this ever sees.
    bodyLimit: 128 * 1024 * 1024,
  });

  /*
   * Raw bodies, for a transfer from another instance.
   *
   * Fastify refuses a content type it has no parser for, and a message file is
   * exactly that: bytes, to be written as they are.
   */
  server.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

  /*
   * Home Assistant ingress: nothing but the supervisor may knock.
   *
   * With ingress there is no login in front of the interface, so the add-on
   * has to make sure it only answers the gateway. Turned on by the add-on when
   * no interface password was configured.
   */
  if (process.env.AMBERCHEST_INGRESS_ONLY === 'true') {
    server.addHook('onRequest', async (request, reply) => {
      // request.ip honours trustProxy, which is not what is wanted here: the
      // socket address is the only thing an outsider cannot forge.
      if (!isIngressAddress(request.socket.remoteAddress ?? undefined)) {
        await reply.status(403).send({ error: 'Only reachable through Home Assistant' });
      }
    });
  }

  const loginAttempts = new Map<string, { count: number; until: number }>();
  server.addHook('onRequest', async (request, reply) => {
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('cache-control', 'no-store');
    if (!privateBackup()) return;
    reply.header('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const origin = request.headers.origin;
    if (origin && origin !== process.env.AMBERCHEST_PUBLIC_ORIGIN) {
      return reply.status(403).send({ error: 'Cross-origin access is disabled' });
    }
    const path = request.url.split('?')[0] ?? '';
    if (path === '/mcp' || /\/(oauth|transfer|notifications|mqtt|restore|discard)(\/|$)/.test(path) ||
        path.endsWith('/archive/file') || path.startsWith('/api/archive/migration') ||
        request.method === 'DELETE') {
      return reply.status(403).send({ error: 'This feature is disabled on the private backup server' });
    }
    if (path === '/api/login' || path === '/api/unlock' || path === '/api/setup') {
      const now = Date.now();
      for (const [key, value] of loginAttempts) if (value.until <= now) loginAttempts.delete(key);
      // The reverse proxy is intentionally treated as one source. This gives
      // a conservative global limit without trusting spoofable forwarding headers.
      const key = request.ip;
      const entry = loginAttempts.get(key) ?? { count: 0, until: now + 60_000 };
      if (++entry.count > 10) return reply.status(429).header('retry-after', '60').send({ error: 'Try again in a minute' });
      loginAttempts.set(key, entry);
    }
  });

  // Fastify answers unknown routes with 404 before the hook can reply, so the
  // preflight needs a route of its own.
  server.options('/*', async (_request, reply) => reply.status(204).send());

  await server.register(websocket);
  await registerRoutes(server, {
    app: options.app,
    auth: options.auth,
    openFile: options.openFile,
  });

  if (options.webRoot && existsSync(options.webRoot)) {
    await server.register(fastifyStatic, { root: options.webRoot, index: ['index.html'] });
    // Single page app: unknown non-API paths render the shell.
    server.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return server;
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const server = await createServer(options);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  await server.listen({ host, port });

  const address = server.addresses()[0];
  const actualPort = address?.port ?? port;
  return {
    server,
    port: actualPort,
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`,
    close: async () => {
      await server.close();
    },
  };
}

/** Default location of the built frontend inside an installed app. */
export function defaultWebRoot(baseDir: string): string {
  return join(baseDir, 'web');
}

export { AuthGuard } from './auth.js';
export type { AuthMode } from './auth.js';
