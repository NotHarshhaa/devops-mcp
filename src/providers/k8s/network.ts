import { getKubeConfig, checkNamespaceAllowed } from './client.js';
import * as k8s from '@kubernetes/client-node';

export async function getNetworkPolicies(namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) throw new Error(`Namespace "${ns}" is not allowed`);

  const networkingV1 = getKubeConfig().makeApiClient(k8s.NetworkingV1Api);
  const res = await networkingV1.listNamespacedNetworkPolicy({ namespace: ns });

  const result = res.items.map((np: any) => ({
    name: np.metadata?.name,
    namespace: np.metadata?.namespace,
    podSelector: np.spec?.podSelector,
    ingress: np.spec?.ingress,
    egress: np.spec?.egress,
    policyTypes: np.spec?.policyTypes,
  }));

  return JSON.stringify(result, null, 2);
}

export async function getIngresses(namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) throw new Error(`Namespace "${ns}" is not allowed`);

  const networkingV1 = getKubeConfig().makeApiClient(k8s.NetworkingV1Api);
  const res = await networkingV1.listNamespacedIngress({ namespace: ns });

  const result = res.items.map((ing: any) => ({
    name: ing.metadata?.name,
    namespace: ing.metadata?.namespace,
    hosts: ing.spec?.rules?.map((r: any) => r.host),
    rules: ing.spec?.rules?.map((r: any) => ({
      host: r.host,
      paths: r.http?.paths?.map((p: any) => ({
        path: p.path,
        pathType: p.pathType,
        backend: p.backend,
      })),
    })),
    tls: ing.spec?.tls,
  }));

  return JSON.stringify(result, null, 2);
}
