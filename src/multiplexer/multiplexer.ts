export interface Request {
  id: string;
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
}

export interface Response {
  id: string;
  result?: unknown;
  error?: Error;
}

export class RequestMultiplexer {
  private activeRequests: Map<string, Promise<unknown>> = new Map();
  private requestQueue: Array<() => void> = [];
  private maxConcurrent: number;
  private activeCount: number = 0;

  constructor(maxConcurrent: number = 10) {
    this.maxConcurrent = maxConcurrent;
  }

  async execute<T>(request: Request, handler: (req: Request) => Promise<T>): Promise<T> {
    const promise = new Promise<T>((resolve, reject) => {
      const execute = async () => {
        this.activeCount++;
        this.activeRequests.set(request.id, promise);

        try {
          const result = await handler(request);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeCount--;
          this.activeRequests.delete(request.id);
          this.processQueue();
        }
      };

      if (this.activeCount < this.maxConcurrent) {
        execute();
      } else {
        this.requestQueue.push(execute);
      }
    });

    return promise;
  }

  private processQueue(): void {
    while (this.requestQueue.length > 0 && this.activeCount < this.maxConcurrent) {
      const next = this.requestQueue.shift();
      if (next) {
        next();
      }
    }
  }

  cancelRequest(requestId: string): boolean {
    const request = this.activeRequests.get(requestId);
    if (request) {
      this.activeRequests.delete(requestId);
      return true;
    }
    return false;
  }

  getActiveRequestCount(): number {
    return this.activeCount;
  }

  getQueuedRequestCount(): number {
    return this.requestQueue.length;
  }

  getStatus() {
    return {
      active: this.activeCount,
      queued: this.requestQueue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }
}
