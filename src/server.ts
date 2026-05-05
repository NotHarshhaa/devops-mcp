import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as k8sHandlers from './providers/k8s/handlers.js';
import * as argoHandlers from './providers/argo/handlers.js';
import * as promHandlers from './providers/prom/handlers.js';
import * as pdHandlers from './providers/pd/handlers.js';
import * as debugHandlers from './providers/debug/handlers.js';
import { normalizeError } from './lib/errors.js';

export function createServer(): Server {
  const server = new Server(
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

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        ...k8sHandlers.getToolDefinitions(),
        ...argoHandlers.getToolDefinitions(),
        ...promHandlers.getToolDefinitions(),
        ...pdHandlers.getToolDefinitions(),
        ...debugHandlers.getToolDefinitions(),
      ],
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
      // Debug tools
      else if (name.startsWith('devops__')) {
        result = await debugHandlers.handleTool(name, args || {});
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

  return server;
}
