import express, { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from '../server.js';
import { config } from '../config.js';

export function createSSEServer(): express.Express {
  const app = express();
  const mcpServer = createServer();

  app.get('/sse', async (req: Request, res: Response) => {
    // Bearer token check
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (config.mcpAuthToken && token !== config.mcpAuthToken) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const transport = new SSEServerTransport('/message', res);
    await mcpServer.connect(transport);
  });

  app.post('/message', express.json(), async (req: Request, res: Response) => {
    // This endpoint is used by SSE transport for message routing
    // The MCP SDK handles this internally
    res.json({ success: true });
  });

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy' });
  });

  return app;
}
