import { config } from '../../config.js';
import * as pods from '../k8s/pods.js';
import * as resources from '../k8s/resources.js';
import * as deployments from '../k8s/deployments.js';
import * as apps from '../argo/apps.js';
import * as queries from '../prom/queries.js';
import * as incidents from '../pd/incidents.js';

interface DiagnosisData {
  service: string;
  namespace: string;
  kubernetes?: {
    pods: any[];
    events: any[];
    deployment?: any;
  };
  argocd?: {
    app?: any;
    diff?: any;
    history?: any[];
  };
  prometheus?: {
    errorRate?: any;
    latency?: any;
    firingAlerts?: any[];
  };
  pagerduty?: {
    incidents: any[];
  };
}

export async function debugService(service: string, namespace?: string): Promise<string> {
  const ns = namespace || 'default';
  const diagnosis: DiagnosisData = {
    service,
    namespace: ns,
  };

  const findings: string[] = [];
  const errors: string[] = [];

  // 1. Kubernetes checks
  if (config.kubeconfig) {
    try {
      findings.push('## Kubernetes Status');
      
      // Get pods for the service
      const podsJson = await pods.listPods(ns);
      const allPods = JSON.parse(podsJson);
      const servicePods = allPods.filter((p: any) => 
        p.name.includes(service) || p.name.startsWith(service)
      );
      
      diagnosis.kubernetes = {
        pods: servicePods,
        events: [],
      };

      if (servicePods.length === 0) {
        findings.push('⚠️ No pods found matching service name');
      } else {
        const restartCount = servicePods.reduce((sum: number, p: any) => sum + p.restarts, 0);
        const notReadyPods = servicePods.filter((p: any) => p.ready < p.total);
        const failedPods = servicePods.filter((p: any) => p.phase === 'Failed' || p.phase === 'Error');

        findings.push(`- Found ${servicePods.length} pod(s)`);
        findings.push(`- Total restarts: ${restartCount}`);
        
        if (restartCount > 0) {
          findings.push(`  ⚠️ High restart count detected`);
        }
        
        if (notReadyPods.length > 0) {
          findings.push(`  ⚠️ ${notReadyPods.length} pod(s) not ready`);
          notReadyPods.forEach((p: any) => {
            findings.push(`    - ${p.name}: ${p.ready}/${p.total} ready`);
          });
        }
        
        if (failedPods.length > 0) {
          findings.push(`  ❌ ${failedPods.length} pod(s) in failed state`);
          failedPods.forEach((p: any) => {
            findings.push(`    - ${p.name}: ${p.phase}`);
          });
        }
      }

      // Get deployment info
      try {
        const deployJson = await deployments.listDeployments(ns);
        const allDeployments = JSON.parse(deployJson);
        const deployment = allDeployments.find((d: any) => d.name === service);
        
        if (deployment) {
          diagnosis.kubernetes.deployment = deployment;
          findings.push(`- Deployment status: ${deployment.readyReplicas || 0}/${deployment.replicas || 0} replicas ready`);
          
          if (deployment.readyReplicas !== deployment.replicas) {
            findings.push(`  ⚠️ Deployment not fully ready`);
          }
        }
      } catch (e) {
        // Deployment might not exist, skip
      }

      // Get events for the namespace
      const eventsJson = await resources.getEvents(ns);
      const allEvents = JSON.parse(eventsJson);
      const serviceEvents = allEvents.filter((e: any) => 
        e.involvedObject?.name?.includes(service) || 
        e.involvedObject?.name?.startsWith(service)
      );
      
      diagnosis.kubernetes.events = serviceEvents;
      
      if (serviceEvents.length > 0) {
        findings.push(`- Recent events: ${serviceEvents.length}`);
        const warningEvents = serviceEvents.filter((e: any) => e.type === 'Warning');
        const errorEvents = serviceEvents.filter((e: any) => e.type === 'Error');
        
        if (warningEvents.length > 0) {
          findings.push(`  ⚠️ ${warningEvents.length} warning event(s)`);
          warningEvents.slice(0, 3).forEach((e: any) => {
            findings.push(`    - ${e.reason}: ${e.message}`);
          });
        }
        
        if (errorEvents.length > 0) {
          findings.push(`  ❌ ${errorEvents.length} error event(s)`);
          errorEvents.slice(0, 3).forEach((e: any) => {
            findings.push(`    - ${e.reason}: ${e.message}`);
          });
        }
      }

    } catch (e: any) {
      errors.push(`Kubernetes check failed: ${e.message}`);
    }
  } else {
    findings.push('## Kubernetes Status');
    findings.push('⚠️ Kubernetes not configured');
  }

  // 2. ArgoCD checks
  if (config.argocdServer && config.argocdToken) {
    try {
      findings.push('\n## ArgoCD Status');
      
      // Try to find the app by name
      try {
        const appJson = await apps.getApp(service);
        const app = JSON.parse(appJson);
        diagnosis.argocd = { app };
        
        findings.push(`- Sync status: ${app.status?.sync?.status || 'Unknown'}`);
        findings.push(`- Health status: ${app.status?.health?.status || 'Unknown'}`);
        findings.push(`- Last sync revision: ${app.status?.sync?.revision || 'N/A'}`);
        
        if (app.status?.sync?.status !== 'Synced') {
          findings.push(`  ⚠️ Application not synced`);
        }
        
        if (app.status?.health?.status !== 'Healthy') {
          findings.push(`  ⚠️ Application not healthy: ${app.status?.health?.status}`);
        }
        
        // Get diff
        try {
          const diffJson = await apps.getAppDiff(service);
          const diff = JSON.parse(diffJson);
          diagnosis.argocd.diff = diff;
          
          if (diff && diff.diff && diff.diff.length > 0) {
            findings.push(`- ⚠️ Diff detected from Git (${diff.diff.length} changes)`);
            findings.push(`  This indicates a configuration drift`);
          } else {
            findings.push(`- No diff from Git - cluster is in sync`);
          }
        } catch (e) {
          findings.push(`- Could not retrieve diff: ${(e as Error).message}`);
        }
        
        // Get history
        try {
          const historyJson = await apps.getAppHistory(service);
          const history = JSON.parse(historyJson);
          diagnosis.argocd.history = history;
          
          if (history && history.length > 0) {
            findings.push(`- Last deployment: ${history[0].deployedAt || 'Unknown'}`);
            findings.push(`- Revision: ${history[0].revision || 'Unknown'}`);
          }
        } catch (e) {
          findings.push(`- Could not retrieve history: ${(e as Error).message}`);
        }
        
      } catch (e: any) {
        findings.push(`⚠️ ArgoCD application '${service}' not found`);
        findings.push(`  The service might not be managed by ArgoCD`);
      }
      
    } catch (e: any) {
      errors.push(`ArgoCD check failed: ${e.message}`);
    }
  } else {
    findings.push('\n## ArgoCD Status');
    findings.push('⚠️ ArgoCD not configured');
  }

  // 3. Prometheus checks
  if (config.prometheusUrl) {
    try {
      findings.push('\n## Prometheus Metrics');
      
      // Query error rate (last 10 minutes)
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - 600; // 10 minutes ago
      
      try {
        // Common error rate query patterns
        const errorRateQuery = `rate(http_requests_total{job="${service}",code=~"5.."}[5m]) or rate(http_requests_total{namespace="${ns}",code=~"5.."}[5m])`;
        const errorRateJson = await queries.query(errorRateQuery);
        const errorRateData = JSON.parse(errorRateJson);
        
        diagnosis.prometheus = { errorRate: errorRateData };
        
        if (errorRateData && errorRateData.length > 0) {
          const avgErrorRate = errorRateData.reduce((sum: number, r: any) => {
            const val = parseFloat(r.valueStr);
            return sum + (isNaN(val) ? 0 : val);
          }, 0) / errorRateData.length;
          
          findings.push(`- Error rate (5m avg): ${avgErrorRate.toFixed(4)} req/s`);
          
          if (avgErrorRate > 0.01) {
            findings.push(`  ⚠️ Elevated error rate detected`);
          }
        } else {
          findings.push(`- No error rate data available`);
        }
      } catch (e) {
        findings.push(`- Could not query error rate: ${(e as Error).message}`);
      }
      
      // Query latency
      try {
        const latencyQuery = `rate(http_request_duration_seconds_sum{job="${service}"}[5m]) / rate(http_request_duration_seconds_count{job="${service}"}[5m]) or rate(http_request_duration_seconds_sum{namespace="${ns}"}[5m]) / rate(http_request_duration_seconds_count{namespace="${ns}"}[5m])`;
        const latencyJson = await queries.query(latencyQuery);
        const latencyData = JSON.parse(latencyJson);
        
        diagnosis.prometheus = { ...diagnosis.prometheus, latency: latencyData };
        
        if (latencyData && latencyData.length > 0) {
          const avgLatency = latencyData.reduce((sum: number, r: any) => {
            const val = parseFloat(r.valueStr);
            return sum + (isNaN(val) ? 0 : val);
          }, 0) / latencyData.length;
          
          findings.push(`- Latency (5m avg): ${(avgLatency * 1000).toFixed(2)}ms`);
          
          if (avgLatency > 1.0) {
            findings.push(`  ⚠️ High latency detected (>1s)`);
          } else if (avgLatency > 0.5) {
            findings.push(`  ⚠️ Elevated latency detected (>500ms)`);
          }
        } else {
          findings.push(`- No latency data available`);
        }
      } catch (e) {
        findings.push(`- Could not query latency: ${(e as Error).message}`);
      }
      
      // Get firing alerts
      try {
        const firingJson = await queries.getFiringAlerts();
        const firingAlerts = JSON.parse(firingJson);
        const serviceAlerts = firingAlerts.filter((a: any) => 
          a.labels?.job === service || 
          a.labels?.namespace === ns ||
          a.labels?.service === service
        );
        
        diagnosis.prometheus = { ...diagnosis.prometheus, firingAlerts: serviceAlerts };
        
        if (serviceAlerts.length > 0) {
          findings.push(`- ⚠️ ${serviceAlerts.length} firing alert(s) for this service`);
          serviceAlerts.forEach((a: any) => {
            findings.push(`  - ${a.labels?.alertname || 'Unknown'}: ${a.annotations?.description || 'No description'}`);
          });
        } else {
          findings.push(`- No firing alerts for this service`);
        }
      } catch (e) {
        findings.push(`- Could not retrieve firing alerts: ${(e as Error).message}`);
      }
      
    } catch (e: any) {
      errors.push(`Prometheus check failed: ${e.message}`);
    }
  } else {
    findings.push('\n## Prometheus Metrics');
    findings.push('⚠️ Prometheus not configured');
  }

  // 4. PagerDuty checks
  if (config.pagerdutyToken) {
    try {
      findings.push('\n## PagerDuty Incidents');
      
      const incidentsJson = await incidents.listIncidents(['triggered', 'acknowledged']);
      const allIncidents = JSON.parse(incidentsJson);
      const serviceIncidents = allIncidents.filter((i: any) => 
        i.service?.toLowerCase().includes(service.toLowerCase()) ||
        i.title?.toLowerCase().includes(service.toLowerCase())
      );
      
      diagnosis.pagerduty = { incidents: serviceIncidents };
      
      if (serviceIncidents.length > 0) {
        findings.push(`- ⚠️ ${serviceIncidents.length} active incident(s)`);
        serviceIncidents.forEach((i: any) => {
          findings.push(`  - ${i.title} (${i.status})`);
          findings.push(`    Severity: ${i.severity}, Assignee: ${i.assignee || 'Unassigned'}`);
        });
      } else {
        findings.push(`- No active incidents for this service`);
      }
      
    } catch (e: any) {
      errors.push(`PagerDuty check failed: ${e.message}`);
    }
  } else {
    findings.push('\n## PagerDuty Incidents');
    findings.push('⚠️ PagerDuty not configured');
  }

  // Generate human-readable diagnosis
  let diagnosisText = `# Service Diagnosis: ${service}\n\n`;
  diagnosisText += `Namespace: ${ns}\n`;
  diagnosisText += `Generated: ${new Date().toISOString()}\n\n`;
  
  diagnosisText += findings.join('\n');
  
  if (errors.length > 0) {
    diagnosisText += '\n\n## Errors Encountered\n';
    errors.forEach(e => {
      diagnosisText += `- ${e}\n`;
    });
  }
  
  diagnosisText += '\n\n---\n\n';
  diagnosisText += '## Summary\n';
  
  const criticalIssues = findings.filter(f => f.includes('❌')).length;
  const warnings = findings.filter(f => f.includes('⚠️')).length;
  
  if (criticalIssues > 0) {
    diagnosisText += `❌ **CRITICAL**: ${criticalIssues} critical issue(s) detected. Immediate attention required.\n`;
  } else if (warnings > 0) {
    diagnosisText += `⚠️ **WARNING**: ${warnings} warning(s) detected. Investigation recommended.\n`;
  } else {
    diagnosisText += `✅ **HEALTHY**: No critical issues detected. Service appears to be running normally.\n`;
  }
  
  diagnosisText += '\n## Raw Data\n';
  diagnosisText += '```json\n';
  diagnosisText += JSON.stringify(diagnosis, null, 2);
  diagnosisText += '\n```\n';
  
  return diagnosisText;
}
