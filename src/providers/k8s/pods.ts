import { getCoreV1, getMetrics, checkNamespaceAllowed } from './client.js';
import { withDryRunGuard } from '../../lib/dry-run.js';

export async function listPods(namespace?: string): Promise<string> {
  const coreV1 = getCoreV1();
  
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    throw new Error(`Namespace "${ns}" is not allowed`);
  }

  const res = await coreV1.listNamespacedPod({ namespace: ns });
  
  const pods = res.items.map((pod: any) => ({
    name: pod.metadata?.name,
    namespace: pod.metadata?.namespace,
    phase: pod.status?.phase,
    ready: pod.status?.containerStatuses?.filter((c: any) => c.ready).length || 0,
    total: pod.status?.containerStatuses?.length || 0,
    restarts: pod.status?.containerStatuses?.reduce((sum: number, c: any) => sum + (c.restartCount || 0), 0) || 0,
    node: pod.spec?.nodeName,
    age: pod.metadata?.creationTimestamp ? new Date(pod.metadata.creationTimestamp).toISOString() : 'unknown',
  }));

  return JSON.stringify(pods, null, 2);
}

export async function getPodLogs(
  namespace: string,
  pod: string,
  container?: string,
  tailLines?: number,
  follow: boolean = false
): Promise<string> {
  const coreV1 = getCoreV1();
  
  if (!checkNamespaceAllowed(namespace)) {
    throw new Error(`Namespace "${namespace}" is not allowed`);
  }

  const res = await coreV1.readNamespacedPodLog({
    name: pod,
    namespace: namespace,
    container: container,
    tailLines: tailLines,
    follow: follow,
  });

  return res as string;
}

export async function getResourceUsage(namespace?: string): Promise<string> {
  const metrics = getMetrics();
  
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    throw new Error(`Namespace "${ns}" is not allowed`);
  }

  const podMetrics = await metrics.getPodMetrics(ns);
  const pods = podMetrics.items.map((pm: any) => ({
    name: pm.metadata?.name,
    containers: pm.containers?.map((c: any) => ({
      name: c.name,
      cpu: c.usage?.cpu,
      memory: c.usage?.memory,
    })),
  }));

  return JSON.stringify(pods, null, 2);
}
