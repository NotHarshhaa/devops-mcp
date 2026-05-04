import { getPromClient } from './client.js';

export async function query(query: string): Promise<string> {
  const client = getPromClient();
  const result = await client.get(`/api/v1/query?query=${encodeURIComponent(query)}`);
  
  if (result.status !== 'success') {
    throw new Error(`Prometheus query failed: ${result.error}`);
  }

  const formatted = result.data.result.map((r: any) => ({
    metric: r.metric,
    value: r.value,
    timestamp: r.value[0],
    valueStr: r.value[1],
  }));

  return JSON.stringify(formatted, null, 2);
}

export async function queryRange(
  query: string,
  start: string,
  end: string,
  step: string
): Promise<string> {
  const client = getPromClient();
  const params = new URLSearchParams({
    query,
    start,
    end,
    step,
  });
  
  const result = await client.get(`/api/v1/query_range?${params.toString()}`);
  
  if (result.status !== 'success') {
    throw new Error(`Prometheus range query failed: ${result.error}`);
  }

  const formatted = result.data.result.map((r: any) => ({
    metric: r.metric,
    values: r.values,
  }));

  return JSON.stringify(formatted, null, 2);
}

export async function listAlerts(): Promise<string> {
  const client = getPromClient();
  const result = await client.get('/api/v1/rules');
  
  const alerts = result.data.groups.flatMap((g: any) => 
    g.rules.map((r: any) => ({
      name: r.name,
      type: r.type,
      state: r.state,
      query: r.query,
      duration: r.duration,
      labels: r.labels,
      annotations: r.annotations,
    }))
  );

  return JSON.stringify(alerts, null, 2);
}

export async function getFiringAlerts(): Promise<string> {
  const client = getPromClient();
  const result = await client.get('/api/v1/alerts');
  
  const firing = result.data.alerts
    .filter((a: any) => a.state === 'firing')
    .map((a: any) => ({
      labels: a.labels,
      annotations: a.annotations,
      state: a.state,
      activeAt: a.activeAt,
      value: a.value,
    }));

  return JSON.stringify(firing, null, 2);
}

export async function listTargets(): Promise<string> {
  const client = getPromClient();
  const result = await client.get('/api/v1/targets');
  
  const targets = result.data.activeTargets.map((t: any) => ({
    labels: t.labels,
    health: t.health,
    lastScrape: t.lastScrape,
    lastError: t.lastError,
    scrapeUrl: t.scrapeUrl,
  }));

  return JSON.stringify(targets, null, 2);
}

export async function labelValues(label: string): Promise<string> {
  const client = getPromClient();
  const result = await client.get(`/api/v1/label/${label}/values`);
  
  return JSON.stringify(result.data, null, 2);
}

export async function metricMetadata(metric: string): Promise<string> {
  const client = getPromClient();
  const result = await client.get(`/api/v1/metadata/${metric}`);
  
  return JSON.stringify(result.data, null, 2);
}
