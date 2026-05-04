import { config } from '../../config.js';
import * as apps from './apps.js';

export function getToolDefinitions() {
  // Skip if ArgoCD is not configured
  if (!config.argocdServer || !config.argocdToken) {
    return [];
  }

  return [
    {
      name: 'argo__list_apps',
      description: 'All apps with health, sync status, source repo',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'argo__get_app',
      description: 'Full spec and status for one application',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'argo__get_app_diff',
      description: 'Live diff between git and cluster state',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'argo__get_app_history',
      description: 'Deployment history with git SHAs and timestamps',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'argo__get_resource_tree',
      description: 'Full owned resource tree for an app',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'argo__sync_app',
      description: 'Trigger sync — supports dry-run, prune, force',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          dry_run: { type: 'boolean' },
          prune: { type: 'boolean' },
          force: { type: 'boolean' },
        },
        required: ['name'],
      },
    },
    {
      name: 'argo__rollback_app',
      description: 'Roll back to a specific history revision',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          revision: { type: 'number' },
        },
        required: ['name', 'revision'],
      },
    },
    {
      name: 'argo__terminate_op',
      description: 'Cancel an in-progress sync operation',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          uid: { type: 'string' },
        },
        required: ['name', 'uid'],
      },
    },
  ];
}

export async function handleTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'argo__list_apps':
      return await apps.listApps();
    case 'argo__get_app':
      return await apps.getApp(args.name);
    case 'argo__get_app_diff':
      return await apps.getAppDiff(args.name);
    case 'argo__get_app_history':
      return await apps.getAppHistory(args.name);
    case 'argo__get_resource_tree':
      return await apps.getResourceTree(args.name);
    case 'argo__sync_app':
      return await apps.syncApp(
        args.name,
        args.dry_run !== false,
        args.prune || false,
        args.force || false
      );
    case 'argo__rollback_app':
      return await apps.rollbackApp(args.name, args.revision);
    case 'argo__terminate_op':
      return await apps.terminateOp(args.name, args.uid);
    default:
      throw new Error(`Unknown ArgoCD tool: ${name}`);
  }
}
