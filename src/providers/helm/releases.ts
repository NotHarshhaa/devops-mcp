import { getHelmClient } from './client.js';

export async function listReleases(namespace?: string, allNamespaces?: boolean): Promise<string> {
  const client = getHelmClient();
  const args = ['list'];
  if (allNamespaces) {
    args.push('--all-namespaces');
  } else if (namespace) {
    args.push('--namespace', namespace);
  }
  const result = await client.runJson(args);
  return JSON.stringify(result, null, 2);
}

export async function getReleaseStatus(name: string, namespace?: string): Promise<string> {
  const client = getHelmClient();
  const args = ['status', name];
  if (namespace) args.push('--namespace', namespace);
  const result = await client.runJson(args);
  return JSON.stringify(result, null, 2);
}

export async function getReleaseValues(name: string, namespace?: string, allValues?: boolean): Promise<string> {
  const client = getHelmClient();
  const args = ['get', 'values', name];
  if (namespace) args.push('--namespace', namespace);
  if (allValues) args.push('--all');
  const result = await client.runJson(args);
  return JSON.stringify(result, null, 2);
}

export async function getReleaseHistory(name: string, namespace?: string): Promise<string> {
  const client = getHelmClient();
  const args = ['history', name];
  if (namespace) args.push('--namespace', namespace);
  const result = await client.runJson(args);
  return JSON.stringify(result, null, 2);
}

export async function rollbackRelease(name: string, revision: number, namespace?: string, dryRun?: boolean): Promise<string> {
  const client = getHelmClient();
  const args = ['rollback', name, String(revision)];
  if (namespace) args.push('--namespace', namespace);
  if (dryRun) args.push('--dry-run');
  const output = await client.run(args);
  return JSON.stringify({ success: true, output: output.trim() });
}
