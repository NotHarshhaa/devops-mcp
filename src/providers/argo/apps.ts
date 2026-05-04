import { getArgoClient } from './client.js';
import { withDryRunGuard } from '../../lib/dry-run.js';

export async function listApps(): Promise<string> {
  const client = getArgoClient();
  const result = await client.get('/api/v1/applications');
  
  const apps = result.items.map((app: any) => ({
    name: app.metadata?.name,
    namespace: app.metadata?.namespace,
    syncStatus: app.status?.sync?.status,
    healthStatus: app.status?.health?.status,
    repo: app.spec?.source?.repoURL,
    path: app.spec?.source?.path,
    revision: app.status?.sync?.revision,
  }));

  return JSON.stringify(apps, null, 2);
}

export async function getApp(name: string): Promise<string> {
  const client = getArgoClient();
  const result = await client.get(`/api/v1/applications/${name}`);
  return JSON.stringify(result, null, 2);
}

export async function getAppDiff(name: string): Promise<string> {
  const client = getArgoClient();
  const result = await client.get(`/api/v1/applications/${name}/diff`);
  return JSON.stringify(result, null, 2);
}

export async function getAppHistory(name: string): Promise<string> {
  const client = getArgoClient();
  const result = await client.get(`/api/v1/applications/${name}/history`);
  
  const history = result.map((h: any) => ({
    revision: h.revision,
    deployedAt: h.deployedAt,
    source: h.source,
    author: h.author,
  }));

  return JSON.stringify(history, null, 2);
}

export async function getResourceTree(name: string): Promise<string> {
  const client = getArgoClient();
  const result = await client.get(`/api/v1/applications/${name}/resource-tree`);
  return JSON.stringify(result, null, 2);
}

export async function syncApp(
  name: string,
  dryRun: boolean = true,
  prune: boolean = false,
  force: boolean = false
): Promise<string> {
  return withDryRunGuard('argo__sync_app', { name, dryRun, prune, force }, 'mutate', async () => {
    const client = getArgoClient();
    
    if (dryRun) {
      return JSON.stringify({
        dryRun: true,
        message: `Would sync application ${name}`,
        prune,
        force,
      }, null, 2);
    }

    const result = await client.post(`/api/v1/applications/${name}/sync`, {
      dryRun: false,
      prune,
      force,
    });

    return JSON.stringify({
      dryRun: false,
      synced: true,
      application: name,
    }, null, 2);
  });
}

export async function rollbackApp(name: string, revision: number): Promise<string> {
  return withDryRunGuard('argo__rollback_app', { name, revision }, 'mutate', async () => {
    const client = getArgoClient();
    
    const result = await client.post(`/api/v1/applications/${name}/rollback`, {
      revision,
    });

    return JSON.stringify({
      rolledBack: true,
      application: name,
      revision,
    }, null, 2);
  });
}

export async function terminateOp(name: string, uid: string): Promise<string> {
  return withDryRunGuard('argo__terminate_op', { name, uid }, 'mutate', async () => {
    const client = getArgoClient();
    
    await client.delete(`/api/v1/applications/${name}/operations/${uid}`);

    return JSON.stringify({
      terminated: true,
      application: name,
      operationUid: uid,
    }, null, 2);
  });
}
