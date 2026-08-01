#!/usr/bin/env node

import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const handle = serveStdio(createServer, {
    legacy: 'serve',
    onerror: error => console.error('MCP stdio error:', error),
  });

  const shutdown = async (): Promise<void> => {
    await handle.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
