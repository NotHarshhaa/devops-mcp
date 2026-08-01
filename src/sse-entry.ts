#!/usr/bin/env node

import { createMcpHttpServer } from './transport/http.js';
import { config } from './config.js';

async function main(): Promise<void> {
  const { app, handler } = createMcpHttpServer();
  const httpServer = app.listen(config.port, config.httpHost, () => {
    console.error(
      `devops-mcp stateless HTTP server listening at http://${config.httpHost}:${config.port}/mcp`
    );
  });

  const shutdown = async (): Promise<void> => {
    await handler.close();
    await new Promise<void>((resolve, reject) => {
      httpServer.close(error => error ? reject(error) : resolve());
    });
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
