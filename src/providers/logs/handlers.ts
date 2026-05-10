import { config } from '../../config.js';
import * as logQueries from './queries.js';

export function getToolDefinitions() {
  // Skip if Loki is not configured
  if (!config.lokiUrl) {
    return [];
  }

  return [
    {
      name: 'logs__get_recent_errors',
      description: 'Get recent error logs from Loki for debugging incidents',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service or application name' },
          namespace: { type: 'string', description: 'Namespace (optional)' },
          minutes: { type: 'number', description: 'Time window in minutes (default: 30)' },
          limit: { type: 'number', description: 'Maximum number of entries (default: 50)' },
        },
        required: ['service'],
      },
    },
    {
      name: 'logs__search',
      description: 'Search logs in Loki with custom query for root cause analysis',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'LogQL query string' },
          start: { type: 'string', description: 'Start time (ISO format, optional)' },
          end: { type: 'string', description: 'End time (ISO format, optional)' },
          limit: { type: 'number', description: 'Maximum number of entries (default: 100)' },
        },
        required: ['query'],
      },
    },
  ];
}

export async function handleTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'logs__get_recent_errors':
      return await logQueries.getRecentErrors(
        args.service,
        args.namespace,
        args.minutes,
        args.limit
      );
    case 'logs__search':
      return await logQueries.search(
        args.query,
        args.start,
        args.end,
        args.limit
      );
    default:
      throw new Error(`Unknown logs tool: ${name}`);
  }
}
