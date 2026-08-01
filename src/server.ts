import { createHash, randomBytes } from 'node:crypto';
import {
  CLIENT_CAPABILITIES_META_KEY,
  Server,
  acceptedContent,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
  type CallToolResult,
  type InputRequiredResult,
  type ListToolsResult,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import * as k8sHandlers from './providers/k8s/handlers.js';
import * as argoHandlers from './providers/argo/handlers.js';
import * as promHandlers from './providers/prom/handlers.js';
import * as pdHandlers from './providers/pd/handlers.js';
import * as debugHandlers from './providers/debug/handlers.js';
import * as logsHandlers from './providers/logs/handlers.js';
import * as helmHandlers from './providers/helm/handlers.js';
import { normalizeError } from './lib/errors.js';
import { config } from './config.js';

export const SERVER_INFO = {
  name: 'devops-mcp',
  version: '2.1.0',
} as const;

export function getToolDefinitions(): ListToolsResult['tools'] {
  return [
    ...k8sHandlers.getToolDefinitions(),
    ...argoHandlers.getToolDefinitions(),
    ...promHandlers.getToolDefinitions(),
    ...pdHandlers.getToolDefinitions(),
    ...debugHandlers.getToolDefinitions(),
    ...logsHandlers.getToolDefinitions(),
    ...helmHandlers.getToolDefinitions(),
  ].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0) as ListToolsResult['tools'];
}

const destructiveConfirmationSchema = z.object({
  confirm: z.boolean().describe('Confirm this destructive operation'),
});

interface DestructiveConfirmationState {
  purpose: 'destructive-confirmation';
  toolName: string;
  argumentsDigest: string;
}

const configuredStateKey = config.mcpRequestStateSecret ?? config.mcpAuthToken;
const requestStateKey = configuredStateKey
  ? createHash('sha256').update('devops-mcp request state\0').update(configuredStateKey).digest()
  : randomBytes(32);
const requestStatePrincipal = config.mcpAuthToken
  ? createHash('sha256').update(config.mcpAuthToken).digest('base64url')
  : 'local-process';
const requestStateCodec = createRequestStateCodec<DestructiveConfirmationState>({
  key: requestStateKey,
  ttlSeconds: 300,
  bind: ctx => `${ctx.mcpReq.method}\0${ctx.http?.authInfo?.clientId ?? requestStatePrincipal}`,
});

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter(key => object[key] !== undefined && key !== 'confirm')
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function operationDigest(name: string, args: Record<string, unknown>): string {
  return createHash('sha256')
    .update(name)
    .update('\0')
    .update(canonicalize(args))
    .digest('base64url');
}

function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function destructiveConfirmationMessage(
  name: string,
  args: Record<string, unknown>
): string | undefined {
  if (name === 'k8s__delete_resource') {
    const namespace = typeof args.namespace === 'string' ? ` in namespace ${args.namespace}` : '';
    return `Delete ${String(args.resourceType)} ${String(args.name)}${namespace}?`;
  }
  if (name === 'pd__escalate_incident') {
    return `Escalate PagerDuty incident ${String(args.id)} to policy ${String(args.escalationPolicyId)}?`;
  }
  return undefined;
}

function supportsFormElicitation(ctx: ServerContext): boolean {
  const envelope = ctx.mcpReq.envelope as unknown as Record<string, unknown> | undefined;
  const capabilities = envelope?.[CLIENT_CAPABILITIES_META_KEY] as
    | { elicitation?: { form?: unknown } }
    | undefined;
  return capabilities?.elicitation?.form !== undefined;
}

function isMatchingConfirmationState(
  state: unknown,
  name: string,
  args: Record<string, unknown>
): state is DestructiveConfirmationState {
  if (!state || typeof state !== 'object') return false;
  const candidate = state as Partial<DestructiveConfirmationState>;
  return candidate.purpose === 'destructive-confirmation'
    && candidate.toolName === name
    && candidate.argumentsDigest === operationDigest(name, args);
}

