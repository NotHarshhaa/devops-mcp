import { promises as fs } from 'fs';
import { config } from '../config.js';

export interface AuditEntry {
  timestamp: string;
  tool: string;
  parameters: Record<string, unknown>;
  outcome: 'success' | 'error';
  error?: string;
  tier: 'read' | 'mutate' | 'destructive';
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  if (!config.auditLog) {
    return;
  }
  
  try {
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(config.auditLog, line, 'utf-8');
  } catch (error) {
    // Silently fail audit writes to avoid breaking tool execution
    console.error('Failed to write audit log:', error);
  }
}

export async function auditSuccess(
  tool: string,
  parameters: Record<string, unknown>,
  tier: 'read' | 'mutate' | 'destructive' = 'read'
): Promise<void> {
  await writeAudit({
    timestamp: new Date().toISOString(),
    tool,
    parameters,
    outcome: 'success',
    tier,
  });
}

export async function auditError(
  tool: string,
  parameters: Record<string, unknown>,
  error: string,
  tier: 'read' | 'mutate' | 'destructive' = 'read'
): Promise<void> {
  await writeAudit({
    timestamp: new Date().toISOString(),
    tool,
    parameters,
    outcome: 'error',
    error,
    tier,
  });
}
