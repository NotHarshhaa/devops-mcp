export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export function normalizeError(error: unknown): McpError {
  if (error instanceof McpError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new McpError(error.message);
  }
  
  return new McpError(String(error));
}

export function isConfigured(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

export function requireConfig(value: string | undefined, name: string): void {
  if (!isConfigured(value)) {
    throw new McpError(
      `Configuration required: ${name} is not set`,
      400,
      { configName: name }
    );
  }
}
