import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

jest.mock('@kubernetes/client-node', () => ({}));

import { Client, ProtocolError, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { config } from '../src/config';
import { createMcpProtocolHandler } from '../src/transport/http';

interface WireRecord {
  method?: string;
  requestHeaders: Headers;
  responseHeaders: Headers;
}

type RequestTamper = (request: Request, method: string | undefined, body: string) => Request;

function parseMethod(body: string): string | undefined {
  if (!body) return undefined;
  try {
    return (JSON.parse(body) as { method?: string }).method;
  } catch {
    return undefined;
  }
}

function createHarness(tamper?: RequestTamper) {
  const handler = createMcpProtocolHandler(() => undefined);
  const records: WireRecord[] = [];
  const inProcessFetch: typeof fetch = async (input, init) => {
    let request = new Request(input, init);
    const body = await request.clone().text();
    const method = parseMethod(body);
    if (tamper) request = tamper(request, method, body);

    const response = await handler.fetch(request);
    records.push({
      method,
      requestHeaders: new Headers(request.headers),
      responseHeaders: new Headers(response.headers),
    });
    return response;
  };

  const transport = new StreamableHTTPClientTransport(
    new URL('http://test.local/mcp'),
    { fetch: inProcessFetch }
  );
  return { handler, records, transport };
}

function modernClient(name = 'devops-mcp-test', elicitation = false): Client {
  return new Client(
    { name, version: '1.0.0' },
    {
      ...(elicitation ? { capabilities: { elicitation: { form: {} } } } : {}),
      versionNegotiation: { mode: { pin: '2026-07-28' } },
    }
  );
}

describe('MCP 2026-07-28 transport', () => {
  const originalProviderConfig = {
    kubeconfig: config.kubeconfig,
    prometheusUrl: config.prometheusUrl,
    argocdServer: config.argocdServer,
    argocdToken: config.argocdToken,
    pagerdutyToken: config.pagerdutyToken,
    dryRun: config.dryRun,
  };

  beforeEach(() => {
    // Keep integration tests deterministic and disconnected from real infrastructure.
    config.kubeconfig = undefined;
    config.prometheusUrl = undefined;
    config.argocdServer = undefined;
    config.argocdToken = undefined;
    config.pagerdutyToken = undefined;
    config.dryRun = false;
  });

  afterEach(() => {
    Object.assign(config, originalProviderConfig);
  });

  it('serves modern stateless requests with routing headers and cache hints', async () => {
    const { handler, records, transport } = createHarness();
    const client = modernClient();

    try {
      await client.connect(transport);
      expect(client.getProtocolEra()).toBe('modern');

      const discovery = client.getDiscoverResult() as unknown as {
        ttlMs: number;
        cacheScope: string;
      };
      expect(discovery).toMatchObject({
        ttlMs: config.mcpCacheTtlMs,
        cacheScope: 'public',
      });

      const first = await client.listTools();
      const toolListRequestsAfterFirst = records.filter(record => record.method === 'tools/list').length;
      const second = await client.listTools();

      expect(second.tools).toEqual(first.tools);
      expect(records.filter(record => record.method === 'tools/list')).toHaveLength(
        toolListRequestsAfterFirst
      );
      expect(first.tools.map(tool => tool.name)).toEqual(
        first.tools.map(tool => tool.name).slice().sort()
      );

      const result = await client.callTool({
        name: 'devops__health_report',
        arguments: {},
      });
      expect(result.isError).not.toBe(true);

      const call = records.find(record => record.method === 'tools/call');
      expect(call?.requestHeaders.get('mcp-protocol-version')).toBe('2026-07-28');
      expect(call?.requestHeaders.get('mcp-method')).toBe('tools/call');
      expect(call?.requestHeaders.get('mcp-name')).toBe('devops__health_report');

      for (const record of records) {
        expect(record.requestHeaders.has('mcp-session-id')).toBe(false);
        expect(record.responseHeaders.has('mcp-session-id')).toBe(false);
      }
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('rejects routing headers that disagree with the JSON-RPC body', async () => {
    const { handler, transport } = createHarness((request, method) => {
      if (method !== 'tools/list') return request;
      const headers = new Headers(request.headers);
      headers.set('Mcp-Method', 'tools/call');
      return new Request(request, { headers });
    });
    const client = modernClient();

    try {
      await client.connect(transport);
      await expect(client.listTools()).rejects.toBeInstanceOf(ProtocolError);
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('rejects tool routing names that disagree with the JSON-RPC body', async () => {
    const { handler, transport } = createHarness((request, method) => {
      if (method !== 'tools/call') return request;
      const headers = new Headers(request.headers);
      headers.set('Mcp-Name', 'k8s__delete_resource');
      return new Request(request, { headers });
    });
    const client = modernClient();

    try {
      await client.connect(transport);
      await expect(client.callTool({
        name: 'devops__health_report',
        arguments: {},
      })).rejects.toBeInstanceOf(ProtocolError);
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('completes MRTR only with signed state bound to the original operation', async () => {
    const { handler, transport } = createHarness();
    let confirmationRequests = 0;
    const client = modernClient('mrtr-test', true);
    client.setRequestHandler('elicitation/create', async request => {
      confirmationRequests++;
      expect(request.params.message).toContain('incident P123');
      return { action: 'accept', content: { confirm: true } };
    });

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: 'pd__escalate_incident',
        arguments: {
          id: 'P123',
          escalationPolicyId: 'POLICY456',
        },
      });

      expect(confirmationRequests).toBe(1);
      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('PAGERDUTY_TOKEN is not set'),
      });
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('rejects forged first-round confirmation responses without signed state', async () => {
    const { handler, transport } = createHarness((request, method, body) => {
      if (method !== 'tools/call') return request;
      const message = JSON.parse(body) as {
        params: Record<string, unknown>;
      };
      message.params.inputResponses = {
        confirmation: { action: 'accept', content: { confirm: true } },
      };
      return new Request(request, { body: JSON.stringify(message) });
    });
    const client = modernClient('forged-confirmation-test');

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: 'k8s__delete_resource',
        arguments: { resourceType: 'pod', name: 'payments', namespace: 'default' },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('confirmation state'),
      });
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('rejects a valid confirmation state replayed for changed target arguments', async () => {
    const { handler, transport } = createHarness((request, method, body) => {
      if (method !== 'tools/call') return request;
      const message = JSON.parse(body) as {
        params: {
          requestState?: string;
          arguments?: Record<string, unknown>;
        };
      };
      if (!message.params.requestState || !message.params.arguments) return request;
      message.params.arguments.name = 'payroll';
      return new Request(request, { body: JSON.stringify(message) });
    });
    const client = modernClient('changed-target-test', true);
    client.setRequestHandler('elicitation/create', async () => ({
      action: 'accept',
      content: { confirm: true },
    }));

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: 'k8s__delete_resource',
        arguments: { resourceType: 'pod', name: 'payments', namespace: 'default' },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('mismatched destructive-operation confirmation state'),
      });
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('treats explicit false and interactive decline as terminal denials', async () => {
    const directHarness = createHarness();
    const directClient = modernClient('direct-decline-test', true);
    let directPrompts = 0;
    directClient.setRequestHandler('elicitation/create', async () => {
      directPrompts++;
      return { action: 'accept', content: { confirm: true } };
    });

    try {
      await directClient.connect(directHarness.transport);
      const directResult = await directClient.callTool({
        name: 'k8s__delete_resource',
        arguments: { resourceType: 'pod', name: 'payments', confirm: false },
      });
      expect(directPrompts).toBe(0);
      expect(directResult.isError).toBe(true);
      expect(directResult.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('was not confirmed'),
      });
    } finally {
      await directClient.close();
      await directHarness.handler.close();
    }

    const interactiveHarness = createHarness();
    const interactiveClient = modernClient('interactive-decline-test', true);
    interactiveClient.setRequestHandler('elicitation/create', async () => ({ action: 'decline' }));

    try {
      await interactiveClient.connect(interactiveHarness.transport);
      const interactiveResult = await interactiveClient.callTool({
        name: 'k8s__delete_resource',
        arguments: { resourceType: 'pod', name: 'payments' },
      });
      expect(interactiveResult.isError).toBe(true);
      expect(interactiveResult.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('was not confirmed'),
      });
    } finally {
      await interactiveClient.close();
      await interactiveHarness.handler.close();
    }
  });

  it('blocks destructive calls before prompting when global dry-run is enabled', async () => {
    const { handler, transport } = createHarness();
    config.dryRun = true;
    let confirmationRequests = 0;
    const client = modernClient('global-dry-run-test', true);
    client.setRequestHandler('elicitation/create', async () => {
      confirmationRequests++;
      return { action: 'accept', content: { confirm: true } };
    });

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: 'k8s__delete_resource',
        arguments: { resourceType: 'pod', name: 'payments', namespace: 'default' },
      });

      expect(confirmationRequests).toBe(0);
      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('Global dry-run mode is enabled'),
      });
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('retains actionable stateless compatibility for 2025-era clients', async () => {
    const { handler, records, transport } = createHarness();
    const client = new Client({ name: 'legacy-test', version: '1.0.0' });

    try {
      await client.connect(transport);
      expect(client.getProtocolEra()).toBe('legacy');
      await expect(client.listTools()).resolves.toHaveProperty('tools');

      const result = await client.callTool({
        name: 'k8s__delete_resource',
        arguments: { resourceType: 'pod', name: 'payments' },
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('requires confirm: true'),
      });

      for (const record of records) {
        expect(record.requestHeaders.has('mcp-session-id')).toBe(false);
        expect(record.responseHeaders.has('mcp-session-id')).toBe(false);
      }
    } finally {
      await client.close();
      await handler.close();
    }
  });
});
