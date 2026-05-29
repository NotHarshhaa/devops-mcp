import { config } from '../../config.js';
import * as pods from './pods.js';
import * as deployments from './deployments.js';
import * as resources from './resources.js';
import * as nodes from './nodes.js';
import * as network from './network.js';
import * as diff from './diff.js';
import * as workloads from './workloads.js';
import { requireK8sConfig } from './client.js';

export function getToolDefinitions() {
  // Skip if Kubernetes is not configured
  if (!config.kubeconfig) {
    try {
      requireK8sConfig();
    } catch {
      return [];
    }
  }

  return [
    {
      name: 'k8s__list_pods',
      description: 'List pods with status, restarts, node, and age',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace (default: default)' },
        },
      },
    },
    {
      name: 'k8s__get_pod_logs',
      description: 'Get logs from a pod container',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string' },
          pod: { type: 'string' },
          container: { type: 'string' },
          tailLines: { type: 'number' },
          follow: { type: 'boolean' },
        },
        required: ['namespace', 'pod'],
      },
    },
    {
      name: 'k8s__describe_resource',
      description: 'Full describe for any resource type',
      inputSchema: {
        type: 'object',
        properties: {
          resourceType: { type: 'string' },
          name: { type: 'string' },
          namespace: { type: 'string' },
        },
        required: ['resourceType', 'name'],
      },
    },
    {
      name: 'k8s__get_events',
      description: 'Cluster or namespace events, filterable by reason',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string' },
          reasonFilter: { type: 'string' },
        },
      },
    },
    {
      name: 'k8s__list_deployments',
      description: 'Deployments with replica counts and rollout health',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string' },
        },
      },
    },
    {
      name: 'k8s__get_resource_usage',
      description: 'CPU/mem usage per pod via metrics-server',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string' },
        },
      },
    },
    {
      name: 'k8s__list_contexts',
      description: 'All kubeconfig contexts and the active one',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'k8s__switch_context',
      description: 'Switch active context (session-scoped)',
      inputSchema: {
        type: 'object',
        properties: {
          contextName: { type: 'string' },
        },
        required: ['contextName'],
      },
    },
    {
      name: 'k8s__scale_deployment',
      description: 'Scale replicas with dry-run diff preview',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string' },
          name: { type: 'string' },
          replicas: { type: 'number' },
          dry_run: { type: 'boolean' },
        },
        required: ['namespace', 'name', 'replicas'],
      },
    },
    {
      name: 'k8s__rollout_restart',
      description: 'Trigger rolling restart of a deployment',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string' },
          name: { type: 'string' },
          dry_run: { type: 'boolean' },
        },
        required: ['namespace', 'name'],
      },
    },
    {
      name: 'k8s__apply_manifest',
      description: 'Apply a manifest string with server-side dry-run',
      inputSchema: {
        type: 'object',
        properties: {
          manifest: { type: 'string', description: 'YAML or JSON manifest string' },
          namespace: { type: 'string', description: 'Namespace to apply in (default: from manifest or "default")' },
          dry_run: { type: 'boolean', description: 'Server-side dry-run (default: true)' },
        },
        required: ['manifest'],
      },
    },
    {
      name: 'k8s__delete_resource',
      description: 'Delete a named resource — requires confirm: true',
      inputSchema: {
        type: 'object',
        properties: {
          resourceType: { type: 'string' },
          name: { type: 'string' },
          namespace: { type: 'string' },
          confirm: { type: 'boolean' },
        },
        required: ['resourceType', 'name', 'confirm'],
      },
    },
    {
      name: 'k8s__get_node_status',
      description: 'Get node status with conditions, capacity, allocatable, labels, and taints',
      inputSchema: {
        type: 'object',
        properties: {
          nodeName: { type: 'string', description: 'Node name (omit to list all nodes)' },
        },
      },
    },
    {
      name: 'k8s__get_network_policies',
      description: 'List network policies with podSelector, ingress/egress rules',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace (default: default)' },
        },
      },
    },
    {
      name: 'k8s__get_ingresses',
      description: 'List ingresses with hosts, paths, backends, and TLS config',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace (default: default)' },
        },
      },
    },
    {
      name: 'k8s__diff_resource',
      description: 'Compare current resource state against last-applied-configuration annotation to show drift',
      inputSchema: {
        type: 'object',
        properties: {
          resourceType: { type: 'string', description: 'Resource type: deployment, service, configmap, statefulset, daemonset' },
          name: { type: 'string', description: 'Resource name' },
          namespace: { type: 'string', description: 'Namespace (default: default)' },
        },
        required: ['resourceType', 'name'],
      },
    },
    {
      name: 'k8s__list_cronjobs',
      description: 'List cronjobs with schedule, suspend status, active jobs, and last run times',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace (default: default)' },
        },
      },
    },
    {
      name: 'k8s__get_cronjob_status',
      description: 'Detailed status of a specific cronjob including recent job history',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'CronJob name' },
          namespace: { type: 'string', description: 'Namespace (default: default)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'k8s__list_services',
      description: 'List services with type, clusterIP, ports, selector, and externalIPs',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace (default: default)' },
        },
      },
    },
    {
      name: 'k8s__list_pvcs',
      description: 'List PersistentVolumeClaims with status, capacity, accessModes, and storageClass',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace (default: default)' },
        },
      },
    },
    {
      name: 'k8s__get_hpa',
      description: 'Get HorizontalPodAutoscaler details with metrics, replicas, and conditions',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: { type: 'string', description: 'Namespace (default: default)' },
          name: { type: 'string', description: 'HPA name (omit to list all)' },
        },
      },
    },
  ];
}

