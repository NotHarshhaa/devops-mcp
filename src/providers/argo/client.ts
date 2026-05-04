import { config } from '../../config.js';
import { requireConfig } from '../../lib/errors.js';

export class ArgoCDClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    requireConfig(config.argocdServer, 'ARGOCD_SERVER');
    requireConfig(config.argocdToken, 'ARGOCD_TOKEN');
    
    this.baseUrl = config.argocdServer!;
    this.token = config.argocdToken!;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ArgoCD API error: ${response.status} ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async get(path: string): Promise<any> {
    return this.request(path, { method: 'GET' });
  }

  async post(path: string, body: any): Promise<any> {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async delete(path: string): Promise<any> {
    return this.request(path, { method: 'DELETE' });
  }
}

let client: ArgoCDClient | null = null;

export function getArgoClient(): ArgoCDClient {
  if (!client) {
    client = new ArgoCDClient();
  }
  return client;
}
