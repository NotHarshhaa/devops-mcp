import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../../config.js';

const execFileAsync = promisify(execFile);

export class HelmClient {
  private available: boolean | null = null;

  private buildArgs(args: string[]): string[] {
    const result = [...args];
    if (config.kubeconfig) result.push('--kubeconfig', config.kubeconfig);
    if (config.k8sContext) result.push('--kube-context', config.k8sContext);
    return result;
  }

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      await execFileAsync('helm', ['version', '--short']);
      this.available = true;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async run(args: string[]): Promise<string> {
    const fullArgs = this.buildArgs(args);
    const { stdout } = await execFileAsync('helm', fullArgs, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  }

  async runJson(args: string[]): Promise<any> {
    const output = await this.run([...args, '--output', 'json']);
    return JSON.parse(output);
  }
}

let client: HelmClient | null = null;

export function getHelmClient(): HelmClient {
  if (!client) client = new HelmClient();
  return client;
}
