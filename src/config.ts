import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  // Kubernetes
  kubeconfig?: string;
  k8sContext?: string;
  k8sAllowedNamespaces?: string[];
  
  // ArgoCD
  argocdServer?: string;
  argocdToken?: string;
  
  // Prometheus
  prometheusUrl?: string;
  prometheusBearerToken?: string;
  
  // PagerDuty
  pagerdutyToken?: string;
  
  // Loki
  lokiUrl?: string;
  lokiToken?: string;
  
  // SSE transport (only when not using stdio)
  port?: number;
  mcpAuthToken?: string;
  
  // Safety
  dryRun: boolean;
  auditLog?: string;
}

export function loadConfig(): Config {
  return {
    // Kubernetes
    kubeconfig: process.env.KUBECONFIG,
    k8sContext: process.env.K8S_CONTEXT,
    k8sAllowedNamespaces: process.env.K8S_ALLOWED_NAMESPACES?.split(',').map((s: string) => s.trim()).filter(Boolean),
    
    // ArgoCD
    argocdServer: process.env.ARGOCD_SERVER,
    argocdToken: process.env.ARGOCD_TOKEN,
    
    // Prometheus
    prometheusUrl: process.env.PROMETHEUS_URL,
    prometheusBearerToken: process.env.PROMETHEUS_BEARER_TOKEN,
    
    // PagerDuty
    pagerdutyToken: process.env.PAGERDUTY_TOKEN,
    
    // Loki
    lokiUrl: process.env.LOKI_URL,
    lokiToken: process.env.LOKI_TOKEN,
    
    // SSE transport (only when not using stdio)
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    mcpAuthToken: process.env.MCP_AUTH_TOKEN,
    
    // Safety
    dryRun: process.env.DEVOPS_MCP_DRY_RUN === 'true',
    auditLog: process.env.DEVOPS_MCP_AUDIT_LOG,
  };
}

export const config = loadConfig();
