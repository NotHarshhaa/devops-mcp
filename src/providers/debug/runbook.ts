import { config } from '../../config.js';
import * as pods from '../k8s/pods.js';
import * as resources from '../k8s/resources.js';
import * as deployments from '../k8s/deployments.js';
import * as queries from '../prom/queries.js';
import * as logQueries from '../logs/queries.js';

type Symptom = 'crashloop' | 'high-latency' | 'oom' | '5xx' | 'pod-pending';

interface RunbookResult {
  symptom: string;
  service: string;
  namespace: string;
  steps_executed: string[];
  findings: string[];
  recommended_actions: string[];
}

async function safe<T>(fn: () => Promise<T>, step: string, steps: string[], findings: string[]): Promise<T | null> {
  try {
    steps.push(step);
    return await fn();
  } catch (e: any) {
    findings.push(`[${step}] Skipped: ${e.message}`);
    return null;
  }
}

export async function runbook(symptom: string, service: string, namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  const result: RunbookResult = { symptom, service, namespace: ns, steps_executed: [], findings: [], recommended_actions: [] };
  const { steps_executed, findings, recommended_actions } = result;

  switch (symptom as Symptom) {
    case 'crashloop': {
      const podsData = await safe(() => pods.listPods(ns), 'k8s:list_pods', steps_executed, findings);
      if (podsData) {
        const allPods = JSON.parse(podsData);
        const matched = allPods.filter((p: any) => p.name.includes(service));
        const crashing = matched.filter((p: any) => p.restarts > 0);
        findings.push(`Found ${matched.length} pod(s), ${crashing.length} with restarts`);
        if (crashing.length > 0) {
          const podName = crashing[0].name;
          const logs = await safe(() => pods.getPodLogs(ns, podName, undefined, 50), 'k8s:pod_logs', steps_executed, findings);
          if (logs) findings.push(`Last logs from ${podName}: ${logs.slice(0, 500)}`);
        }
      }
      await safe(async () => {
        const events = JSON.parse(await resources.getEvents(ns));
        const relevant = events.filter((e: any) => e.involvedObject?.name?.includes(service) && e.reason === 'BackOff');
        if (relevant.length > 0) findings.push(`${relevant.length} BackOff event(s) found`);
      }, 'k8s:events', steps_executed, findings);
      await safe(async () => {
        const deps = JSON.parse(await deployments.listDeployments(ns));
        const dep = deps.find((d: any) => d.name === service);
        if (dep) findings.push(`Deployment: ${dep.ready}/${dep.replicas} ready`);
      }, 'k8s:deployment', steps_executed, findings);
      recommended_actions.push('Check container logs for startup errors', 'Verify image tag and pull secrets', 'Check resource limits and liveness probes');
      break;
    }
    case 'high-latency': {
      if (config.prometheusUrl) {
        await safe(async () => {
          const data = JSON.parse(await queries.query(`histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="${service}"}[5m]))`));
          if (data.length > 0) findings.push(`p95 latency: ${data[0].valueStr}s`);
        }, 'prom:p95_latency', steps_executed, findings);
        await safe(async () => {
          const alerts = JSON.parse(await queries.getFiringAlerts());
          const relevant = alerts.filter((a: any) => a.labels?.job === service || a.labels?.service === service);
          if (relevant.length > 0) findings.push(`${relevant.length} firing alert(s) related to service`);
        }, 'prom:firing_alerts', steps_executed, findings);
      }
      if (config.kubeconfig) {
        await safe(async () => {
          const usage = JSON.parse(await pods.getResourceUsage(ns));
          const matched = usage.filter((p: any) => p.name.includes(service));
          if (matched.length > 0) findings.push(`Resource usage: ${JSON.stringify(matched[0].containers)}`);
        }, 'k8s:resource_usage', steps_executed, findings);
        await safe(async () => {
          const deps = JSON.parse(await deployments.listDeployments(ns));
          const dep = deps.find((d: any) => d.name === service);
          if (dep) findings.push(`Deployment: ${dep.ready}/${dep.replicas} replicas, age: ${dep.age}`);
        }, 'k8s:deployments', steps_executed, findings);
      }
      recommended_actions.push('Check for CPU throttling or memory pressure', 'Review recent deployments for regressions', 'Check downstream dependencies');
      break;
    }
    case 'oom': {
      if (config.kubeconfig) {
        await safe(async () => {
          const events = JSON.parse(await resources.getEvents(ns, 'OOMKilled'));
          const relevant = events.filter((e: any) => e.involvedObject?.name?.includes(service));
          findings.push(`${relevant.length} OOMKilled event(s)`);
        }, 'k8s:events_oom', steps_executed, findings);
        await safe(async () => {
          const usage = JSON.parse(await pods.getResourceUsage(ns));
          const matched = usage.filter((p: any) => p.name.includes(service));
          if (matched.length > 0) findings.push(`Current memory usage: ${JSON.stringify(matched[0].containers?.map((c: any) => ({ name: c.name, memory: c.memory })))}`);
        }, 'k8s:resource_usage', steps_executed, findings);
        await safe(async () => {
          const allPods = JSON.parse(await pods.listPods(ns));
          const pod = allPods.find((p: any) => p.name.includes(service));
          if (pod) {
            const desc = await resources.describeResource('pod', pod.name, ns);
            const parsed = JSON.parse(desc);
            const limits = parsed.spec?.containers?.map((c: any) => ({ name: c.name, limits: c.resources?.limits }));
            if (limits) findings.push(`Resource limits: ${JSON.stringify(limits)}`);
          }
        }, 'k8s:describe_pod', steps_executed, findings);
      }
      recommended_actions.push('Increase memory limits', 'Profile application memory usage', 'Check for memory leaks');
      break;
    }
    case '5xx': {
      if (config.prometheusUrl) {
        await safe(async () => {
          const data = JSON.parse(await queries.query(`rate(http_requests_total{job="${service}",code=~"5.."}[5m])`));
          if (data.length > 0) findings.push(`5xx error rate: ${data[0].valueStr} req/s`);
        }, 'prom:error_rate', steps_executed, findings);
      }
      if (config.lokiUrl) {
        await safe(async () => {
          const logs = await logQueries.getRecentErrors(service, ns, 15, 20);
          const parsed = JSON.parse(logs);
          findings.push(`Recent errors: ${parsed.errorCount} in last 15m`);
        }, 'loki:recent_errors', steps_executed, findings);
      }
      if (config.kubeconfig) {
        await safe(async () => {
          const deps = JSON.parse(await deployments.listDeployments(ns));
          const dep = deps.find((d: any) => d.name === service);
          if (dep) findings.push(`Deployment health: ${dep.ready}/${dep.replicas} ready, ${dep.available} available`);
        }, 'k8s:deployment_health', steps_executed, findings);
      }
      recommended_actions.push('Check application logs for error details', 'Verify upstream dependencies are healthy', 'Check if recent deployment introduced the issue');
      break;
    }
    case 'pod-pending': {
      if (config.kubeconfig) {
        await safe(async () => {
          const events = JSON.parse(await resources.getEvents(ns));
          const relevant = events.filter((e: any) => e.involvedObject?.name?.includes(service) && (e.reason === 'FailedScheduling' || e.reason === 'Unschedulable'));
          findings.push(`${relevant.length} scheduling event(s)`);
          relevant.slice(0, 3).forEach((e: any) => findings.push(`  - ${e.reason}: ${e.message}`));
        }, 'k8s:events', steps_executed, findings);
        await safe(async () => {
          const allPods = JSON.parse(await pods.listPods(ns));
          const pending = allPods.filter((p: any) => p.name.includes(service) && p.phase === 'Pending');
          findings.push(`${pending.length} pending pod(s)`);
        }, 'k8s:pending_pods', steps_executed, findings);
      }
      recommended_actions.push('Check node capacity and resource requests', 'Verify node selectors and tolerations', 'Check for PVC binding issues');
      break;
    }
    default:
      findings.push(`Unknown symptom: ${symptom}. Supported: crashloop, high-latency, oom, 5xx, pod-pending`);
  }

  return JSON.stringify(result, null, 2);
}
