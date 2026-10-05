import { config } from '../../config.js';
import { requireConfig } from '../../lib/errors.js';

export class PrometheusClient {
  private baseUrl: string;
  private bearerToken?: string;

  constructor() {
    requireConfig(config.prometheusUrl, 'PROMETHEUS_URL');
    
    this.baseUrl = config.prometheusUrl!.replace(/\/+$/, '');
    this.bearerToken = config.prometheusBearerToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${this.baseUrl}${cleanPath}`;
    
    const headers: Record<string, string> = {
      ...options.headers as Record<string, string>,
    };

    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    const response = await fetch(url, {
      signal: options.signal || AbortSignal.timeout(30_000),
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
    const isUrlEncoded = body instanceof URLSearchParams;
    return this.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': isUrlEncoded
          ? 'application/x-www-form-urlencoded'
          : 'application/json',
      },
      body: isUrlEncoded ? body.toString() : JSON.stringify(body),
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
