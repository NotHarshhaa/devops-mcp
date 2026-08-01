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
  const dryRun = parameters.dry_run;

  // Mutating tools must always make their execution intent explicit. Handlers
  // normalize an omitted dry_run parameter to true before reaching this guard.
  if (tier === 'mutate' && typeof dryRun !== 'boolean') {
    throw new DryRunError(
      `Mutating operation requires a boolean dry_run parameter. Tool: ${tool}`
    );
  }

  // Global dry-run permits safe previews but can never be overridden to execute.
  // Destructive tools do not have a preview mode, so they are always blocked.
  if (config.dryRun && (tier === 'destructive' || dryRun === false)) {
    throw new DryRunError(
      `Global dry-run mode is enabled; execution is blocked. Tool: ${tool}`
    );
  }

  // Destructive operations additionally require explicit confirmation.
  if (tier === 'destructive' && parameters.confirm !== true) {
    throw new Error(
      `Destructive operation requires confirm=true. Tool: ${tool}`
    );
  }
}

export async function withDryRunGuard<T>(
  tool: string,
  parameters: Record<string, unknown>,
  tier: 'read' | 'mutate' | 'destructive',
  fn: () => Promise<T>
): Promise<T> {
  try {
    if (tier !== 'read') {
      enforceDryRun(tool, parameters, tier);
    }

    const result = await fn();
    await auditSuccess(tool, parameters, tier);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await auditError(tool, parameters, errorMessage, tier);
    throw error;
  }
}
