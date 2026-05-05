import { config } from '../../config.js';
import * as debugService from './debug.js';

export function getToolDefinitions() {
  // Only show if at least one provider is configured
  const hasAnyProvider = config.kubeconfig || config.argocdServer || config.prometheusUrl || config.pagerdutyToken;
  
  if (!hasAnyProvider) {
    return [];
  }

  return [
    {
      name: 'devops__debug_service',
      description: 'Cross-provider incident debugging: aggregates Kubernetes, ArgoCD, Prometheus, and PagerDuty data to diagnose service issues',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service or deployment name' },
          namespace: { type: 'string', description: 'Namespace (default: default)' },
        },
        required: ['service'],
      },
    },
  ];
}

export async function handleTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'devops__debug_service':
      return await debugService.debugService(args.service, args.namespace);
    default:
      throw new Error(`Unknown debug tool: ${name}`);
  }
}
