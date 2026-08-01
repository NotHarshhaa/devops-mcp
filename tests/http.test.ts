import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createServer, type Server as HttpServer } from 'node:http';
import { once } from 'node:events';

jest.mock('@kubernetes/client-node', () => ({}));

import { config } from '../src/config';
import { createMcpHttpServer } from '../src/transport/http';

describe('stateless HTTP server', () => {
  const original = {
    httpHost: config.httpHost,
    mcpAllowedHosts: config.mcpAllowedHosts,
    mcpAllowedOrigins: config.mcpAllowedOrigins,
    mcpAuthToken: config.mcpAuthToken,
  };
  let server: HttpServer | undefined;
  let closeHandler: (() => Promise<void>) | undefined;
  let baseUrl = '';

  beforeEach(async () => {
    config.httpHost = '127.0.0.1';
    config.mcpAllowedHosts = ['127.0.0.1', 'localhost'];
    config.mcpAllowedOrigins = ['trusted.example'];
    config.mcpAuthToken = 'test-secret';

    const { app, handler } = createMcpHttpServer();
    closeHandler = () => handler.close();
    server = createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (closeHandler) await closeHandler();
    if (server) {
      server.close();
      await once(server, 'close');
    }
    Object.assign(config, original);
  });

  it('reports the active stateless protocol transport', async () => {
    const response = await fetch(`${baseUrl}/health`);
    await expect(response.json()).resolves.toMatchObject({
      status: 'healthy',
      protocolVersion: '2026-07-28',
      transport: 'streamable-http',
      stateless: true,
    });
  });

  it('requires the configured bearer token on /mcp', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover' }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('rejects untrusted Host headers before MCP dispatch', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-secret',
        'Content-Type': 'application/json',
        Host: 'evil.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover' }),
    });

    expect(response.status).toBe(406);
  });

  it('rejects untrusted browser origins before MCP dispatch', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-secret',
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover' }),
    });

    expect(response.status).toBe(403);
  });

  it('returns an actionable response for removed legacy transports', async () => {
    const response = await fetch(`${baseUrl}/sse`);
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: 'legacy_transport_removed',
    });
  });
});
