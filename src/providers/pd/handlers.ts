import { config } from '../../config.js';
import * as incidents from './incidents.js';

export function getToolDefinitions() {
  // Skip if PagerDuty is not configured
  if (!config.pagerdutyToken) {
    return [];
  }

  return [
    {
      name: 'pd__list_incidents',
      description: 'Open incidents with severity, status, assignee',
      inputSchema: {
        type: 'object',
        properties: {
          statuses: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'pd__get_incident',
      description: 'Full detail with alerts, notes, timeline',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'pd__who_is_oncall',
      description: 'Current on-call per schedule or escalation policy',
      inputSchema: {
        type: 'object',
        properties: {
          scheduleIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'pd__list_services',
      description: 'All services with integration keys and status',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'pd__get_log_entries',
      description: 'Audit log for an incident (all state changes)',
      inputSchema: {
        type: 'object',
        properties: {
          incidentId: { type: 'string' },
        },
        required: ['incidentId'],
      },
    },
    {
      name: 'pd__acknowledge_incident',
      description: 'Acknowledge an incident (dry-run by default)',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          dry_run: { type: 'boolean', description: 'Preview by default; set false to execute' },
        },
        required: ['id'],
      },
    },
    {
      name: 'pd__add_note',
      description: 'Append a note to an incident timeline (dry-run by default)',
      inputSchema: {
        type: 'object',
        properties: {
          incidentId: { type: 'string' },
          note: { type: 'string' },
          dry_run: { type: 'boolean', description: 'Preview by default; set false to execute' },
        },
        required: ['incidentId', 'note'],
      },
    },
    {
      name: 'pd__escalate_incident',
      description: 'Escalate to a different policy — requires confirm: true or interactive confirmation',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          escalationPolicyId: { type: 'string' },
          confirm: { type: 'boolean' },
        },
        required: ['id', 'escalationPolicyId'],
      },
    },
    {
      name: 'pd__summarize_incident',
      description: '🚨 Incident auto-summary - what happened, affected services, probable root cause, current status',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  ];
}

export async function handleTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'pd__list_incidents':
      return await incidents.listIncidents(args?.statuses);
    case 'pd__get_incident':
      return await incidents.getIncident(args.id);
    case 'pd__who_is_oncall':
      return await incidents.whoIsOncall(args?.scheduleIds);
    case 'pd__list_services':
      return await incidents.listServices();
    case 'pd__get_log_entries':
      return await incidents.getLogEntries(args.incidentId);
    case 'pd__acknowledge_incident':
      return await incidents.acknowledgeIncident(args.id, args.dry_run !== false);
    case 'pd__add_note':
      return await incidents.addNote(args.incidentId, args.note, args.dry_run !== false);
    case 'pd__escalate_incident':
      return await incidents.escalateIncident(
        args.id,
        args.escalationPolicyId,
        args.confirm === true
      );
    case 'pd__summarize_incident':
      return await incidents.summarizeIncident(args.id);
    default:
      throw new Error(`Unknown PagerDuty tool: ${name}`);
  }
}
