import { z } from 'zod';

// Common schemas
export const namespaceSchema = z.string().min(1).regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);

export const labelSelectorSchema = z.record(z.string(), z.string());

export const resourceNameSchema = z.string().min(1).max(253);

export const replicaCountSchema = z.number().int().min(0);

// Kubernetes-specific schemas
export const k8sResourceTypeSchema = z.enum([
  'pod',
  'service',
  'configmap',
  'secret',
  'deployment',
  'statefulset',
  'daemonset',
  'job',
  'cronjob',
]);

export const k8sContextSchema = z.string().min(1);

// ArgoCD-specific schemas
export const argoAppSchema = z.object({
  name: z.string().min(1),
  namespace: z.string().optional(),
});

export const argoSyncOptionsSchema = z.object({
  dryRun: z.boolean().default(true),
  prune: z.boolean().default(false),
  force: z.boolean().default(false),
});

// Prometheus-specific schemas
export const promQueryStringSchema = z.string().min(1);

export const promRangeQuerySchema = z.object({
  query: z.string().min(1),
  start: z.string(), // ISO timestamp or duration
  end: z.string(), // ISO timestamp or duration
  step: z.string(), // duration like "15s", "1m"
});

// PagerDuty-specific schemas
export const pdIncidentIdSchema = z.string().min(1);

export const pdEscalationPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

// Tool parameter schemas
export const k8sListPodsSchema = z.object({
  namespace: namespaceSchema.optional(),
});

export const k8sGetPodLogsSchema = z.object({
  namespace: namespaceSchema,
  pod: resourceNameSchema,
  container: z.string().optional(),
  tailLines: z.number().int().positive().optional(),
  follow: z.boolean().default(false),
});

export const k8sDescribeResourceSchema = z.object({
  resourceType: k8sResourceTypeSchema,
  name: resourceNameSchema,
  namespace: namespaceSchema.optional(),
});

export const k8sScaleDeploymentSchema = z.object({
  namespace: namespaceSchema,
  name: resourceNameSchema,
  replicas: replicaCountSchema,
  dry_run: z.boolean().default(true),
});

export const k8sDeleteResourceSchema = z.object({
  resourceType: k8sResourceTypeSchema,
  name: resourceNameSchema,
  namespace: namespaceSchema.optional(),
  confirm: z.literal(true).optional(),
});

export const argoSyncAppSchema = z.object({
  name: resourceNameSchema,
  dry_run: z.boolean().default(true),
  prune: z.boolean().default(false),
  force: z.boolean().default(false),
});

export const promQuerySchema = z.object({
  query: promQueryStringSchema,
});

export const promQueryRangeSchema = promRangeQuerySchema;

export const pdAcknowledgeIncidentSchema = z.object({
  id: pdIncidentIdSchema,
});

export const pdAddNoteSchema = z.object({
  incidentId: pdIncidentIdSchema,
  note: z.string().min(1),
});

export const pdEscalateIncidentSchema = z.object({
  id: pdIncidentIdSchema,
  escalationPolicyId: z.string().min(1),
  confirm: z.literal(true).optional(),
});
