import { config } from '../../config.js';
import * as debugService from './debug.js';
import * as explainChange from './explain-change.js';
import * as runbookModule from './runbook.js';
import * as healthReportModule from './health-report.js';
import * as timeline from './incident-timeline.js';

export function getToolDefinitions() {
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
    {
      name: 'devops__runbook',
      description: 'Symptom-based diagnostic runbook: runs targeted checks across providers for a specific issue type',
      inputSchema: {
        type: 'object',
        properties: {
          symptom: { type: 'string', enum: ['crashloop', 'high-latency', 'oom', '5xx', 'pod-pending'], description: 'The symptom to diagnose' },
          service: { type: 'string', description: 'Service or deployment name' },
          namespace: { type: 'string', description: 'Namespace (default: default)' },
        },
        required: ['symptom', 'service'],
      },
    },
    {
      name: 'devops__health_report',
      description: 'Cross-provider health report: gathers status from all configured providers and returns an overall health assessment',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace to check (default: default)' },
        },
        required: [],
      },
    },
    {
      name: 'devops__incident_timeline',
      description: 'Incident timeline: aggregates events from all providers into a chronological timeline for a service',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service or deployment name' },
          minutes_back: { type: 'number', description: 'Time window in minutes (default: 60)' },
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
    case 'devops__explain_change':
      return await explainChange.explainChange(args.service, args.namespace, args.timeframeMinutes);
    case 'devops__runbook':
      return await runbookModule.runbook(args.symptom, args.service, args.namespace);
    case 'devops__health_report':
      return await healthReportModule.healthReport(args.namespace);
    case 'devops__incident_timeline':
      return await timeline.incidentTimeline(args.service, args.minutes_back, args.namespace);
    default:
      throw new Error(`Unknown debug tool: ${name}`);
  }
}
