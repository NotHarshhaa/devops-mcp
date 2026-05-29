import { config } from '../../config.js';
import * as apps from '../argo/apps.js';
import * as queries from '../prom/queries.js';
import * as incidents from '../pd/incidents.js';
import * as resources from '../k8s/resources.js';

interface TimelineEvent {
  time: string;
  source: string;
  type: string;
  message: string;
}

export async function incidentTimeline(service: string, minutesBack?: number, namespace?: string): Promise<string> {
  const minutes = minutesBack || 60;
  const ns = namespace || 'default';
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const events: TimelineEvent[] = [];

  // K8s events
  if (config.kubeconfig) {
    try {
      const raw = await resources.getEvents(ns);
      const parsed = JSON.parse(raw);
      for (const e of parsed) {
        if (e.involvedObject?.name?.includes(service) && e.lastSeen && new Date(e.lastSeen) >= cutoff) {
          events.push({ time: e.lastSeen, source: 'kubernetes', type: e.reason || 'event', message: e.message || '' });
        }
      }
    } catch {}
  }

  // ArgoCD
  if (config.argocdServer) {
    try {
      const raw = await apps.getAppHistory(service);
      const parsed = JSON.parse(raw);
      for (const h of parsed) {
        if (h.deployedAt && new Date(h.deployedAt) >= cutoff) {
          events.push({ time: h.deployedAt, source: 'argocd', type: 'deployment', message: `Deployed revision ${h.revision || 'unknown'}` });
        }
      }
    } catch {}
  }

  // Prometheus
  if (config.prometheusUrl) {
    try {
      const raw = await queries.getFiringAlerts();
      const parsed = JSON.parse(raw);
      for (const a of parsed) {
        const labels = a.labels || {};
        if ((labels.service === service || labels.job === service || labels.deployment === service) && a.activeAt && new Date(a.activeAt) >= cutoff) {
          events.push({ time: a.activeAt, source: 'prometheus', type: 'alert_fired', message: `${labels.alertname || 'Alert'} firing` });
        }
      }
    } catch {}
  }

  // PagerDuty
  if (config.pagerdutyToken) {
    try {
      const raw = await incidents.listIncidents(['triggered', 'acknowledged']);
      const parsed = JSON.parse(raw);
      for (const i of parsed) {
        if ((i.title?.toLowerCase().includes(service) || i.service?.toLowerCase().includes(service)) && i.created && new Date(i.created) >= cutoff) {
          events.push({ time: i.created, source: 'pagerduty', type: 'incident', message: i.title || '' });
        }
      }
    } catch {}
  }

  events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Summary
  const deployments = events.filter(e => e.type === 'deployment');
  const alerts = events.filter(e => e.type === 'alert_fired' || e.type === 'incident');
  let summary = `${events.length} events in timeline.`;
  if (deployments.length > 0 && alerts.length > 0 && new Date(deployments[0].time) < new Date(alerts[0].time)) {
    const depTime = new Date(deployments[0].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const alertTime = new Date(alerts[0].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    summary += ` Deployment at ${depTime} followed by alert at ${alertTime} suggests deployment-related issue.`;
  }

  return JSON.stringify({
    service,
    namespace: ns,
    window_minutes: minutes,
    generated_at: new Date().toISOString(),
    timeline: events,
    summary,
  }, null, 2);
}
