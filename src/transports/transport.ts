export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: string): Promise<void>;
  onMessage(callback: (message: string) => void): void;
  onError(callback: (error: Error) => void): void;
}

export enum TransportType {
  STDIO = 'stdio',
  SSE = 'sse',
  WEBSOCKET = 'websocket',
  HTTP = 'http',
}
