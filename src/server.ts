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

export class McpServer {
  private server: Server;

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
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('devops-mcp server started');
  }
}
