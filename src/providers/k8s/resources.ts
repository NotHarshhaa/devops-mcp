import { getCoreV1, getAppsV1, checkNamespaceAllowed } from './client.js';
import { withDryRunGuard } from '../../lib/dry-run.js';

export async function describeResource(
  resourceType: string,
  name: string,
  namespace?: string
): Promise<string> {
  const coreV1 = getCoreV1();
  const appsV1 = getAppsV1();
  
  if (namespace && !checkNamespaceAllowed(namespace)) {
    throw new Error(`Namespace "${namespace}" is not allowed`);
  }

  let details: any;
  
  switch (resourceType.toLowerCase()) {
    case 'pod':
      if (!namespace) throw new Error('Namespace required for pods');
      details = await coreV1.readNamespacedPod({ name, namespace });
      break;
    case 'service':
      if (!namespace) throw new Error('Namespace required for services');
      details = await coreV1.readNamespacedService({ name, namespace });
      break;
    case 'configmap':
      if (!namespace) throw new Error('Namespace required for configmaps');
      details = await coreV1.readNamespacedConfigMap({ name, namespace });
      break;
    case 'secret':
      if (!namespace) throw new Error('Namespace required for secrets');
      details = await coreV1.readNamespacedSecret({ name, namespace });
      break;
    case 'deployment':
      if (!namespace) throw new Error('Namespace required for deployments');
      details = await appsV1.readNamespacedDeployment({ name, namespace });
      break;
    default:
      throw new Error(`Unsupported resource type: ${resourceType}`);
  }

  return JSON.stringify(details, null, 2);
}

export async function getEvents(
  namespace?: string,
  reasonFilter?: string
): Promise<string> {
  const coreV1 = getCoreV1();
  
  if (namespace && !checkNamespaceAllowed(namespace)) {
    throw new Error(`Namespace "${namespace}" is not allowed`);
  }

  const res = namespace
    ? await coreV1.listNamespacedEvent({ namespace })
    : await coreV1.listEventForAllNamespaces();

  let events = res.items;
  
  if (reasonFilter) {
    events = events.filter((e: any) => e.reason === reasonFilter);
  }

  const formatted = events.map((e: any) => ({
    type: e.type,
    reason: e.reason,
    message: e.message,
    involvedObject: {
      kind: e.involvedObject?.kind,
      name: e.involvedObject?.name,
      namespace: e.involvedObject?.namespace,
    },
    lastSeen: e.lastTimestamp,
    count: e.count,
  }));

  return JSON.stringify(formatted, null, 2);
}

export async function deleteResource(
  resourceType: string,
  name: string,
  namespace?: string,
  confirm: boolean = false
): Promise<string> {
  return withDryRunGuard('k8s__delete_resource', { resourceType, name, namespace, confirm }, 'destructive', async () => {
    const coreV1 = getCoreV1();
    const appsV1 = getAppsV1();
    
    if (namespace && !checkNamespaceAllowed(namespace)) {
      throw new Error(`Namespace "${namespace}" is not allowed`);
    }

    switch (resourceType.toLowerCase()) {
      case 'pod':
        if (!namespace) throw new Error('Namespace required for pods');
        await coreV1.deleteNamespacedPod({ name, namespace });
        break;
      case 'service':
        if (!namespace) throw new Error('Namespace required for services');
        await coreV1.deleteNamespacedService({ name, namespace });
        break;
      case 'deployment':
        if (!namespace) throw new Error('Namespace required for deployments');
        await appsV1.deleteNamespacedDeployment({ name, namespace });
        break;
      default:
        throw new Error(`Unsupported resource type for deletion: ${resourceType}`);
    }

    return JSON.stringify({
      deleted: true,
      resourceType,
      name,
      namespace,
    }, null, 2);
  });
}

export async function listContexts(): Promise<string> {
  const { getKubeConfig } = await import('./client.js');
  const kc = getKubeConfig();
  
  const contexts = kc.getContexts().map((ctx: any) => ({
    name: ctx.name,
    cluster: ctx.cluster,
    user: ctx.user,
    current: ctx.name === kc.getCurrentContext(),
  }));

  return JSON.stringify(contexts, null, 2);
}

export async function switchContext(contextName: string): Promise<string> {
  return withDryRunGuard('k8s__switch_context', { contextName }, 'mutate', async () => {
    const { getKubeConfig } = await import('./client.js');
    const kc = getKubeConfig();
    
    const context = kc.getContexts().find(c => c.name === contextName);
    if (!context) {
      throw new Error(`Context "${contextName}" not found`);
    }

    kc.setCurrentContext(contextName);
    
    return JSON.stringify({
      switched: true,
      context: contextName,
    }, null, 2);
  });
}
