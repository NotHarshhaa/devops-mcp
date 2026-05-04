import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import * as k8sHandlers from './providers/k8s/handlers.js';
import * as argoHandlers from './providers/argo/handlers.js';
import * as promHandlers from './providers/prom/handlers.js';
import * as pdHandlers from './providers/pd/handlers.js';
import { normalizeError } from './lib/errors.js';
import { StdioTransport, SSETransport, WebSocketTransport, TransportType } from './transports/index.js';
import { AuthManager } from './auth/index.js';
import { RequestMultiplexer } from './multiplexer/index.js';

export class McpServer {
  private server: Server;
  private authManager: AuthManager;
  private multiplexer: RequestMultiplexer;
  private transport?: StdioTransport | SSETransport | WebSocketTransport;

  constructor() {
    this.server = new Server(
      {
        name: 'devops-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize auth manager
    this.authManager = new AuthManager({
      type: config.mcpAuthToken ? 'token' : 'none',
      token: config.mcpAuthToken,
    });

    // Initialize multiplexer for concurrent request handling
    this.multiplexer = new RequestMultiplexer(10);

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          ...k8sHandlers.getToolDefinitions(),
          ...argoHandlers.getToolDefinitions(),
          ...promHandlers.getToolDefinitions(),
          ...pdHandlers.getToolDefinitions(),
        ],
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result: string;

        // Kubernetes tools
        if (name.startsWith('k8s__')) {
          result = await k8sHandlers.handleTool(name, args || {});
        }
        // ArgoCD tools
        else if (name.startsWith('argo__')) {
          result = await argoHandlers.handleTool(name, args || {});
        }
        // Prometheus tools
        else if (name.startsWith('prom__')) {
          result = await promHandlers.handleTool(name, args || {});
        }
        // PagerDuty tools
        else if (name.startsWith('pd__')) {
          result = await pdHandlers.handleTool(name, args || {});
        }
        else {
          throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        const normalized = normalizeError(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${normalized.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start(): Promise<void> {
    const transportType = config.transport || 'stdio';

    switch (transportType) {
      case TransportType.STDIO:
        this.transport = new StdioTransport();
        await this.server.connect((this.transport as StdioTransport).getNativeTransport());
        console.error('devops-mcp server started (stdio transport)');
        break;

      case TransportType.SSE:
        this.transport = new SSETransport();
        await this.transport.connect();
        console.error('devops-mcp server started (SSE transport)');
        break;

      case TransportType.WEBSOCKET:
        this.transport = new WebSocketTransport();
        await this.transport.connect();
        console.error('devops-mcp server started (WebSocket transport)');
        break;

      default:
        throw new Error(`Unsupported transport type: ${transportType}`);
    }
  }

  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
    }
  }

  getStatus() {
    return {
      transport: config.transport,
      auth: {
        type: config.mcpAuthToken ? 'token' : 'none',
        activeSessions: this.authManager.getActiveSessionCount(),
      },
      multiplexer: this.multiplexer.getStatus(),
    };
  }
}