export async function handleTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'k8s__list_pods':
      return await pods.listPods(args?.namespace);
    case 'k8s__get_pod_logs':
      return await pods.getPodLogs(
        args.namespace,
        args.pod,
        args.container,
        args.tailLines,
        args.follow || false
      );
    case 'k8s__describe_resource':
      return await resources.describeResource(
        args.resourceType,
        args.name,
        args.namespace
      );
    case 'k8s__get_events':
      return await resources.getEvents(args.namespace, args.reasonFilter);
    case 'k8s__list_deployments':
      return await deployments.listDeployments(args.namespace);
    case 'k8s__get_resource_usage':
      return await pods.getResourceUsage(args.namespace);
    case 'k8s__list_contexts':
      return await resources.listContexts();
    case 'k8s__switch_context':
      return await resources.switchContext(args.contextName);
    case 'k8s__scale_deployment':
      return await deployments.scaleDeployment(
        args.namespace,
        args.name,
        args.replicas,
        args.dry_run !== false
      );
    case 'k8s__rollout_restart':
      return await deployments.rolloutRestart(
        args.namespace,
        args.name,
        args.dry_run !== false
      );
    case 'k8s__apply_manifest':
      return await resources.applyManifest(
        args.manifest,
        args.namespace,
        args.dry_run !== false
      );
    case 'k8s__delete_resource':
      return await resources.deleteResource(
        args.resourceType,
        args.name,
        args.namespace,
        args.confirm === true
      );
    case 'k8s__get_node_status':
      return await nodes.getNodeStatus(args?.nodeName);
    case 'k8s__get_network_policies':
      return await network.getNetworkPolicies(args?.namespace);
    case 'k8s__get_ingresses':
      return await network.getIngresses(args?.namespace);
    case 'k8s__diff_resource':
      return JSON.stringify(await diff.diffResource(args.resourceType, args.name, args.namespace), null, 2);
    case 'k8s__list_cronjobs':
      return await workloads.listCronJobs(args?.namespace);
    case 'k8s__get_cronjob_status':
      return await workloads.getCronJobStatus(args.name, args?.namespace);
    case 'k8s__list_services':
      return await workloads.listServices(args?.namespace);
    case 'k8s__list_pvcs':
      return await workloads.listPVCs(args?.namespace);
    case 'k8s__get_hpa':
      return await workloads.getHPA(args?.namespace, args?.name);
    default:
      throw new Error(`Unknown Kubernetes tool: ${name}`);
  }
}
