import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { k8sListPodsSchema, k8sScaleDeploymentSchema } from '../src/lib/schemas';

describe('K8s Schemas', () => {
  describe('k8sListPodsSchema', () => {
    it('should validate valid namespace', () => {
      const result = k8sListPodsSchema.safeParse({ namespace: 'default' });
      expect(result.success).toBe(true);
    });

    it('should validate without namespace', () => {
      const result = k8sListPodsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject invalid namespace format', () => {
      const result = k8sListPodsSchema.safeParse({ namespace: 'Invalid_Namespace' });
      expect(result.success).toBe(false);
    });

    it('should reject empty namespace', () => {
      const result = k8sListPodsSchema.safeParse({ namespace: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('k8sScaleDeploymentSchema', () => {
    it('should validate valid scale request', () => {
      const result = k8sScaleDeploymentSchema.safeParse({
        namespace: 'default',
        name: 'my-app',
        replicas: 3,
        dry_run: true,
      });
      expect(result.success).toBe(true);
    });

    it('should require namespace and name', () => {
      const result = k8sScaleDeploymentSchema.safeParse({
        replicas: 3,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative replica count', () => {
      const result = k8sScaleDeploymentSchema.safeParse({
        namespace: 'default',
        name: 'my-app',
        replicas: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should default dry_run to true', () => {
      const result = k8sScaleDeploymentSchema.safeParse({
        namespace: 'default',
        name: 'my-app',
        replicas: 3,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dry_run).toBe(true);
      }
    });
  });
});
