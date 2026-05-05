import { config } from '../../config.js';
import * as deployments from '../k8s/deployments.js';
import * as apps from '../argo/apps.js';
import * as queries from '../prom/queries.js';

interface ChangeData {
  service: string;
  namespace: string;
  timeframeMinutes: number;
  argocd?: {
    history: any[];
    lastDeployment?: any;
  };
  kubernetes?: {
    deployment?: any;
    rolloutHistory?: any[];
  };
  prometheus?: {
    errorRate?: any[];
    latency?: any[];
    anomalyWindow?: any;
  };
}

export async function explainChange(service: string, namespace?: string, timeframeMinutes?: number): Promise<string> {
  const ns = namespace || 'default';
  const timeframe = timeframeMinutes || 60;
  const data: ChangeData = {
    service,
    namespace: ns,
    timeframeMinutes: timeframe,
  };

  const findings: string[] = [];
  const errors: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - (timeframe * 60);

  findings.push(`# Change Analysis: ${service}\n`);
  findings.push(`Namespace: ${ns}`);
  findings.push(`Time window: Last ${timeframe} minutes\n`);

  // 1. ArgoCD History
  if (config.argocdServer && config.argocdToken) {
    try {
      findings.push('## ArgoCD Deployment History');
      
      const historyJson = await apps.getAppHistory(service);
      const history = JSON.parse(historyJson);
      
      data.argocd = { history };
      
      if (history && history.length > 0) {
        // Filter deployments within the timeframe
        const recentDeployments = history.filter((h: any) => {
          const deployedAt = h.deployedAt ? new Date(h.deployedAt).getTime() / 1000 : 0;
          return deployedAt >= startTime;
        });
        
        if (recentDeployments.length > 0) {
          findings.push(`- Found ${recentDeployments.length} deployment(s) in the last ${timeframe} minutes`);
          
          recentDeployments.forEach((dep: any, idx: number) => {
            const deployedAt = dep.deployedAt || 'Unknown';
            const revision = dep.revision || 'Unknown';
            const author = dep.author || 'Unknown';
            const source = dep.source || {};
            
            findings.push(`\n  **Deployment ${idx + 1}**:`);
            findings.push(`  - Time: ${deployedAt}`);
            findings.push(`  - Revision: ${revision}`);
            findings.push(`  - Author: ${author}`);
            if (source.repoURL) findings.push(`  - Repo: ${source.repoURL}`);
            if (source.path) findings.push(`  - Path: ${source.path}`);
            if (source.chart) findings.push(`  - Chart: ${source.chart}`);
          });
          
          data.argocd.lastDeployment = recentDeployments[0];
        } else {
          findings.push(`- No deployments in the last ${timeframe} minutes`);
          findings.push(`- Last deployment: ${history[0].deployedAt || 'Unknown'} (revision: ${history[0].revision || 'Unknown'})`);
        }
      } else {
        findings.push(`⚠️ No ArgoCD application found for '${service}'`);
      }
      
    } catch (e: any) {
      errors.push(`ArgoCD check failed: ${e.message}`);
      findings.push(`⚠️ ArgoCD not available or application not found\n`);
    }
  } else {
    findings.push('## ArgoCD Deployment History');
    findings.push('⚠️ ArgoCD not configured\n');
  }

  // 2. Kubernetes Rollout History
  if (config.kubeconfig) {
    try {
      findings.push('## Kubernetes Rollout Status');
      
      const deployJson = await deployments.listDeployments(ns);
      const allDeployments = JSON.parse(deployJson);
      const deployment = allDeployments.find((d: any) => d.name === service);
      
      data.kubernetes = { deployment };
      
      if (deployment) {
        findings.push(`- Deployment: ${deployment.name}`);
        findings.push(`- Replicas: ${deployment.readyReplicas || 0}/${deployment.replicas || 0} ready`);
        findings.push(`- Updated: ${deployment.updated || 'Unknown'}`);
        
        // Check for rollout issues
        if (deployment.readyReplicas !== deployment.replicas) {
          findings.push(`  ⚠️ Deployment not fully ready - possible ongoing rollout`);
        }
        
        // Check image information
        if (deployment.images && deployment.images.length > 0) {
          findings.push(`- Images:`);
          deployment.images.forEach((img: string) => {
            findings.push(`  - ${img}`);
          });
        }
      } else {
        findings.push(`⚠️ No deployment found for '${service}' in namespace '${ns}'`);
      }
      
    } catch (e: any) {
      errors.push(`Kubernetes check failed: ${e.message}`);
      findings.push(`⚠️ Kubernetes not available or deployment not found\n`);
    }
  } else {
    findings.push('## Kubernetes Rollout Status');
    findings.push('⚠️ Kubernetes not configured\n');
  }

  // 3. Prometheus Anomaly Detection
  if (config.prometheusUrl) {
    try {
      findings.push('## Prometheus Metric Anomalies');
      
      const anomalyFindings: string[] = [];
      
      // Query error rate over the timeframe
      try {
        const errorRateQuery = `rate(http_requests_total{job="${service}",code=~"5.."}[5m]) or rate(http_requests_total{namespace="${ns}",code=~"5.."}[5m])`;
        const errorRateRangeJson = await queries.queryRange(
          errorRateQuery,
          startTime.toString(),
          now.toString(),
          '5m'
        );
        const errorRateData = JSON.parse(errorRateRangeJson);
        
        data.prometheus = { errorRate: errorRateData };
        
        if (errorRateData && errorRateData.length > 0) {
          const maxErrorRate = errorRateData.reduce((max: number, r: any) => {
            const values = r.values || [];
            const localMax = values.reduce((m: number, v: any) => {
              const val = parseFloat(v[1]);
              return val > m ? val : m;
            }, 0);
            return localMax > max ? localMax : max;
          }, 0);
          
          findings.push(`- Max error rate (5m window): ${maxErrorRate.toFixed(4)} req/s`);
          
          if (maxErrorRate > 0.01) {
            anomalyFindings.push(`Elevated error rate detected (max: ${maxErrorRate.toFixed(4)})`);
          }
        } else {
          findings.push(`- No error rate data available`);
        }
      } catch (e) {
        findings.push(`- Could not query error rate: ${(e as Error).message}`);
      }
      
      // Query latency over the timeframe
      try {
        const latencyQuery = `rate(http_request_duration_seconds_sum{job="${service}"}[5m]) / rate(http_request_duration_seconds_count{job="${service}"}[5m]) or rate(http_request_duration_seconds_sum{namespace="${ns}"}[5m]) / rate(http_request_duration_seconds_count{namespace="${ns}"}[5m])`;
        const latencyRangeJson = await queries.queryRange(
          latencyQuery,
          startTime.toString(),
          now.toString(),
          '5m'
        );
        const latencyData = JSON.parse(latencyRangeJson);
        
        data.prometheus = { ...data.prometheus, latency: latencyData };
        
        if (latencyData && latencyData.length > 0) {
          const maxLatency = latencyData.reduce((max: number, r: any) => {
            const values = r.values || [];
            const localMax = values.reduce((m: number, v: any) => {
              const val = parseFloat(v[1]);
              return val > m ? val : m;
            }, 0);
            return localMax > max ? localMax : max;
          }, 0);
          
          findings.push(`- Max latency (5m window): ${(maxLatency * 1000).toFixed(2)}ms`);
          
          if (maxLatency > 1.0) {
            anomalyFindings.push(`High latency detected (max: ${(maxLatency * 1000).toFixed(2)}ms)`);
          } else if (maxLatency > 0.5) {
            anomalyFindings.push(`Elevated latency detected (max: ${(maxLatency * 1000).toFixed(2)}ms)`);
          }
        } else {
          findings.push(`- No latency data available`);
        }
      } catch (e) {
        findings.push(`- Could not query latency: ${(e as Error).message}`);
      }
      
      // Query request rate to detect traffic spikes
      try {
        const requestRateQuery = `rate(http_requests_total{job="${service}"}[5m]) or rate(http_requests_total{namespace="${ns}"}[5m])`;
        const requestRateRangeJson = await queries.queryRange(
          requestRateQuery,
          startTime.toString(),
          now.toString(),
          '5m'
        );
        const requestRateData = JSON.parse(requestRateRangeJson);
        
        if (requestRateData && requestRateData.length > 0) {
          const rates = requestRateData.flatMap((r: any) => 
            (r.values || []).map((v: any) => parseFloat(v[1]))
          ).filter((v: number) => !isNaN(v));
          
          if (rates.length > 0) {
            const avgRate = rates.reduce((sum: number, r: number) => sum + r, 0) / rates.length;
            const maxRate = Math.max(...rates);
            const spikeRatio = maxRate / (avgRate || 1);
            
            findings.push(`- Request rate: avg ${avgRate.toFixed(2)} req/s, max ${maxRate.toFixed(2)} req/s`);
            
            if (spikeRatio > 2.0) {
              anomalyFindings.push(`Traffic spike detected (${spikeRatio.toFixed(1)}x above average)`);
            }
          }
        }
      } catch (e) {
        findings.push(`- Could not query request rate: ${(e as Error).message}`);
      }
      
      if (anomalyFindings.length > 0) {
        findings.push(`\n⚠️ **Anomalies detected:**`);
        anomalyFindings.forEach(f => findings.push(`  - ${f}`));
      } else {
        findings.push(`\n✅ No metric anomalies detected`);
      }
      
    } catch (e: any) {
      errors.push(`Prometheus check failed: ${e.message}`);
      findings.push(`⚠️ Prometheus not available\n`);
    }
  } else {
    findings.push('## Prometheus Metric Anomalies');
    findings.push('⚠️ Prometheus not configured\n');
  }

  // Generate summary and correlation analysis
  findings.push('\n---\n');
  findings.push('## Summary & Correlation Analysis\n');
  
  const summary: string[] = [];
  
  // Check for recent deployment correlation
  if (data.argocd?.lastDeployment) {
    const lastDepTime = data.argocd.lastDeployment.deployedAt 
      ? new Date(data.argocd.lastDeployment.deployedAt).getTime() / 1000 
      : 0;
    const timeSinceDeployment = (now - lastDepTime) / 60; // minutes
    
    if (timeSinceDeployment <= timeframe) {
      summary.push(`🔄 **Recent deployment detected**: ${timeSinceDeployment.toFixed(0)} minutes ago`);
      summary.push(`   - Revision: ${data.argocd.lastDeployment.revision || 'Unknown'}`);
      summary.push(`   - Author: ${data.argocd.lastDeployment.author || 'Unknown'}`);
      
      // Check if metrics correlate with deployment
      if (data.prometheus?.errorRate && data.prometheus.errorRate.length > 0) {
        summary.push(`   - ⚠️ Error rate data available - possible deployment issue`);
      }
      if (data.prometheus?.latency && data.prometheus.latency.length > 0) {
        summary.push(`   - ⚠️ Latency data available - possible deployment issue`);
      }
    }
  }
  
  // Check for metric anomalies without deployment
  const hasAnomalies = findings.some(f => f.includes('Anomalies detected') || f.includes('spike') || f.includes('Elevated'));
  if (hasAnomalies && !summary.some(s => s.includes('Recent deployment'))) {
    summary.push(`⚠️ **Metric anomalies detected without recent deployment`);
    summary.push(`   - Possible causes: external dependency issues, traffic pattern changes, or resource constraints`);
  }
  
  // Check Kubernetes rollout status
  if (data.kubernetes?.deployment && data.kubernetes.deployment.readyReplicas !== data.kubernetes.deployment.replicas) {
    summary.push(`⚠️ **Kubernetes rollout incomplete**: ${data.kubernetes.deployment.readyReplicas}/${data.kubernetes.deployment.replicas} replicas ready`);
  }
  
  if (summary.length === 0) {
    summary.push(`✅ **No significant changes detected** in the last ${timeframe} minutes`);
    summary.push(`   - Service appears stable`);
  }
  
  findings.push(summary.join('\n'));
  
  if (errors.length > 0) {
    findings.push('\n\n## Errors Encountered\n');
    errors.forEach(e => {
      findings.push(`- ${e}`);
    });
  }
  
  findings.push('\n\n---\n');
  findings.push('## Raw Data\n');
  findings.push('```json\n');
  findings.push(JSON.stringify(data, null, 2));
  findings.push('\n```\n');
  
  return findings.join('\n');
}
