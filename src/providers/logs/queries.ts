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
  const query = namespace 
    ? `{namespace="${ns}",service="${service}"} |~ "level=(error|Error|ERROR)"`
    : `{service="${service}"} |~ "level=(error|Error|ERROR)"`;
  
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
    const formattedLogs = logs.map((entry: any) => ({
      timestamp: new Date(entry.values?.[0]?.[0] * 1000).toISOString(),
      message: entry.values?.[0]?.[1] || 'No message',
      level: extractLogLevel(entry.values?.[0]?.[1] || ''),
      service: extractService(entry.stream || {}),
      namespace: extractNamespace(entry.stream || {}),
      count: entry.values?.length || 0,
      stream: entry.stream || {},
    }));
    
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
    const formattedLogs = logs.map((entry: any) => ({
      timestamp: new Date(entry.values?.[0]?.[0] * 1000).toISOString(),
      message: entry.values?.[0]?.[1] || 'No message',
      level: extractLogLevel(entry.values?.[0]?.[1] || ''),
      service: extractService(entry.stream || {}),
      namespace: extractNamespace(entry.stream || {}),
      count: entry.values?.length || 0,
      stream: entry.stream || {},
    }));
    
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
