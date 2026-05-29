import { getCoreV1, getKubeConfig, checkNamespaceAllowed } from './client.js';
import * as k8s from '@kubernetes/client-node';

export async function listCronJobs(namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    return JSON.stringify({ error: `Namespace "${ns}" is not allowed` }, null, 2);
  }
  const kc = getKubeConfig();
  const batchV1 = kc.makeApiClient(k8s.BatchV1Api);
  const res = await batchV1.listNamespacedCronJob({ namespace: ns });
  const items = (res.items || []).map(cj => ({
    name: cj.metadata?.name,
    schedule: cj.spec?.schedule,
    suspend: cj.spec?.suspend ?? false,
    activeJobs: cj.status?.active?.length ?? 0,
    lastScheduleTime: cj.status?.lastScheduleTime ?? null,
    lastSuccessfulTime: cj.status?.lastSuccessfulTime ?? null,
  }));
  return JSON.stringify(items, null, 2);
}

export async function getCronJobStatus(name: string, namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    return JSON.stringify({ error: `Namespace "${ns}" is not allowed` }, null, 2);
  }
  const kc = getKubeConfig();
  const batchV1 = kc.makeApiClient(k8s.BatchV1Api);
  const cj = await batchV1.readNamespacedCronJob({ name, namespace: ns });
  const jobs = await batchV1.listNamespacedJob({ namespace: ns });
  const ownedJobs = (jobs.items || [])
    .filter(j => j.metadata?.ownerReferences?.some(ref => ref.name === name))
    .map(j => ({
      name: j.metadata?.name,
      startTime: j.status?.startTime,
      completionTime: j.status?.completionTime,
      succeeded: j.status?.succeeded ?? 0,
      failed: j.status?.failed ?? 0,
      active: j.status?.active ?? 0,
    }));
  const result = {
    name: cj.metadata?.name,
    schedule: cj.spec?.schedule,
    suspend: cj.spec?.suspend ?? false,
    activeJobs: cj.status?.active?.length ?? 0,
    lastScheduleTime: cj.status?.lastScheduleTime ?? null,
    lastSuccessfulTime: cj.status?.lastSuccessfulTime ?? null,
    recentJobs: ownedJobs.slice(-10),
  };
  return JSON.stringify(result, null, 2);
}

export async function listServices(namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    return JSON.stringify({ error: `Namespace "${ns}" is not allowed` }, null, 2);
  }
  const coreV1 = getCoreV1();
  const res = await coreV1.listNamespacedService({ namespace: ns });
  const items = (res.items || []).map(svc => ({
    name: svc.metadata?.name,
    type: svc.spec?.type,
    clusterIP: svc.spec?.clusterIP,
    ports: (svc.spec?.ports || []).map(p => ({
      port: p.port,
      targetPort: p.targetPort,
      protocol: p.protocol,
    })),
    selector: svc.spec?.selector ?? {},
    externalIPs: svc.spec?.externalIPs ?? [],
  }));
  return JSON.stringify(items, null, 2);
}

export async function listPVCs(namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    return JSON.stringify({ error: `Namespace "${ns}" is not allowed` }, null, 2);
  }
  const coreV1 = getCoreV1();
  const res = await coreV1.listNamespacedPersistentVolumeClaim({ namespace: ns });
  const items = (res.items || []).map(pvc => ({
    name: pvc.metadata?.name,
    status: pvc.status?.phase,
    capacity: pvc.status?.capacity?.storage ?? null,
    accessModes: pvc.status?.accessModes ?? [],
    storageClassName: pvc.spec?.storageClassName ?? null,
    volumeName: pvc.spec?.volumeName ?? null,
  }));
  return JSON.stringify(items, null, 2);
}

export async function getHPA(namespace?: string, name?: string): Promise<string> {
  const ns = namespace || 'default';
  if (!checkNamespaceAllowed(ns)) {
    return JSON.stringify({ error: `Namespace "${ns}" is not allowed` }, null, 2);
  }
  const kc = getKubeConfig();
  const autoscalingV2 = kc.makeApiClient(k8s.AutoscalingV2Api);

  if (name) {
    const hpa = await autoscalingV2.readNamespacedHorizontalPodAutoscaler({ name, namespace: ns });
    return JSON.stringify(formatHPA(hpa), null, 2);
  }

  const res = await autoscalingV2.listNamespacedHorizontalPodAutoscaler({ namespace: ns });
  const items = (res.items || []).map(formatHPA);
  return JSON.stringify(items, null, 2);
}

function formatHPA(hpa: k8s.V2HorizontalPodAutoscaler) {
  return {
    name: hpa.metadata?.name,
    minReplicas: hpa.spec?.minReplicas,
    maxReplicas: hpa.spec?.maxReplicas,
    currentReplicas: hpa.status?.currentReplicas,
    desiredReplicas: hpa.status?.desiredReplicas,
    metrics: (hpa.status?.currentMetrics || []).map((m, i) => ({
      type: m.type,
      current: m.resource?.current || m.pods?.current || m.object?.current || m.external?.current,
      target: hpa.spec?.metrics?.[i]?.resource?.target || hpa.spec?.metrics?.[i]?.pods?.target || hpa.spec?.metrics?.[i]?.object?.target || hpa.spec?.metrics?.[i]?.external?.target,
    })),
    conditions: (hpa.status?.conditions || []).map(c => ({
      type: c.type,
      status: c.status,
      reason: c.reason,
      message: c.message,
    })),
  };
}
