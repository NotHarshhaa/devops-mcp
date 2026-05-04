import { Transport } from './transport.js';
import { config } from '../config.js';

export class WebSocketTransport implements Transport {
  private server?: any;
  private wss?: any;
  private messageCallback?: (message: string) => void;
  private errorCallback?: (error: Error) => void;

  constructor() {
    // Will be initialized when connect is called
  }

  async connect(): Promise<void> {
    const http = await import('http');
    const ws = await import('ws');

    this.server = http.createServer(async (req: any, res: any) => {
      // Health check endpoint
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy' }));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.wss = new ws.Server({ server: this.server, path: '/ws' });

    this.wss.on('connection', (ws: any, req: any) => {
      // Auth check
      const authToken = req.headers['authorization'];
      if (config.mcpAuthToken && authToken !== `Bearer ${config.mcpAuthToken}` && authToken !== config.mcpAuthToken) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      ws.on('message', (message: string) => {
        if (this.messageCallback) {
          this.messageCallback(message.toString());
        }
      });

      ws.on('error', (error: Error) => {
        if (this.errorCallback) {
          this.errorCallback(error);
        }
      });

      ws.on('close', () => {
        // Handle disconnection
      });

      // Send initial connection message
      ws.send(JSON.stringify({ type: 'connected' }));
    });

    const port = config.port || 3000;
    this.server.listen(port, () => {
      console.error(`WebSocket server listening on port ${port}`);
    });
  }

  async disconnect(): Promise<void> {
    if (this.wss) {
      this.wss.close();
    }
    if (this.server) {
      this.server.close();
    }
  }

  async send(message: string): Promise<void> {
    if (this.wss) {
      this.wss.clients.forEach((client: any) => {
        if (client.readyState === 1) { // OPEN
          client.send(JSON.stringify({ type: 'message', data: message }));
        }
      });
    }
  }

  onMessage(callback: (message: string) => void): void {
    this.messageCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }
}
