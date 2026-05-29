import { config } from '../../config.js';
import * as pods from '../k8s/pods.js';
import * as deployments from '../k8s/deployments.js';
import * as queries from '../prom/queries.js';
import * as apps from '../argo/apps.js';
import * as incidents from '../pd/incidents.js';

interface HealthReport {
  overall_status: 'healthy' | 'degraded' | 'critical';
  generated_at: string;
  namespace: string;
  sections: {
    kubernetes?: { unhealthy_pods: any[]; deployments_not_ready: any[] };
    prometheus?: { firing_alerts_count: number };
    argocd?: { out_of_sync: any[]; unhealthy_apps: any[] };
    pagerduty?: { open_incidents_count: number };
  };
  summary: string;
}

export async function healthReport(namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  const report: HealthReport = {
    overall_status: 'healthy',
    generated_at: new Date().toISOString(),
    namespace: ns,
    sections: {},
    summary: '',
  };

  let issues = 0;
  let critical = 0;

  // Kubernetes
  if (config.kubeconfig) {
    try {
      const allPods = JSON.parse(await pods.listPods(ns));
      const unhealthy = allPods.filter((p: any) => p.phase !== 'Running' && p.phase !== 'Succeeded');
      const allDeps = JSON.parse(await deployments.listDeployments(ns));
      const notReady = allDeps.filter((d: any) => d.ready < d.replicas);
      report.sections.kubernetes = { unhealthy_pods: unhealthy, deployments_not_ready: notReady };
      issues += unhealthy.length + notReady.length;
      if (notReady.length > 0) critical++;
    } catch (_) {}
  }

  // Prometheus
  if (config.prometheusUrl) {
    try {
      const firing = JSON.parse(await queries.getFiringAlerts());
      report.sections.prometheus = { firing_alerts_count: firing.length };
      if (firing.length > 0) issues += firing.length;
      if (firing.length >= 3) critical++;
    } catch (_) {}
  }

  // ArgoCD
  if (config.argocdServer && config.argocdToken) {
    try {
      const allApps = JSON.parse(await apps.listApps());
      const outOfSync = allApps.filter((a: any) => a.syncStatus !== 'Synced');
      const unhealthy = allApps.filter((a: any) => a.healthStatus !== 'Healthy');
      report.sections.argocd = { out_of_sync: outOfSync, unhealthy_apps: unhealthy };
      issues += outOfSync.length + unhealthy.length;
      if (unhealthy.length > 0) critical++;
    } catch (_) {}
  }

  // PagerDuty
  if (config.pagerdutyToken) {
    try {
      const open = JSON.parse(await incidents.listIncidents(['triggered', 'acknowledged']));
      report.sections.pagerduty = { open_incidents_count: open.length };
      if (open.length > 0) issues += open.length;
      if (open.length >= 2) critical++;
    } catch (_) {}
  }

  // Determine overall status
  if (critical > 0) report.overall_status = 'critical';
  else if (issues > 0) report.overall_status = 'degraded';

  report.summary = issues === 0
    ? 'All systems healthy. No issues detected.'
    : `${issues} issue(s) detected across providers. Status: ${report.overall_status}.`;

  return JSON.stringify(report, null, 2);
}
