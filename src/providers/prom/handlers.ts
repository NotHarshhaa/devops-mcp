import { config } from '../../config.js';
import * as queries from './queries.js';
import * as summarize from './summarize.js';

export function getToolDefinitions() {
  // Skip if Prometheus is not configured
  if (!config.prometheusUrl) {
    return [];
  }

  return [
    {
      name: 'prom__query',
      description: 'Instant PromQL query with label + value output',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
    {
      name: 'prom__query_range',
      description: 'Range query with step, returns time-series data',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' },
          step: { type: 'string' },
        },
        required: ['query', 'start', 'end', 'step'],
      },
    },
    {
      name: 'prom__list_alerts',
      description: 'All alert rules with state (firing / pending / inactive)',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'prom__get_firing_alerts',
      description: 'Only currently firing alerts with duration',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'prom__list_targets',
      description: 'All scrape targets with health and last scrape',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'prom__label_values',
      description: 'Enumerate values for a given label name',
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string' },
        },
        required: ['label'],
      },
    },
    {
      name: 'prom__metric_metadata',
      description: 'Type, help text, and unit for a metric',
      inputSchema: {
        type: 'object',
        properties: {
          metric: { type: 'string' },
        },
        required: ['metric'],
      },
    },
    {
      name: 'prom__summarize_service_health',
      description: 'Smart Prometheus summary: human-readable service health metrics including latency changes, error rate vs SLO, and traffic patterns',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service or job name' },
          namespace: { type: 'string', description: 'Namespace (optional)' },
          timeframeMinutes: { type: 'number', description: 'Time window in minutes (default: 30)' },
          sloThreshold: { type: 'number', description: 'Error rate SLO threshold as decimal (default: 0.05 for 5%)' },
        },
        required: ['service'],
      },
    },
  ];
}

export async function handleTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'prom__query':
      return await queries.query(args.query);
    case 'prom__query_range':
      return await queries.queryRange(
        args.query,
        args.start,
        args.end,
        args.step
      );
    case 'prom__list_alerts':
      return await queries.listAlerts();
    case 'prom__get_firing_alerts':
      return await queries.getFiringAlerts();
    case 'prom__list_targets':
      return await queries.listTargets();
    case 'prom__label_values':
      return await queries.labelValues(args.label);
    case 'prom__metric_metadata':
      return await queries.metricMetadata(args.metric);
    case 'prom__summarize_service_health':
      return await summarize.summarizeServiceHealth(
        args.service,
        args.namespace,
        args.timeframeMinutes,
        args.sloThreshold
      );
    default:
      throw new Error(`Unknown Prometheus tool: ${name}`);
  }
}