async function requestDestructiveConfirmation(
  name: string,
  args: Record<string, unknown>,
  ctx: ServerContext
): Promise<InputRequiredResult | CallToolResult | undefined> {
  const message = destructiveConfirmationMessage(name, args);
  if (!message) return undefined;

  if (args.confirm === false) {
    return toolError('Destructive operation was not confirmed.');
  }
  if (config.dryRun) {
    return toolError(`Error: Global dry-run mode is enabled; execution is blocked. Tool: ${name}`);
  }
  if (args.confirm === true) return undefined;

  const response = inputResponse(ctx.mcpReq.inputResponses, 'confirmation');
  const state = ctx.mcpReq.requestState<DestructiveConfirmationState>();
  const hasConfirmationResponse = Object.prototype.hasOwnProperty.call(
    ctx.mcpReq.inputResponses ?? {},
    'confirmation'
  );

  if (hasConfirmationResponse || state !== undefined) {
    if (!hasConfirmationResponse || !isMatchingConfirmationState(state, name, args)) {
      return toolError('Invalid or mismatched destructive-operation confirmation state.');
    }
    if (response.kind !== 'elicit') {
      return toolError('Invalid destructive-operation confirmation response.');
    }
    if (response.action !== 'accept') {
      return toolError('Destructive operation was not confirmed.');
    }

    const confirmed = acceptedContent(
      ctx.mcpReq.inputResponses,
      'confirmation',
      destructiveConfirmationSchema
    );
    if (confirmed?.confirm !== true) {
      return toolError('Destructive operation was not confirmed.');
    }

    args.confirm = true;
    return undefined;
  }

  if (!supportsFormElicitation(ctx)) {
    return toolError('Destructive operation requires confirm: true; interactive confirmation is unavailable for this client.');
  }

  const requestState = await requestStateCodec.mint({
    purpose: 'destructive-confirmation',
    toolName: name,
    argumentsDigest: operationDigest(name, args),
  }, ctx);

  return inputRequired({
    inputRequests: {
      confirmation: inputRequired.elicit({
        message,
        requestedSchema: destructiveConfirmationSchema,
      }),
    },
    requestState,
  });
}

export function createServer(): Server {
  const cacheHint = {
    ttlMs: config.mcpCacheTtlMs,
    cacheScope: 'public' as const,
  };
  const server = new Server(
    SERVER_INFO,
    {
      capabilities: {
        tools: { listChanged: false },
      },
      cacheHints: {
        'server/discover': cacheHint,
        'tools/list': cacheHint,
      },
      requestState: {
        verify: requestStateCodec.verify,
      },
    }
  );

  server.setRequestHandler('tools/list', async (): Promise<ListToolsResult> => {
    return { tools: getToolDefinitions() };
  });

  server.setRequestHandler(
    'tools/call',
    async (request, ctx): Promise<CallToolResult | InputRequiredResult> => {
      const name = request.params.name;
      const args: Record<string, unknown> = { ...(request.params.arguments || {}) };

      try {
        const confirmation = await requestDestructiveConfirmation(name, args, ctx);
        if (confirmation) return confirmation;

        let result: string;

        if (name.startsWith('k8s__')) {
          result = await k8sHandlers.handleTool(name, args);
        } else if (name.startsWith('argo__')) {
          result = await argoHandlers.handleTool(name, args);
        } else if (name.startsWith('prom__')) {
          result = await promHandlers.handleTool(name, args);
        } else if (name.startsWith('pd__')) {
          result = await pdHandlers.handleTool(name, args);
        } else if (name.startsWith('devops__')) {
          result = await debugHandlers.handleTool(name, args);
        } else if (name.startsWith('logs__')) {
          result = await logsHandlers.handleTool(name, args);
        } else if (name.startsWith('helm__')) {
          result = await helmHandlers.handleTool(name, args);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [{ type: 'text', text: result }],
        };
      } catch (error) {
        const normalized = normalizeError(error);
        return toolError(`Error: ${normalized.message}`);
      }
    }
  );

  return server;
}
