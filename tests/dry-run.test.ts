import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { config } from '../src/config';
import { DryRunError, enforceDryRun, withDryRunGuard } from '../src/lib/dry-run';
import { rollbackApp, terminateOp } from '../src/providers/argo/apps';
import { acknowledgeIncident, addNote } from '../src/providers/pd/incidents';

describe('mutation safety', () => {
  const originalDryRun = config.dryRun;

  beforeEach(() => {
    config.dryRun = false;
  });

  afterEach(() => {
    config.dryRun = originalDryRun;
  });

  it('allows a dry-run callback to produce a preview', async () => {
    const operation = jest.fn(async () => 'preview');

    await expect(
      withDryRunGuard('test__mutate', { dry_run: true }, 'mutate', operation)
    ).resolves.toBe('preview');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a mutate call has no normalized dry_run intent', () => {
    expect(() => enforceDryRun('test__mutate', {}, 'mutate')).toThrow(DryRunError);
  });

  it('does not allow dry_run=false to bypass global dry-run mode', async () => {
    config.dryRun = true;
    const operation = jest.fn(async () => 'executed');

    await expect(
      withDryRunGuard('test__mutate', { dry_run: false }, 'mutate', operation)
    ).rejects.toThrow('Global dry-run mode is enabled');
    expect(operation).not.toHaveBeenCalled();
  });

  it('still allows safe previews while global dry-run mode is enabled', async () => {
    config.dryRun = true;

    await expect(
      withDryRunGuard('test__mutate', { dry_run: true }, 'mutate', async () => 'preview')
    ).resolves.toBe('preview');
  });

  it('requires confirmation and blocks destructive calls in global dry-run mode', () => {
    expect(() => enforceDryRun('test__delete', { confirm: false }, 'destructive'))
      .toThrow('confirm=true');

    config.dryRun = true;
    expect(() => enforceDryRun('test__delete', { confirm: true }, 'destructive'))
      .toThrow('Global dry-run mode is enabled');
  });

  it('provides previews for ArgoCD mutations without contacting ArgoCD', async () => {
    await expect(rollbackApp('payments', 3)).resolves.toContain('Would roll back');
    await expect(terminateOp('payments', 'operation-1')).resolves.toContain('Would terminate');
  });

  it('provides previews for PagerDuty mutations without contacting PagerDuty', async () => {
    await expect(acknowledgeIncident('P123')).resolves.toContain('Would acknowledge');
    await expect(addNote('P123', 'Investigating')).resolves.toContain('Would add a note');
  });
});
