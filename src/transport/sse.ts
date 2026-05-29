import express, { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from '../server.js';
import { config } from '../config.js';

export function createSSEServer(): express.Express {
  const app = express();
  let transport: SSEServerTransport | null = null;

  app.get('/sse', async (req: Request, res: Response) => {
    // Bearer token check
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (config.mcpAuthToken && token !== config.mcpAuthToken) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    transport = new SSEServerTransport('/message', res);
    const mcpServer = createServer();
    await mcpServer.connect(transport);
  });

  app.post('/message', express.json(), async (req: Request, res: Response) => {
    if (!transport) {
      return res.status(400).json({ error: 'No active SSE connection' });
    }
    await transport.handlePostMessage(req, res);
  });

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy' });
  });

  return app;
}
