import { getLokiClient } from './client.js';

interface LokiResult {
  status: string;
  data?: {
    result: any[];
  };
  error?: string;
}

interface LogEntry {
  timestamp: string;
  message: string;
  level: string;
  service: string;
  namespace: string;
  count: number;
  stream?: any;
}

export function escapeLogqlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function lokiTimestampToIso(timestamp: unknown): string {
  const raw = String(timestamp ?? '');

  try {
    const value = BigInt(raw);
    // Loki query_range timestamps are nanoseconds. Retain compatibility with
    // millisecond/second fixtures and proxies that normalize the value.
    const milliseconds = value >= 1_000_000_000_000_000n
      ? value / 1_000_000n
      : value >= 1_000_000_000_000n
        ? value
        : value * 1_000n;
    const date = new Date(Number(milliseconds));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  } catch {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return raw;
}

export function formatLokiStreams(streams: any[]): LogEntry[] {
  return (streams || []).flatMap((entry: any) => {
    const stream = entry.stream || {};
    return (entry.values || []).map((value: any[]) => {
      const message = String(value?.[1] ?? 'No message');
      return {
        timestamp: lokiTimestampToIso(value?.[0]),
        message,
        level: extractLogLevel(message),
        service: extractService(stream),
        namespace: extractNamespace(stream),
        count: 1,
        stream,
      };
    });
  });
}

export async function getRecentErrors(
  service: string,
  namespace?: string,
  minutes: number = 60,
  limit: number = 50
): Promise<string> {
  const client = await getLokiClient();
  
  const ns = namespace || 'default';
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  
  // Build LogQL query for recent errors
  const escapedNamespace = escapeLogqlString(ns);
  const escapedService = escapeLogqlString(service);
  const query = namespace
    ? `{namespace="${escapedNamespace}",service="${escapedService}"} |~ "level=(error|Error|ERROR)"`
    : `{service="${escapedService}"} |~ "level=(error|Error|ERROR)"`;
  
  const params = new URLSearchParams({
    query,
    start: startTime,
    end: endTime,
    limit: limit.toString(),
    direction: 'backward', // Get most recent first
  });
  
  try {
    const result = await client.get(`/loki/api/v1/query_range?${params.toString()}`);
    
    if (result.status !== 'success') {
      throw new Error(`Loki query failed: ${result.error}`);
    }
    
    const logs = result.data?.result || [];
    const formattedLogs = formatLokiStreams(logs);
    
    return JSON.stringify({
      query,
      timeRange: { start: startTime, end: endTime },
      totalEntries: formattedLogs.length,
      errorCount: formattedLogs.filter((log: LogEntry) => 
        log.level.toLowerCase().includes('error')
      ).length,
      logs: formattedLogs,
    }, null, 2);
    
  } catch (error) {
    return JSON.stringify({
      error: `Failed to query Loki: ${(error as Error).message}`,
      query,
      timeRange: { start: startTime, end: endTime },
    }, null, 2);
  }
}

export async function search(
  query: string,
  start?: string,
  end?: string,
  limit: number = 100
): Promise<string> {
  const client = await getLokiClient();
  
  const now = new Date();
  const endTime = end || now.toISOString();
  const startTime = start || new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // Default 1 hour ago
  
  const params = new URLSearchParams({
    query,
    start: startTime,
    end: endTime,
    limit: limit.toString(),
    direction: 'backward',
  });
  
  try {
    const result = await client.get(`/loki/api/v1/query_range?${params.toString()}`);
    
    if (result.status !== 'success') {
      throw new Error(`Loki search failed: ${result.error}`);
    }
    
    const logs = result.data.result || [];
    const formattedLogs = formatLokiStreams(logs);
    
    return JSON.stringify({
      query,
      timeRange: { start: startTime, end: endTime },
      totalEntries: formattedLogs.length,
      logs: formattedLogs,
    }, null, 2);
    
  } catch (error) {
    return JSON.stringify({
      error: `Failed to search Loki: ${(error as Error).message}`,
      query,
      timeRange: { start: startTime, end: endTime },
    }, null, 2);
  }
}

// Helper functions to extract structured information from log entries
function extractLogLevel(logMessage: string): string {
  const levelMatch = logMessage.match(/level=([a-zA-Z]+)/i);
  return levelMatch ? levelMatch[1] : 'unknown';
}

function extractService(stream: any): string {
  return stream.service || stream.app || stream.application || 'unknown';
}

function extractNamespace(stream: any): string {
  return stream.namespace || stream.ns || 'default';
}
