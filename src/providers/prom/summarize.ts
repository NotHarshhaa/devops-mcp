import * as queries from './queries.js';

interface HealthSummary {
  service: string;
  namespace?: string;
  timeframeMinutes: number;
  sloThreshold: number;
  latency?: {
    current: number;
    previous: number;
    change: number;
    changePercent: number;
  };
  errorRate?: {
    current: number;
    previous: number;
    sloThreshold: number;
    crossedSLO: boolean;
  };
  traffic?: {
    current: number;
    previous: number;
    change: number;
    changePercent: number;
  };
}

export async function summarizeServiceHealth(
  service: string,
  namespace?: string,
  timeframeMinutes: number = 30,
  sloThreshold: number = 0.05
): Promise<string> {
  const ns = namespace || 'default';
  const summary: HealthSummary = {
    service,
    namespace: ns,
    timeframeMinutes,
    sloThreshold,
  };

  const findings: string[] = [];
  const errors: string[] = [];

  const now = Math.floor(Date.now() / 1000);
  const startTime = now - (timeframeMinutes * 60);
  const midTime = startTime + ((timeframeMinutes * 60) / 2); // Middle of the timeframe for comparison

  findings.push(`# Service Health Summary: ${service}\n`);
  findings.push(`Namespace: ${ns}`);
  findings.push(`Time window: Last ${timeframeMinutes} minutes`);
  findings.push(`SLO threshold: ${(sloThreshold * 100).toFixed(0)}%\n`);

  // 1. Latency Analysis
  try {
    const latencyQuery = `rate(http_request_duration_seconds_sum{job="${service}"}[5m]) / rate(http_request_duration_seconds_count{job="${service}"}[5m]) or rate(http_request_duration_seconds_sum{namespace="${ns}"}[5m]) / rate(http_request_duration_seconds_count{namespace="${ns}"}[5m])`;
    
    // Get recent latency (last half of timeframe)
    const recentLatencyJson = await queries.queryRange(
      latencyQuery,
      midTime.toString(),
      now.toString(),
      '5m'
    );
    const recentLatencyData = JSON.parse(recentLatencyJson);
    
    // Get previous latency (first half of timeframe)
    const previousLatencyJson = await queries.queryRange(
      latencyQuery,
      startTime.toString(),
      midTime.toString(),
      '5m'
    );
    const previousLatencyData = JSON.parse(previousLatencyJson);

    if (recentLatencyData && recentLatencyData.length > 0 && previousLatencyData && previousLatencyData.length > 0) {
      const recentAvg = calculateAverage(recentLatencyData);
      const previousAvg = calculateAverage(previousLatencyData);
      const change = recentAvg - previousAvg;
      const changePercent = previousAvg > 0 ? (change / previousAvg) * 100 : 0;

      summary.latency = {
        current: recentAvg,
        previous: previousAvg,
        change,
        changePercent,
      };

      findings.push('## Latency');
      const currentMs = recentAvg * 1000;
      const previousMs = previousAvg * 1000;
      
      if (Math.abs(changePercent) < 5) {
        findings.push(`✅ Latency stable: ${currentMs.toFixed(0)}ms`);
      } else if (changePercent > 0) {
        findings.push(`⚠️ Latency increased: ${previousMs.toFixed(0)}ms → ${currentMs.toFixed(0)}ms (+${changePercent.toFixed(0)}%)`);
        if (changePercent > 50) {
          findings.push(`   🔴 Significant degradation detected`);
        }
      } else {
        findings.push(`✅ Latency improved: ${previousMs.toFixed(0)}ms → ${currentMs.toFixed(0)}ms (${changePercent.toFixed(0)}%)`);
      }
      findings.push('');
    } else {
      findings.push('## Latency');
      findings.push('⚠️ No latency data available\n');
    }
  } catch (e) {
    errors.push(`Latency analysis failed: ${(e as Error).message}`);
    findings.push('## Latency');
    findings.push('⚠️ Could not retrieve latency data\n');
  }

  // 2. Error Rate Analysis
  try {
    const errorRateQuery = `rate(http_requests_total{job="${service}",code=~"5.."}[5m]) / rate(http_requests_total{job="${service}"}[5m]) or rate(http_requests_total{namespace="${ns}",code=~"5.."}[5m]) / rate(http_requests_total{namespace="${ns}"}[5m])`;
    
    // Get recent error rate
    const recentErrorJson = await queries.queryRange(
      errorRateQuery,
      midTime.toString(),
      now.toString(),
      '5m'
    );
    const recentErrorData = JSON.parse(recentErrorJson);
    
    // Get previous error rate
    const previousErrorJson = await queries.queryRange(
      errorRateQuery,
      startTime.toString(),
      midTime.toString(),
      '5m'
    );
    const previousErrorData = JSON.parse(previousErrorJson);

    if (recentErrorData && recentErrorData.length > 0 && previousErrorData && previousErrorData.length > 0) {
      const recentAvg = calculateAverage(recentErrorData);
      const previousAvg = calculateAverage(previousErrorData);
      const crossedSLO = recentAvg > sloThreshold;

      summary.errorRate = {
        current: recentAvg,
        previous: previousAvg,
        sloThreshold,
        crossedSLO,
      };

      findings.push('## Error Rate');
      const currentPercent = recentAvg * 100;
      const previousPercent = previousAvg * 100;
      
      if (crossedSLO) {
        findings.push(`🔴 Error rate crossed SLO (${(sloThreshold * 100).toFixed(0)}%): ${currentPercent.toFixed(2)}%`);
        if (recentAvg > previousAvg) {
          const changePercent = previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0;
          findings.push(`   Increased from ${previousPercent.toFixed(2)}% (+${changePercent.toFixed(0)}%)`);
        }
      } else {
        findings.push(`✅ Error rate within SLO: ${currentPercent.toFixed(2)}% (SLO: ${(sloThreshold * 100).toFixed(0)}%)`);
        if (recentAvg < previousAvg) {
          const changePercent = previousAvg > 0 ? ((previousAvg - recentAvg) / previousAvg) * 100 : 0;
          findings.push(`   Improved from ${previousPercent.toFixed(2)}% (-${changePercent.toFixed(0)}%)`);
        }
      }
      findings.push('');
    } else {
      findings.push('## Error Rate');
      findings.push('⚠️ No error rate data available\n');
    }
  } catch (e) {
    errors.push(`Error rate analysis failed: ${(e as Error).message}`);
    findings.push('## Error Rate');
    findings.push('⚠️ Could not retrieve error rate data\n');
  }

  // 3. Traffic Analysis
  try {
    const trafficQuery = `rate(http_requests_total{job="${service}"}[5m]) or rate(http_requests_total{namespace="${ns}"}[5m])`;
    
    // Get recent traffic
    const recentTrafficJson = await queries.queryRange(
      trafficQuery,
      midTime.toString(),
      now.toString(),
      '5m'
    );
    const recentTrafficData = JSON.parse(recentTrafficJson);
    
    // Get previous traffic
    const previousTrafficJson = await queries.queryRange(
      trafficQuery,
      startTime.toString(),
      midTime.toString(),
      '5m'
    );
    const previousTrafficData = JSON.parse(previousTrafficJson);

    if (recentTrafficData && recentTrafficData.length > 0 && previousTrafficData && previousTrafficData.length > 0) {
      const recentAvg = calculateAverage(recentTrafficData);
      const previousAvg = calculateAverage(previousTrafficData);
      const change = recentAvg - previousAvg;
      const changePercent = previousAvg > 0 ? (change / previousAvg) * 100 : 0;

      summary.traffic = {
        current: recentAvg,
        previous: previousAvg,
        change,
        changePercent,
      };

      findings.push('## Traffic');
      if (Math.abs(changePercent) < 10) {
        findings.push(`✅ Traffic stable: ${recentAvg.toFixed(2)} req/s`);
      } else if (changePercent > 0) {
        findings.push(`⚠️ Traffic increased: ${previousAvg.toFixed(2)} → ${recentAvg.toFixed(2)} req/s (+${changePercent.toFixed(0)}%)`);
        if (changePercent > 50) {
          findings.push(`   Significant traffic spike detected`);
        }
      } else {
        findings.push(`⚠️ Traffic dropped: ${previousAvg.toFixed(2)} → ${recentAvg.toFixed(2)} req/s (${changePercent.toFixed(0)}%)`);
        if (changePercent < -30) {
          findings.push(`   Significant traffic drop detected`);
        }
      }
      findings.push('');
    } else {
      findings.push('## Traffic');
      findings.push('⚠️ No traffic data available\n');
    }
  } catch (e) {
    errors.push(`Traffic analysis failed: ${(e as Error).message}`);
    findings.push('## Traffic');
    findings.push('⚠️ Could not retrieve traffic data\n');
  }

  // Generate overall summary
  findings.push('---\n');
  findings.push('## Overall Assessment\n');
  
  const issues: string[] = [];
  const positives: string[] = [];

  if (summary.latency) {
    if (summary.latency.changePercent > 50) {
      issues.push(`Latency degraded significantly (+${summary.latency.changePercent.toFixed(0)}%)`);
    } else if (summary.latency.changePercent < -10) {
      positives.push(`Latency improved`);
    }
  }

  if (summary.errorRate) {
    if (summary.errorRate.crossedSLO) {
      issues.push(`Error rate crossed SLO (${(summary.errorRate.sloThreshold * 100).toFixed(0)}%)`);
    } else {
      positives.push(`Error rate within SLO`);
    }
  }

  if (summary.traffic) {
    if (summary.traffic.changePercent < -30) {
      issues.push(`Traffic dropped significantly (${summary.traffic.changePercent.toFixed(0)}%)`);
    } else if (summary.traffic.changePercent > 50) {
      issues.push(`Traffic spike detected (+${summary.traffic.changePercent.toFixed(0)}%)`);
    }
  }

  if (issues.length > 0) {
    findings.push('⚠️ **Issues detected:**');
    issues.forEach(issue => findings.push(`  - ${issue}`));
  }

  if (positives.length > 0) {
    if (issues.length > 0) findings.push('');
    findings.push('✅ **Positive indicators:**');
    positives.forEach(pos => findings.push(`  - ${pos}`));
  }

  if (issues.length === 0 && positives.length === 0) {
    findings.push('✅ **Service health stable** - no significant changes detected');
  }

  if (errors.length > 0) {
    findings.push('\n\n## Errors Encountered\n');
    errors.forEach(e => {
      findings.push(`- ${e}`);
    });
  }

  findings.push('\n\n---\n');
  findings.push('## Raw Data\n');
  findings.push('```json\n');
  findings.push(JSON.stringify(summary, null, 2));
  findings.push('\n```\n');

  return findings.join('\n');
}

