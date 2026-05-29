import * as k8s from '@kubernetes/client-node';
import { config } from '../../config.js';
import { requireConfig } from '../../lib/errors.js';

let kc: k8s.KubeConfig | null = null;
let coreV1: k8s.CoreV1Api | null = null;
let appsV1: k8s.AppsV1Api | null = null;
let metricsV: k8s.Metrics | null = null;

export function getKubeConfig(): k8s.KubeConfig {
  if (kc) return kc;

  kc = new k8s.KubeConfig();
  
  if (config.kubeconfig) {
    kc.loadFromFile(config.kubeconfig);
  } else {
    // Try in-cluster config
    try {
      kc.loadFromCluster();
    } catch (error) {
      throw new Error('Could not load kubeconfig. Set KUBECONFIG or run in-cluster.');
    }
  }

  if (config.k8sContext) {
    const context = kc.getContexts().find(c => c.name === config.k8sContext);
    if (!context) {
      throw new Error(`Context "${config.k8sContext}" not found in kubeconfig`);
    }
    kc.setCurrentContext(config.k8sContext);
  }

  return kc;
}

export function getCoreV1(): k8s.CoreV1Api {
  if (!coreV1) {
    const kubeConfig = getKubeConfig();
    coreV1 = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }
  return coreV1;
}

export function getAppsV1(): k8s.AppsV1Api {
  if (!appsV1) {
    const kubeConfig = getKubeConfig();
    appsV1 = kubeConfig.makeApiClient(k8s.AppsV1Api);
  }
  return appsV1;
}

export function getMetrics(): k8s.Metrics {
  if (!metricsV) {
    const kubeConfig = getKubeConfig();
    metricsV = new k8s.Metrics(kubeConfig);
  }
  return metricsV;
}

export function checkNamespaceAllowed(namespace: string): boolean {
  if (!config.k8sAllowedNamespaces || config.k8sAllowedNamespaces.length === 0) {
    return true;
  }
  return config.k8sAllowedNamespaces.includes(namespace);
}

export function resetClients(): void {
  coreV1 = null;
  appsV1 = null;
  metricsV = null;
}

export function requireK8sConfig(): void {
  if (!config.kubeconfig) {
    try {
      getKubeConfig(); // Will try in-cluster
    } catch {
      requireConfig(config.kubeconfig, 'KUBECONFIG');
    }
  }
}
