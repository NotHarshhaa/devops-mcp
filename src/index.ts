#!/usr/bin/env node

import { McpServer } from './server.js';

async function main() {
  const server = new McpServer();
  await server.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
