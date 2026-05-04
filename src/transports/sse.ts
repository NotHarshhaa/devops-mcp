import { Transport } from './transport.js';
import { config } from '../config.js';

export class SSETransport implements Transport {
  private server?: any;
  private clients: Set<any> = new Set();
  private messageCallback?: (message: string) => void;
  private errorCallback?: (error: Error) => void;

  constructor() {
    // Will be initialized when connect is called
  }

  async connect(): Promise<void> {
    const http = await import('http');
    const url = await import('url');

    this.server = http.createServer(async (req: any, res: any) => {
      const parsedUrl = url.parse(req.url, true);
      
      // Health check endpoint
      if (parsedUrl.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy' }));
        return;
      }

      // SSE endpoint
      if (parsedUrl.pathname === '/sse') {
        // Auth check
        const authToken = req.headers['authorization'] || parsedUrl.query.token;
        if (config.mcpAuthToken && authToken !== `Bearer ${config.mcpAuthToken}` && authToken !== config.mcpAuthToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        const clientId = Date.now();
        this.clients.add({ id: clientId, res });

        req.on('close', () => {
          this.clients.delete({ id: clientId, res });
        });

        // Send initial connection message
        res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

        return;
      }

      // POST endpoint for sending messages
      if (parsedUrl.pathname === '/message' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: string) => {
          body += chunk;
        });
        req.on('end', () => {
          if (this.messageCallback) {
            this.messageCallback(body);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }

      // 404 for other paths
      res.writeHead(404);
      res.end('Not Found');
    });

    const port = config.port || 3000;
    this.server.listen(port, () => {
      console.error(`SSE server listening on port ${port}`);
    });
  }

  async disconnect(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.clients.clear();
    }
  }

  async send(message: string): Promise<void> {
    const data = `data: ${JSON.stringify({ type: 'message', data: message })}\n\n`;
    this.clients.forEach((client: any) => {
      try {
        client.res.write(data);
      } catch (error) {
        this.clients.delete(client);
      }
    });
  }

  onMessage(callback: (message: string) => void): void {
    this.messageCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }
}
