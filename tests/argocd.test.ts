import { describe, it, expect } from '@jest/globals';
import { argoSyncAppSchema, argoSyncOptionsSchema } from '../src/lib/schemas';

describe('ArgoCD Schemas', () => {
  describe('argoSyncOptionsSchema', () => {
    it('should validate sync options', () => {
      const result = argoSyncOptionsSchema.safeParse({
        dryRun: true,
        prune: false,
        force: false,
      });
      expect(result.success).toBe(true);
    });

    it('should default values', () => {
      const result = argoSyncOptionsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dryRun).toBe(true);
        expect(result.data.prune).toBe(false);
        expect(result.data.force).toBe(false);
      }
    });
  });

  describe('argoSyncAppSchema', () => {
    it('should validate sync app request', () => {
      const result = argoSyncAppSchema.safeParse({
        name: 'my-app',
        dry_run: false,
        prune: true,
      });
      expect(result.success).toBe(true);
    });

    it('should require app name', () => {
      const result = argoSyncAppSchema.safeParse({
        dry_run: false,
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty app name', () => {
      const result = argoSyncAppSchema.safeParse({
        name: '',
      });
      expect(result.success).toBe(false);
    });
  });
});
