import { config } from '../../config.js';
import * as debugService from './debug.js';
import * as explainChange from './explain-change.js';

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
    {
      name: 'devops__explain_change',
      description: 'Explain what changed: combines ArgoCD history, Kubernetes rollout history, and Prometheus anomaly window to identify the cause of issues',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service or deployment name' },
          namespace: { type: 'string', description: 'Namespace (default: default)' },
          timeframeMinutes: { type: 'number', description: 'Time window to analyze in minutes (default: 60)' },
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
    case 'devops__explain_change':
      return await explainChange.explainChange(args.service, args.namespace, args.timeframeMinutes);
    default:
      throw new Error(`Unknown debug tool: ${name}`);
  }
}
