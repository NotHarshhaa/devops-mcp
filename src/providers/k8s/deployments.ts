import { getAppsV1, getCoreV1, checkNamespaceAllowed } from './client.js';
import { withDryRunGuard } from '../../lib/dry-run.js';

export async function listDeployments(namespace?: string): Promise<string> {
  const appsV1 = getAppsV1();
  
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    throw new Error(`Namespace "${ns}" is not allowed`);
  }

  const res = await appsV1.listNamespacedDeployment({ namespace: ns });
  
  const deployments = res.items.map((depl: any) => ({
    name: depl.metadata?.name,
    namespace: depl.metadata?.namespace,
    replicas: depl.spec?.replicas,
    ready: depl.status?.readyReplicas || 0,
    updated: depl.status?.updatedReplicas || 0,
    available: depl.status?.availableReplicas || 0,
    age: depl.metadata?.creationTimestamp ? new Date(depl.metadata.creationTimestamp).toISOString() : 'unknown',
  }));

  return JSON.stringify(deployments, null, 2);
}

export async function scaleDeployment(
  namespace: string,
  name: string,
  replicas: number,
  dryRun: boolean = true
): Promise<string> {
  return withDryRunGuard('k8s__scale_deployment', { namespace, name, replicas, dry_run: dryRun }, 'mutate', async () => {
    const appsV1 = getAppsV1();
    
    if (!checkNamespaceAllowed(namespace)) {
      throw new Error(`Namespace "${namespace}" is not allowed`);
    }

    const deployment = await appsV1.readNamespacedDeployment({ name, namespace });
    const currentReplicas = deployment.spec?.replicas ?? 1;

    if (dryRun) {
      return JSON.stringify({
        dryRun: true,
        currentReplicas,
        newReplicas: replicas,
        message: 'Dry run - no changes made',
      }, null, 2);
    }

    if (deployment.spec) {
      deployment.spec.replicas = replicas;
    }

    await appsV1.replaceNamespacedDeployment({ name, namespace, body: deployment });
    
    return JSON.stringify({
      dryRun: false,
      scaled: true,
      replicas,
    }, null, 2);
  });
}

export async function rolloutRestart(
  namespace: string,
  name: string,
  dryRun: boolean = true
): Promise<string> {
  return withDryRunGuard('k8s__rollout_restart', { namespace, name, dry_run: dryRun }, 'mutate', async () => {
    const appsV1 = getAppsV1();
    
    if (!checkNamespaceAllowed(namespace)) {
      throw new Error(`Namespace "${namespace}" is not allowed`);
    }

    if (dryRun) {
      return JSON.stringify({
        dryRun: true,
        message: `Would restart deployment ${name} in namespace ${namespace}`,
      }, null, 2);
    }

    const body = {
      spec: {
        template: {
          metadata: {
            annotations: {
              'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
            },
          },
        },
      },
    };

    await appsV1.patchNamespacedDeployment({
      name,
      namespace,
      body,
    });

    return JSON.stringify({
      dryRun: false,
      restarted: true,
      deployment: name,
    }, null, 2);
  });
}
