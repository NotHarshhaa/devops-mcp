import { config } from '../config.js';
import { auditError, auditSuccess } from './audit.js';

export class DryRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DryRunError';
  }
}

export function enforceDryRun(
  tool: string,
  parameters: Record<string, unknown>,
  tier: 'mutate' | 'destructive'
): void {
  const dryRun = parameters.dry_run as boolean | undefined;
  
  // Global dry-run override
  if (config.dryRun && dryRun !== false) {
    throw new DryRunError(
      `Global dry-run mode is enabled. Set dry_run=false to execute. Tool: ${tool}`
    );
  }
  
  // Default dry-run for mutate operations
  if (tier === 'mutate' && dryRun !== false) {
    throw new DryRunError(
      `Mutating operation requires dry_run=false to execute. Tool: ${tool}`
    );
  }
  
  // Destructive operations require confirm=true
  if (tier === 'destructive') {
    const confirm = parameters.confirm as boolean | undefined;
    if (!confirm) {
      throw new Error(
        `Destructive operation requires confirm=true. Tool: ${tool}`
      );
    }
  }
}

export async function withDryRunGuard<T>(
  tool: string,
  parameters: Record<string, unknown>,
  tier: 'read' | 'mutate' | 'destructive',
  fn: () => Promise<T>
): Promise<T> {
  if (tier !== 'read') {
    enforceDryRun(tool, parameters, tier);
  }
  
  try {
    const result = await fn();
    await auditSuccess(tool, parameters, tier);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await auditError(tool, parameters, errorMessage, tier);
    throw error;
  }
}
