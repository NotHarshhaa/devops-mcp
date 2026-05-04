import { config } from '../../config.js';
import { requireConfig } from '../../lib/errors.js';

export class PrometheusClient {
  private baseUrl: string;
  private bearerToken?: string;

  constructor() {
    requireConfig(config.prometheusUrl, 'PROMETHEUS_URL');
    
    this.baseUrl = config.prometheusUrl!;
    this.bearerToken = config.prometheusBearerToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Prometheus API error: ${response.status} ${text}`);
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
}

let client: PrometheusClient | null = null;

export function getPromClient(): PrometheusClient {
  if (!client) {
    client = new PrometheusClient();
  }
  return client;
}
