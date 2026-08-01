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

  // Stateless Streamable HTTP (stdio remains the default entry point)
  port: number;
  httpHost: string;
  mcpAuthToken?: string;
  mcpAllowedHosts?: string[];
  mcpAllowedOrigins?: string[];
  mcpCacheTtlMs: number;
  mcpRequestStateSecret?: string;

  // Safety
  dryRun: boolean;
  auditLog?: string;
}

function parseCsv(value: string | undefined): string[] | undefined {
  const values = value?.split(',').map(item => item.trim()).filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

function parseInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseRequestStateSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('MCP_REQUEST_STATE_SECRET must contain at least 32 bytes');
  }
  return value;
}

export function loadConfig(): Config {
  return {
    kubeconfig: process.env.KUBECONFIG,
    k8sContext: process.env.K8S_CONTEXT,
    k8sAllowedNamespaces: parseCsv(process.env.K8S_ALLOWED_NAMESPACES),

    argocdServer: process.env.ARGOCD_SERVER,
    argocdToken: process.env.ARGOCD_TOKEN,

    prometheusUrl: process.env.PROMETHEUS_URL,
    prometheusBearerToken: process.env.PROMETHEUS_BEARER_TOKEN,

    pagerdutyToken: process.env.PAGERDUTY_TOKEN,

    lokiUrl: process.env.LOKI_URL,
    lokiToken: process.env.LOKI_TOKEN,

    port: parseInteger('PORT', process.env.PORT, 3000, 1, 65_535),
    httpHost: process.env.MCP_HTTP_HOST || '127.0.0.1',
    mcpAuthToken: process.env.MCP_AUTH_TOKEN,
    mcpAllowedHosts: parseCsv(process.env.MCP_ALLOWED_HOSTS),
    mcpAllowedOrigins: parseCsv(process.env.MCP_ALLOWED_ORIGINS),
    mcpCacheTtlMs: parseInteger(
      'MCP_CACHE_TTL_MS',
      process.env.MCP_CACHE_TTL_MS,
      60_000,
      0,
      86_400_000
    ),
    mcpRequestStateSecret: parseRequestStateSecret(process.env.MCP_REQUEST_STATE_SECRET),

    dryRun: process.env.DEVOPS_MCP_DRY_RUN === 'true',
    auditLog: process.env.DEVOPS_MCP_AUDIT_LOG,
  };
}

export const config = loadConfig();
