#!/usr/bin/env node

import express from 'express';
import { createSSEServer } from './transport/sse.js';
import { config } from './config.js';

async function main() {
  const app = createSSEServer();
  const port = config.port || 3000;
  
  app.listen(port, () => {
    console.error(`devops-mcp SSE server listening on port ${port}`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
