import { getHelmClient } from './client.js';
import { withDryRunGuard } from '../../lib/dry-run.js';
import { config, checkNamespaceAllowed } from '../../config.js';

export async function listReleases(namespace?: string, allNamespaces?: boolean): Promise<string> {
  const client = getHelmClient();
  const args = ['list'];
  
  if (allNamespaces) {
    if (config.k8sAllowedNamespaces && config.k8sAllowedNamespaces.length > 0) {
      throw new Error('Listing releases across all namespaces is not allowed when K8S_ALLOWED_NAMESPACES is configured');
    }
    args.push('--all-namespaces');
  } else {
    const ns = namespace || 'default';
    if (!checkNamespaceAllowed(ns)) {
      throw new Error(`Namespace "${ns}" is not allowed`);
    }
    args.push('--namespace', ns);
  }
  
  const result = await client.runJson(args);
  return JSON.stringify(result, null, 2);
}

export async function getReleaseStatus(name: string, namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    throw new Error(`Namespace "${ns}" is not allowed`);
  }
  const client = getHelmClient();
  const args = ['status', name, '--namespace', ns];
  const result = await client.runJson(args);
  return JSON.stringify(result, null, 2);
}

export async function getReleaseValues(name: string, namespace?: string, allValues?: boolean): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    throw new Error(`Namespace "${ns}" is not allowed`);
  }
  const client = getHelmClient();
  const args = ['get', 'values', name, '--namespace', ns];
  if (allValues) args.push('--all');
  const result = await client.runJson(args);
  return JSON.stringify(result, null, 2);
}

export async function getReleaseHistory(name: string, namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    throw new Error(`Namespace "${ns}" is not allowed`);
  }
  const client = getHelmClient();
  const args = ['history', name, '--namespace', ns];
  const result = await client.runJson(args);
  return JSON.stringify(result, null, 2);
}

export async function rollbackRelease(
  name: string,
  revision: number,
  namespace?: string,
  dryRun: boolean = true
): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    throw new Error(`Namespace "${ns}" is not allowed`);
  }

  return withDryRunGuard(
    'helm__rollback',
    { name, revision, namespace: ns, dry_run: dryRun },
    'mutate',
    async () => {
      const client = getHelmClient();
      const args = ['rollback', name, String(revision), '--namespace', ns];
      if (dryRun) args.push('--dry-run');
      const output = await client.run(args);
      return JSON.stringify({ dryRun, success: true, output: output.trim() });
    }
  );
}