function calculateAverage(data: any[]): number {
  if (!data || data.length === 0) return 0;
  
  const allValues = data.flatMap((series: any) => {
    if (!series.values || !Array.isArray(series.values)) return [];
    return series.values.map((v: any) => {
      const val = parseFloat(v[1]);
      return isNaN(val) ? 0 : val;
    });
  });

  if (allValues.length === 0) return 0;
  
  const sum = allValues.reduce((acc: number, val: number) => acc + val, 0);
  return sum / allValues.length;
}


export async function comparePeriods(
  query: string,
  period1Start: string,
  period1End: string,
  period2Start: string,
  period2End: string,
  step: string = '1m'
): Promise<string> {
  const p1Json = await queries.queryRange(query, period1Start, period1End, step);
  const p2Json = await queries.queryRange(query, period2Start, period2End, step);

  const p1Data = JSON.parse(p1Json);
  const p2Data = JSON.parse(p2Json);

  const p1Stats = computeStats(p1Data);
  const p2Stats = computeStats(p2Data);

  const avgChange = p2Stats.avg - p1Stats.avg;
  const avgChangePercent = p1Stats.avg !== 0 ? (avgChange / p1Stats.avg) * 100 : 0;
  const maxChange = p2Stats.max - p1Stats.max;

  let trend: 'improved' | 'degraded' | 'stable' = 'stable';
  if (avgChangePercent > 5) trend = 'degraded';
  else if (avgChangePercent < -5) trend = 'improved';

  const result = {
    period1: { start: period1Start, end: period1End, ...p1Stats },
    period2: { start: period2Start, end: period2End, ...p2Stats },
    comparison: { avgChange, avgChangePercent, maxChange, trend },
  };

  return JSON.stringify(result, null, 2);
}

function computeStats(data: any[]): { avg: number; min: number; max: number; p95: number } {
  const values = (data || []).flatMap((series: any) =>
    (series.values || []).map((v: any) => parseFloat(v[1])).filter((n: number) => !isNaN(n))
  );
  if (values.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };

  values.sort((a: number, b: number) => a - b);
  const sum = values.reduce((a: number, b: number) => a + b, 0);
  const p95Index = Math.floor(values.length * 0.95);

  return {
    avg: sum / values.length,
    min: values[0],
    max: values[values.length - 1],
    p95: values[Math.min(p95Index, values.length - 1)],
  };
}