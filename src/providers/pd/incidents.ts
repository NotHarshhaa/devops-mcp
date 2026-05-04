import { getPdClient } from './client.js';
import { withDryRunGuard } from '../../lib/dry-run.js';

export async function listIncidents(statuses?: string[]): Promise<string> {
  const client = getPdClient();
  const params = new URLSearchParams();
  
  if (statuses && statuses.length > 0) {
    params.append('statuses[]', statuses.join(','));
  }
  
  const result = await client.get(`/incidents?${params.toString()}`);
  
  const incidents = result.incidents.map((i: any) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    severity: i.severity,
    urgency: i.urgency,
    assignee: i.assignees?.map((a: any) => a.summary).join(', '),
    service: i.service?.summary,
    created: i.created_at,
    updated: i.updated_at,
  }));

  return JSON.stringify(incidents, null, 2);
}

export async function getIncident(id: string): Promise<string> {
  const client = getPdClient();
  const result = await client.get(`/incidents/${id}`);
  return JSON.stringify(result.incident, null, 2);
}

export async function whoIsOncall(scheduleIds?: string[]): Promise<string> {
  const client = getPdClient();
  
  let ids: string[] = scheduleIds || [];
  if (ids.length === 0) {
    // Get all schedules
    const schedules = await client.get('/schedules');
    ids = schedules.schedules.map((s: any) => s.id);
  }

  const onCallData = await Promise.all(
    ids.map(async (id) => {
      const result = await client.get(`/schedules/${id}/oncall_users`);
      return {
        scheduleId: id,
        users: result.oncall_users.map((u: any) => ({
          id: u.id,
          name: u.summary,
          email: u.email,
        })),
      };
    })
  );

  return JSON.stringify(onCallData, null, 2);
}

export async function listServices(): Promise<string> {
  const client = getPdClient();
  const result = await client.get('/services');
  
  const services = result.services.map((s: any) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    integrationKeys: s.integrations?.map((i: any) => i.summary).join(', '),
  }));

  return JSON.stringify(services, null, 2);
}

export async function getLogEntries(incidentId: string): Promise<string> {
  const client = getPdClient();
  const result = await client.get(`/incidents/${incidentId}/log_entries`);
  
  const entries = result.log_entries.map((e: any) => ({
    id: e.id,
    type: e.type,
    created: e.created_at,
    summary: e.summary,
    agent: e.agent?.summary,
  }));

  return JSON.stringify(entries, null, 2);
}

export async function acknowledgeIncident(id: string): Promise<string> {
  return withDryRunGuard('pd__acknowledge_incident', { id }, 'mutate', async () => {
    const client = getPdClient();
    
    await client.put(`/incidents/${id}`, {
      incident: {
        type: 'incident',
        status: 'acknowledged',
      },
    });

    return JSON.stringify({
      acknowledged: true,
      incidentId: id,
    }, null, 2);
  });
}

export async function addNote(incidentId: string, note: string): Promise<string> {
  return withDryRunGuard('pd__add_note', { incidentId, note }, 'mutate', async () => {
    const client = getPdClient();
    
    await client.post(`/incidents/${incidentId}/notes`, {
      note: {
        content: note,
      },
    });

    return JSON.stringify({
      added: true,
      incidentId,
    }, null, 2);
  });
}

export async function escalateIncident(
  id: string,
  escalationPolicyId: string,
  confirm: boolean = false
): Promise<string> {
  return withDryRunGuard('pd__escalate_incident', { id, escalationPolicyId, confirm }, 'destructive', async () => {
    const client = getPdClient();
    
    await client.put(`/incidents/${id}`, {
      incident: {
        type: 'incident',
        escalation_policy: {
          id: escalationPolicyId,
          type: 'escalation_policy_reference',
        },
      },
    });

    return JSON.stringify({
      escalated: true,
      incidentId: id,
      escalationPolicyId,
    }, null, 2);
  });
}
