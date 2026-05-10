import { config } from '../../config.js';

let lokiClient: any = null;

export async function getLokiClient() {
  if (!config.lokiUrl) {
    throw new Error('Loki URL not configured. Please set LOKI_URL environment variable.');
  }
  
  if (!lokiClient) {
    const nodeFetch = await import('node-fetch');
    const fetch = nodeFetch.default;
    
    lokiClient = {
      async get(endpoint: string) {
        const url = config.lokiUrl!.replace(/\/$/, '') + endpoint;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        // Add authentication if configured
        if (config.lokiToken) {
          headers['Authorization'] = `Bearer ${config.lokiToken}`;
        }
        
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers,
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }
          
          return await response.json();
        } catch (error) {
          throw new Error(`Failed to fetch from Loki: ${(error as Error).message}`);
        }
      },
      
      async post(endpoint: string, data: any) {
        const url = config.lokiUrl!.replace(/\/$/, '') + endpoint;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (config.lokiToken) {
          headers['Authorization'] = `Bearer ${config.lokiToken}`;
        }
        
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }
          
          return await response.json();
        } catch (error) {
          throw new Error(`Failed to post to Loki: ${(error as Error).message}`);
        }
      },
    };
  }
  
  return lokiClient;
}
