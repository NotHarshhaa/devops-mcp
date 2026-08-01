import { timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createServer } from '../server.js';
import { config } from '../config.js';

export interface McpHttpServer {
  app: express.Express;
  handler: McpHttpHandler;
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}

function resolveAllowedHosts(): string[] {
  if (config.mcpAllowedHosts) return config.mcpAllowedHosts;
  if (isLoopbackHost(config.httpHost)) return ['localhost', '127.0.0.1', '[::1]'];

  throw new Error(
    'MCP_ALLOWED_HOSTS is required when MCP_HTTP_HOST is not a loopback address'
  );
}

function tokensEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function requireConfiguredToken(req: Request, res: Response, next: NextFunction): void {
  if (!config.mcpAuthToken) {
    next();
    return;
  }

  const authorization = req.header('authorization') || '';
  if (!tokensEqual(authorization, `Bearer ${config.mcpAuthToken}`)) {
    res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'unauthorized' });
    return;
  }
  next();
}

export function createMcpProtocolHandler(
  onerror: (error: Error) => void = error => console.error('MCP HTTP error:', error)
): McpHttpHandler {
  return createMcpHandler(createServer, {
    legacy: 'stateless',
    onerror,
  });
}

export function createMcpHttpServer(): McpHttpServer {
  const app = express();
  const handler = createMcpProtocolHandler();
  const nodeHandler = toNodeHandler(handler, {
    onerror: error => console.error('MCP Node adapter error:', error),
  });

  const allowedHosts = resolveAllowedHosts();
  const validateHost = hostHeaderValidation(allowedHosts);
  const validateOrigin = originValidation(config.mcpAllowedOrigins || allowedHosts);

  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      protocolVersion: '2026-07-28',
      transport: 'streamable-http',
      stateless: true,
    });
  });

  app.all('/mcp', requireConfiguredToken, (req: Request, res: Response) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    void nodeHandler(req, res, req.body);
  });

  // Give legacy HTTP+SSE clients an actionable response instead of a hanging stream.
  app.all(['/sse', '/message', '/ws'], (_req: Request, res: Response) => {
    res.status(410).json({
      error: 'legacy_transport_removed',
      message: 'Use the stateless Streamable HTTP endpoint at /mcp.',
    });
  });

  return { app, handler };
}
