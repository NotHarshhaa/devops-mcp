import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Transport } from './transport.js';

export class StdioTransport implements Transport {
  private transport: StdioServerTransport;
  private messageCallback?: (message: string) => void;
  private errorCallback?: (error: Error) => void;

  constructor() {
    this.transport = new StdioServerTransport();
  }

  async connect(): Promise<void> {
    // Stdio transport is connected immediately
  }

  async disconnect(): Promise<void> {
    // Stdio doesn't support disconnect
  }

  async send(message: string): Promise<void> {
    // Stdio handles sending internally
  }

  onMessage(callback: (message: string) => void): void {
    this.messageCallback = callback;
    // Stdio transport handles messages internally
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  getNativeTransport(): StdioServerTransport {
    return this.transport;
  }
}
