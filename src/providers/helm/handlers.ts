import { execFileSync } from 'node:child_process';
import * as releases from './releases.js';

let helmAvailable: boolean | null = null;

function isHelmAvailable(): boolean {
  if (helmAvailable !== null) return helmAvailable;
  try {
    execFileSync('helm', ['version', '--short'], { stdio: 'ignore' });
    helmAvailable = true;
  } catch {
    helmAvailable = false;
  }
  return helmAvailable;
}

export function getToolDefinitions(): any[] {
  if (!isHelmAvailable()) return [];

  return [
    {
      name: 'helm__list_releases',
      description: 'List Helm releases with status, chart, app version',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Kubernetes namespace' },
          all_namespaces: { type: 'boolean', description: 'List across all namespaces' },
        },
      },
    },
    {
      name: 'helm__get_status',
      description: 'Get status of a Helm release',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          namespace: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'helm__get_values',
      description: 'Get values of a Helm release (user-supplied or all)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          namespace: { type: 'string' },
          all_values: { type: 'boolean', description: 'Include computed values' },
        },
        required: ['name'],
      },
    },
    {
      name: 'helm__get_history',
      description: 'Get revision history of a Helm release',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          namespace: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'helm__rollback',
      description: 'Rollback a Helm release to a previous revision (mutate tier, dry_run by default)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          revision: { type: 'number' },
          namespace: { type: 'string' },
          dry_run: { type: 'boolean' },
        },
        required: ['name', 'revision'],
      },
    },
  ];
}

export async function handleTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'helm__list_releases':
      return await releases.listReleases(args.namespace, args.all_namespaces);
    case 'helm__get_status':
      return await releases.getReleaseStatus(args.name, args.namespace);
    case 'helm__get_values':
      return await releases.getReleaseValues(args.name, args.namespace, args.all_values);
    case 'helm__get_history':
      return await releases.getReleaseHistory(args.name, args.namespace);
    case 'helm__rollback':
      return await releases.rollbackRelease(
        args.name,
        args.revision,
        args.namespace,
        args.dry_run !== false
      );
    default:
      throw new Error(`Unknown Helm tool: ${name}`);
  }
}
