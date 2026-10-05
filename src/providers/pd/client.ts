import { config } from '../../config.js';
import { requireConfig } from '../../lib/errors.js';

export class PagerDutyClient {
  private baseUrl = 'https://api.pagerduty.com';
  private token: string;

  constructor() {
    requireConfig(config.pagerdutyToken, 'PAGERDUTY_TOKEN');
    
    this.token = config.pagerdutyToken!;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${this.baseUrl}${cleanPath}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Token token=${this.token}`,
      'Accept': 'application/vnd.pagerduty+json;version=2',
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (config.pagerdutyUserEmail && !headers['From']) {
      headers['From'] = config.pagerdutyUserEmail;
    }

    const response = await fetch(url, {
      signal: options.signal || AbortSignal.timeout(30_000),
      ...options,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PagerDuty API error: ${response.status} ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async get(path: string): Promise<any> {
    return this.request(path, { method: 'GET' });
  }

  async put(path: string, body: any): Promise<any> {
    return this.request(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async post(path: string, body: any): Promise<any> {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}

let client: PagerDutyClient | null = null;

export function getPdClient(): PagerDutyClient {
  if (!client) {
    client = new PagerDutyClient();
  }
  return client;
}
