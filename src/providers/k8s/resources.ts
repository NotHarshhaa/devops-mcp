import { getCoreV1, getAppsV1, getKubeConfig, checkNamespaceAllowed } from './client.js';
import { withDryRunGuard } from '../../lib/dry-run.js';
import * as k8s from '@kubernetes/client-node';

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

export async function switchContext(
  contextName: string,
  dryRun: boolean = true
): Promise<string> {
  return withDryRunGuard('k8s__switch_context', { contextName, dry_run: dryRun }, 'mutate', async () => {
    const { getKubeConfig } = await import('./client.js');
    const kc = getKubeConfig();

    const context = kc.getContexts().find(c => c.name === contextName);
    if (!context) {
      throw new Error(`Context "${contextName}" not found`);
    }

    if (dryRun) {
      return JSON.stringify({
        dryRun: true,
        currentContext: kc.getCurrentContext(),
        targetContext: contextName,
        message: `Would select context ${contextName}; set K8S_CONTEXT and restart to apply it safely`,
      }, null, 2);
    }

    throw new Error(
      'Runtime Kubernetes context switching is disabled because it would affect other callers. Set K8S_CONTEXT and restart the server instead.'
    );
  });
}


export async function applyManifest(
  manifest: string,
  namespace?: string,
  dryRun: boolean = true
): Promise<string> {
  return withDryRunGuard('k8s__apply_manifest', { manifest: '(manifest)', namespace, dry_run: dryRun }, 'mutate', async () => {
    const kc = getKubeConfig();
    const specs = k8s.loadAllYaml(manifest) as k8s.KubernetesObject[];

    if (!specs || specs.length === 0) {
      throw new Error('No valid Kubernetes objects found in manifest');
    }

    const results: any[] = [];
    const client = k8s.KubernetesObjectApi.makeApiClient(kc);

    for (const spec of specs) {
      if (!spec.kind || !spec.metadata) continue;

      const ns = spec.metadata.namespace || namespace || 'default';
      if (!checkNamespaceAllowed(ns)) {
        throw new Error(`Namespace "${ns}" is not allowed`);
      }
      spec.metadata.namespace = ns;

      if (dryRun) {
        results.push({
          kind: spec.kind,
          name: spec.metadata.name,
          namespace: ns,
          dryRun: true,
          action: 'would apply',
        });
      } else {
        try {
          await client.read(spec as any);
          const res = await client.patch(spec as any);
          results.push({ kind: spec.kind, name: spec.metadata.name, namespace: ns, action: 'patched' });
        } catch {
          const res = await client.create(spec as any);
          results.push({ kind: spec.kind, name: spec.metadata.name, namespace: ns, action: 'created' });
        }
      }
    }

    return JSON.stringify({ dryRun, results }, null, 2);
  });
}
