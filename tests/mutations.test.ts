import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@kubernetes/client-node', () => ({}));

import { config } from '../src/config';
import { switchContext } from '../src/providers/k8s/resources';
import { scaleDeployment } from '../src/providers/k8s/deployments';
import * as k8sClient from '../src/providers/k8s/client';
import { rollbackRelease } from '../src/providers/helm/releases';
import * as helmClient from '../src/providers/helm/client';

describe('provider mutation previews', () => {
  const originalDryRun = config.dryRun;
  const originalAllowedNamespaces = config.k8sAllowedNamespaces;

  beforeEach(() => {
    config.dryRun = false;
    config.k8sAllowedNamespaces = undefined;
  });

  afterEach(() => {
    config.dryRun = originalDryRun;
    config.k8sAllowedNamespaces = originalAllowedNamespaces;
    jest.restoreAllMocks();
  });

  it('keeps Helm rollback guarded at the operation boundary', async () => {
    const run = jest.fn(async () => 'rollback preview');
    jest.spyOn(helmClient, 'getHelmClient').mockReturnValue({
      run,
    } as unknown as ReturnType<typeof helmClient.getHelmClient>);

    const preview = JSON.parse(await rollbackRelease('payments', 3, 'production'));

    expect(preview).toMatchObject({ dryRun: true, success: true });
    expect(run).toHaveBeenCalledWith([
      'rollback', 'payments', '3', '--namespace', 'production', '--dry-run',
    ]);

    config.dryRun = true;
    await expect(rollbackRelease('payments', 3, 'production', false))
      .rejects.toThrow('Global dry-run mode is enabled');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not allow runtime context selection to mutate shared process state', async () => {
    const setCurrentContext = jest.fn();
    jest.spyOn(k8sClient, 'getKubeConfig').mockReturnValue({
      getContexts: () => [{ name: 'staging' }, { name: 'production' }],
      getCurrentContext: () => 'staging',
      setCurrentContext,
    } as unknown as ReturnType<typeof k8sClient.getKubeConfig>);

    const preview = JSON.parse(await switchContext('production'));
    expect(preview).toMatchObject({
      dryRun: true,
      currentContext: 'staging',
      targetContext: 'production',
    });
    await expect(switchContext('production', false)).rejects.toThrow(
      'Runtime Kubernetes context switching is disabled'
    );
    expect(setCurrentContext).not.toHaveBeenCalled();
  });

  it('uses the Kubernetes default of one replica in scale previews', async () => {
    const readNamespacedDeployment = jest.fn(async () => ({ spec: {} }));
    const replaceNamespacedDeployment = jest.fn(async () => ({}));
    jest.spyOn(k8sClient, 'getAppsV1').mockReturnValue({
      readNamespacedDeployment,
      replaceNamespacedDeployment,
    } as unknown as ReturnType<typeof k8sClient.getAppsV1>);

    const preview = JSON.parse(await scaleDeployment('default', 'payments', 4));

    expect(preview).toMatchObject({
      dryRun: true,
      currentReplicas: 1,
      newReplicas: 4,
    });
    expect(replaceNamespacedDeployment).not.toHaveBeenCalled();
  });
});
