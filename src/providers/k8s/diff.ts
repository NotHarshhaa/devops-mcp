import { getCoreV1, getAppsV1, checkNamespaceAllowed } from './client.js';
import * as k8s from '@kubernetes/client-node';

function deepDiff(prev: any, current: any, path: string = ''): any[] {
  const changes: any[] = [];
  if (prev === current) return changes;
  if (prev === null || prev === undefined || current === null || current === undefined || typeof prev !== typeof current || typeof prev !== 'object') {
    changes.push({ path: path || '/', type: 'changed', oldValue: prev, newValue: current });
    return changes;
  }
  if (Array.isArray(prev) || Array.isArray(current)) {
    if (JSON.stringify(prev) !== JSON.stringify(current)) {
      changes.push({ path: path || '/', type: 'changed', oldValue: prev, newValue: current });
    }
    return changes;
  }
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(current)]);
  for (const key of allKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    if (!(key in prev)) {
      changes.push({ path: fullPath, type: 'added', newValue: current[key] });
    } else if (!(key in current)) {
      changes.push({ path: fullPath, type: 'removed', oldValue: prev[key] });
    } else {
      changes.push(...deepDiff(prev[key], current[key], fullPath));
    }
  }
  return changes;
}

async function fetchResource(resourceType: string, name: string, namespace: string): Promise<any> {
  const type = resourceType.toLowerCase();
  if (['deployment', 'statefulset', 'daemonset'].includes(type)) {
    const api = getAppsV1();
    if (type === 'deployment') return (await api.readNamespacedDeployment({ name, namespace }));
    if (type === 'statefulset') return (await api.readNamespacedStatefulSet({ name, namespace }));
    return (await api.readNamespacedDaemonSet({ name, namespace }));
  }
  const api = getCoreV1();
  if (type === 'service') return (await api.readNamespacedService({ name, namespace }));
  if (type === 'configmap') return (await api.readNamespacedConfigMap({ name, namespace }));
  throw new Error(`Unsupported resource type: ${resourceType}. Supported: deployment, service, configmap, statefulset, daemonset`);
}

export async function diffResource(resourceType: string, name: string, namespace?: string) {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    throw new Error(`Namespace "${ns}" is not in the allowed list`);
  }

  const resource = await fetchResource(resourceType, name, ns);
  const lastApplied = resource?.metadata?.annotations?.['kubectl.kubernetes.io/last-applied-configuration'];

  if (!lastApplied) {
    return { resourceType, name, namespace: ns, hasChanges: false, changes: [], note: 'No last-applied-configuration annotation found' };
  }

  const prev = JSON.parse(lastApplied);
  const current = JSON.parse(JSON.stringify(resource));

  // Remove managed fields and status for cleaner diff
  delete current.metadata?.managedFields;
  delete current.status;
  delete prev.metadata?.managedFields;
  delete prev.status;

  const changes = deepDiff(prev, current);
  return { resourceType, name, namespace: ns, hasChanges: changes.length > 0, changes };
}
