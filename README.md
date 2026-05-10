# devops-mcp

> Unified MCP server for DevOps engineers — query and manage Kubernetes, ArgoCD, Prometheus, and PagerDuty from any MCP-compatible AI agent.

[![npm version](https://img.shields.io/npm/v/devops-mcp)](https://www.npmjs.com/package/devops-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

---

## What is this?

`devops-mcp` is an open source [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI agents (Claude, etc.) real-time read and write access to your infrastructure stack — all from a single install.

Instead of copy-pasting `kubectl` output into a chat window, you can ask:

> *"Why is the payments deployment in CrashLoopBackOff?"*
> *"What changed in the last ArgoCD sync for the auth app?"*
> *"Show me the p99 latency for the API gateway over the last hour."*
> *"Who's on call right now and what incidents are open?"*
> *"Debug the payments service - what's wrong with it?"*

...and get live answers, sourced directly from your cluster and tooling.

**Providers included:**

| Prefix | Provider | Transport |
|---|---|---|
| `k8s__*` | Kubernetes (via kubeconfig or in-cluster SA) | client-go |
| `argo__*` | ArgoCD | REST API |
| `prom__*` | Prometheus | HTTP API (PromQL) |
| `pd__*` | PagerDuty | REST API v2 |
| `devops__*` | Cross-provider incident debugging | Aggregates all providers |
| `logs__*` | Loki | HTTP API (LogQL) |

---

## Quick start

### Claude Desktop (stdio — recommended)

Add this to `~/.config/claude/claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "devops": {
      "command": "npx",
      "args": ["-y", "devops-mcp@latest"],
      "env": {
        "KUBECONFIG": "/home/you/.kube/config",
        "ARGOCD_SERVER": "https://argocd.company.com",
        "ARGOCD_TOKEN": "your-argocd-token",
        "PROMETHEUS_URL": "http://prometheus.monitoring:9090",
        "PAGERDUTY_TOKEN": "your-pd-api-token",
        "LOKI_URL": "http://loki.monitoring:3100",
        "LOKI_TOKEN": "your-loki-token"
      }
    }
  }
}
```

Restart Claude Desktop. The `devops` server will appear in the tools list.

### Claude Code (CLI)

```bash
claude mcp add devops-mcp -e KUBECONFIG=$HOME/.kube/config \
  -e ARGOCD_SERVER=https://argocd.company.com \
  -e ARGOCD_TOKEN=... \
  -e PROMETHEUS_URL=http://prometheus:9090 \
  -e PAGERDUTY_TOKEN=... \
  -e LOKI_URL=http://loki.monitoring:3100 \
  -e LOKI_TOKEN=...
```

### Local dev / test

```bash
npx devops-mcp
# or clone and run:
git clone https://github.com/your-handle/devops-mcp
cd devops-mcp
npm install
cp .env.example .env   # fill in your values
npm run dev
```

---

## Configuration

All config is via environment variables. Only set the ones for providers you actually use — providers with missing config are silently skipped.

```env
# ── Kubernetes ────────────────────────────────────────────────
KUBECONFIG=/home/user/.kube/config       # omit to use in-cluster service account
K8S_CONTEXT=my-prod-context              # optional: pin a specific context
K8S_ALLOWED_NAMESPACES=default,backend   # optional: restrict namespace access

# ── ArgoCD ───────────────────────────────────────────────────
ARGOCD_SERVER=https://argocd.company.com
ARGOCD_TOKEN=eyJhbGci...                 # argocd account generate-token

# ── Prometheus ───────────────────────────────────────────────
PROMETHEUS_URL=http://prometheus:9090
PROMETHEUS_BEARER_TOKEN=                 # optional: for authenticated Prometheus

# ── PagerDuty ────────────────────────────────────────────────
PAGERDUTY_TOKEN=your-api-v2-token

# ── Loki ───────────────────────────────────────────────────
LOKI_URL=http://loki.monitoring:3100
LOKI_TOKEN=your-loki-token

# ── Transport ────────────────────────────────────────────────
# For stdio mode (default): no transport config needed
# For SSE mode: set these env vars
PORT=3000                                # SSE mode only
MCP_AUTH_TOKEN=shared-secret            # Bearer token for SSE authentication

# ── Safety ───────────────────────────────────────────────────
DEVOPS_MCP_DRY_RUN=false                # true = block all mutations globally
DEVOPS_MCP_AUDIT_LOG=/var/log/devops-mcp-audit.jsonl
```

---

## Tool reference

All tools follow a three-tier safety model:

- **Read** — safe, no side effects, no confirmation needed
- **Mutate** — defaults to `dry_run: true`; set `dry_run: false` to execute
- **Destructive** — requires `confirm: true` as an explicit parameter

### Kubernetes (`k8s__*`)

| Tool | Tier | Description |
|---|---|---|
| `k8s__list_pods` | read | List pods with status, restarts, node, age |
| `k8s__get_pod_logs` | read | Tail or stream logs from a pod container |
| `k8s__describe_resource` | read | Full describe for any resource type |
| `k8s__get_events` | read | Cluster or namespace events, filterable by reason |
| `k8s__list_deployments` | read | Deployments with replica counts and rollout health |
| `k8s__get_resource_usage` | read | CPU/mem usage per pod via metrics-server |
| `k8s__list_contexts` | read | All kubeconfig contexts and the active one |
| `k8s__switch_context` | mutate | Switch active context (session-scoped) |
| `k8s__scale_deployment` | mutate | Scale replicas with dry-run diff preview |
| `k8s__apply_manifest` | mutate | Apply a manifest string with server-side dry-run |
| `k8s__rollout_restart` | mutate | Trigger rolling restart of a deployment or statefulset |
| `k8s__delete_resource` | destructive | Delete a named resource — requires `confirm: true` |

### ArgoCD (`argo__*`)

| Tool | Tier | Description |
|---|---|---|
| `argo__list_apps` | read | All apps with health, sync status, source repo |
| `argo__get_app` | read | Full spec and status for one application |
| `argo__get_app_diff` | read | Live diff between git and cluster state |
| `argo__get_app_history` | read | Deployment history with git SHAs and timestamps |
| `argo__get_resource_tree` | read | Full owned resource tree for an app |
| `argo__sync_app` | mutate | Trigger sync — supports dry-run, prune, force |
| `argo__rollback_app` | mutate | Roll back to a specific history revision |
| `argo__terminate_op` | mutate | Cancel an in-progress sync operation |

### Prometheus (`prom__*`)

| Tool | Tier | Description |
|---|---|---|
| `prom__query` | read | Instant PromQL query with label + value output |
| `prom__query_range` | read | Range query with step, returns time-series data |
| `prom__list_alerts` | read | All alert rules with state (firing / pending / inactive) |
| `prom__get_firing_alerts` | read | Only currently firing alerts with duration |
| `prom__list_targets` | read | All scrape targets with health and last scrape |
| `prom__label_values` | read | Enumerate values for a given label name |
| `prom__metric_metadata` | read | Type, help text, and unit for a metric |
| `prom__summarize_service_health` | read | 📊 **Smart summary** - human-readable service health metrics including latency changes, error rate vs SLO, and traffic patterns |

**Example usage:**
```bash
# Get a human-readable health summary
prom__summarize_service_health(service="payments", timeframeMinutes=30, sloThreshold=0.05)
```

**What it outputs:**
- **Latency**: "Latency increased: 120ms → 480ms (+300%)" or "Latency stable: 125ms"
- **Error rate**: "Error rate crossed SLO (5%): 7.2%" or "Error rate within SLO: 2.1%"
- **Traffic**: "Traffic dropped: 500 → 350 req/s (-30%)" or "Traffic spike detected (+150%)"
- **Overall assessment**: Summary of issues and positive indicators

**Why this matters:**
Instead of raw PromQL numbers that require interpretation, this tool provides actionable insights that AI agents can use directly in responses, making monitoring data actually useful for incident investigation and communication.

### Loki (`logs__*`)

| Tool | Tier | Description |
|---|---|---|
| `logs__get_recent_errors` | read | Get recent error logs from Loki for debugging incidents |
| `logs__search` | read | Search logs in Loki with custom query for root cause analysis |

**Example usage:**
```bash
# Get recent error logs
logs__get_recent_errors(service="payments", namespace="default", minutes=30, limit=50)

# Search logs with custom query
logs__search(query='{service="payments"} |= level="error"', limit=100)
```

**Why this matters:**
- **Metrics tell what**: Prometheus shows you that latency increased or error rate crossed SLO
- **Logs tell why**: Loki shows you the actual error messages, stack traces, and context around failures
- **Complete debugging**: Without logs, you can see that something is broken but not understand the root cause

**Output format:**
- Structured log entries with timestamp, message, service, namespace, and extracted log levels
- Error count summaries and filtering
- Raw LogQL results for detailed analysis

This makes incident investigation complete by combining the "what" (metrics) with the "why" (logs).

### PagerDuty (`pd__*`)

| Tool | Tier | Description |
|---|---|---|
| `pd__list_incidents` | read | Open incidents with severity, status, assignee |
| `pd__get_incident` | read | Full detail with alerts, notes, timeline |
| `pd__who_is_oncall` | read | Current on-call per schedule or escalation policy |
| `pd__list_services` | read | All services with integration keys and status |
| `pd__get_log_entries` | read | Audit log for an incident (all state changes) |
| `pd__acknowledge_incident` | mutate | Acknowledge — suppresses further notifications |
| `pd__add_note` | mutate | Append a note to an incident timeline |
| `pd__escalate_incident` | destructive | Escalate to a different policy — requires `confirm: true` |

### Cross-Provider Debugging (`devops__*`)

| Tool | Tier | Description |
|---|---|---|
| `devops__debug_service` | read | 🔥 **Cross-provider incident debugging** - aggregates Kubernetes, ArgoCD, Prometheus, and PagerDuty data to diagnose service issues in one command |
| `devops__explain_change` | read | 🧠 **Explain what changed** - combines ArgoCD history, Kubernetes rollout history, and Prometheus anomaly window to identify cause of issues |

#### `devops__debug_service`

**Example usage:**
```bash
# Debug a service across all providers
devops__debug_service(service="payments", namespace="default")
```

**What it checks:**
- **Kubernetes**: Pod status, restart counts, readiness, deployment health, recent events
- **ArgoCD**: Sync status, health status, Git diff detection, deployment history  
- **Prometheus**: Error rate (5xx responses), latency (p95), firing alerts
- **PagerDuty**: Active incidents matching the service name

**Output format:**
- Human-readable diagnosis with emoji indicators (⚠️ warnings, ❌ errors)
- Per-provider status sections
- Summary highlighting critical issues
- Raw JSON data for detailed analysis

This is the most powerful tool for incident investigation - it gives you a complete picture of what's wrong with a service in seconds.

#### `devops__explain_change`

**Example usage:**
```bash
# Explain what changed in the last hour
devops__explain_change(service="payments", namespace="default", timeframeMinutes=60)
```

**What it analyzes:**
- **ArgoCD**: Deployment history within the timeframe, including revision, author, repo, and chart
- **Kubernetes**: Current rollout status, replica counts, image tags, and deployment readiness
- **Prometheus**: Error rate trends, latency patterns, and traffic spikes over the time window

**Output format:**
- Timeline of recent deployments with full metadata
- Kubernetes rollout status and health
- Metric anomaly detection (error rate spikes, latency issues, traffic changes)
- **Correlation analysis** that links deployments to metric changes
- Summary with root cause hypothesis

**Problem it solves:**
*"Everything was working yesterday… what changed?"*

This tool answers that question by correlating deployment events with metric anomalies, helping you quickly identify whether a recent deployment, config change, or external factor caused the issue.

---

## Deployment options

### stdio (recommended for local use)

The MCP host launches `devops-mcp` as a subprocess and communicates over stdin/stdout. Zero network config. Auth comes from the local environment (kubeconfig, env vars). Process lifecycle tied to Claude Desktop.

```bash
npx @notharshhaa/devops-mcp
# or with env vars
KUBECONFIG=~/.kube/config npx @notharshhaa/devops-mcp
```

### SSE / HTTP (for shared teams)

Server runs as a persistent HTTP service. Claude connects over Server-Sent Events. Enables multiple users sharing one server. Needs TLS + a bearer token or mTLS in front. Deploy via Docker on an internal bastion.

```bash
npx @notharshhaa/devops-mcp-sse
# or with env vars
PORT=3000 MCP_AUTH_TOKEN=your-secret npx @notharshhaa/devops-mcp-sse
```

For team use, put it behind a TLS-terminating reverse proxy (Caddy, nginx, Traefik). A minimal `docker-compose.yml` is in the `examples/` directory.

### WebSocket (optional extra)

Run `@notharshhaa/devops-mcp` with WebSocket transport for real-time bidirectional communication (not in reference implementation).

```bash
TRANSPORT=websocket PORT=3000 MCP_AUTH_TOKEN=your-secret npx @notharshhaa/devops-mcp
```

Connect to `ws://localhost:3000/ws` with the auth token in the `Authorization` header.

---

## Security model

`devops-mcp` is designed for internal use inside a trusted network. That said:

- **Kubernetes:** Uses standard kubeconfig via `@kubernetes/client-node`. Supports exec plugins (AWS EKS, GKE). In-cluster: auto-mounts SA token. Add RBAC rules scoped to your desired permissions — run devops-mcp under a dedicated ServiceAccount with minimal verbs.
- **ArgoCD:** Generate a long-lived token: `argocd account generate-token --account devops-mcp`. Create a dedicated account in argocd-cm with apiKey capability and a role limited to read + sync.
- **Prometheus:** Usually unauthenticated inside a cluster. If using Grafana Mimir or Thanos with auth, pass a Bearer token. All tools are read-only so minimal permissions are needed.
- **PagerDuty:** Create a dedicated API key in PagerDuty → API Access → Create New API Key. Use Full Access if you want acknowledge/escalate tools; Read-only if you want a safe-only mode.
- **Mutations are dry-run by default.** Every mutating tool defaults `dry_run: true`. The AI must explicitly pass `dry_run: false` — it won't do this unless the user clearly requests an action.
- **Destructive tools require `confirm: true`.** This parameter is never passed by default; it requires the user to explicitly approve.
- **Audit log.** Set `DEVOPS_MCP_AUDIT_LOG` to a file path. Every tool call is written as a JSONL line with timestamp, tool name, parameters, and outcome. Mutations and destructive calls are flagged.
- **Global dry-run mode.** Set `DEVOPS_MCP_DRY_RUN=true` to prevent all mutations — useful for read-only team deployments.

---

## Architecture

```
Client / UI agents (Claude Desktop, Claude Code, etc.)
       │
       ▼
  Transport Layer
  ┌──────────────────────────────┐
  │ stdio | SSE | WebSocket      │  ← Multiple transport support
  │ Authentication (token/JWT)    │  ← Dynamic auth system
  └──────────────────────────────┘
       │
       ▼
  Server & Auth/Registry
  ┌──────────────────────────────┐
  │ Tool registry & routing      │
  │ Dynamic auth manager         │  ← Session-based auth
  │ Request multiplexing         │  ← Concurrent request handling
  │ Audit logging                │
  └──────────────────────────────┘
       │
       ▼
  ┌────┬────┬────┐
  k8s  argo prom  pd  ← Provider modules
  │    │    │     │
  K8s  Argo Prom  PD  ← API clients
  API  API  HTTP  API
       │
       ▼
  Cross-cutting Concerns
  ┌──────────────────────────────┐
  │ Dry-run guard                │
  │ Audit logger                 │
  │ Error normalization          │
  │ Config loader                │
  └──────────────────────────────┘
```

**Key architectural features:**

- **Multi-transport support**: stdio and SSE transports using official MCP SDK
- **Simple authentication**: Bearer token for SSE transport (matches reference pattern)
- **Provider isolation**: Each provider (k8s, argo, prom, pd) is a self-contained module
- **Cross-cutting concerns**: Dry-run enforcement, audit logging, and error normalization applied consistently across all tools

---

## Contributing

Contributions are welcome. The most useful areas:

- **New providers** — Grafana, Datadog, Vault, Terraform Cloud, Flux CD
- **New tools** — within existing providers (e.g. `k8s__get_node_pressure`, `argo__get_app_logs`)
- **Better output formatting** — richer structured responses for specific resource types
- **Tests** — unit tests for provider logic using mocked clients

### Adding a new provider

1. Create `src/providers/yourprovider/` with `index.ts`, `client.ts`, and one file per resource group.
2. Register it in `src/server.ts`.
3. Add config keys to `.env.example` and `src/config.ts`.
4. Document tools in this README following the existing table format.
5. Open a PR.

### Local development

```bash
git clone https://github.com/your-handle/devops-mcp
cd devops-mcp
npm install
cp .env.example .env
npm run dev        # tsx watch — restarts on file change
```

Run against a local kind/minikube cluster for Kubernetes testing. Use `DEVOPS_MCP_DRY_RUN=true` to prevent accidental mutations during development.

---

## Roadmap

- [ ] Grafana provider (`grafana__*`) — dashboards, annotations, datasources
- [ ] Flux CD provider (`flux__*`) — kustomizations, helm releases, image automation
- [ ] Terraform Cloud provider (`tfc__*`) — workspace runs, state, variables
- [ ] HashiCorp Vault provider (`vault__*`) — secret read (never write), lease status
- [ ] Datadog provider (`dd__*`) — metrics, monitors, events
- [ ] Web UI for SSE mode — connection status, live audit log, provider health

---

## License

MIT — see [LICENSE](LICENSE).

---

*Built for DevOps and platform engineers who want AI that actually knows what's happening in their cluster.*
