import { getCoreV1 } from './client.js';
import * as k8s from '@kubernetes/client-node';

export async function getNodeStatus(nodeName?: string): Promise<string> {
  const coreV1 = getCoreV1();

  if (nodeName) {
    const node = await coreV1.readNode({ name: nodeName });
    return JSON.stringify(formatNode(node), null, 2);
  }

  const res = await coreV1.listNode();
  return JSON.stringify(res.items.map(formatNode), null, 2);
}

function formatNode(node: any) {
  const conditions = (node.status?.conditions || [])
    .filter((c: any) => ['Ready', 'MemoryPressure', 'DiskPressure', 'PIDPressure'].includes(c.type))
    .map((c: any) => ({ type: c.type, status: c.status, reason: c.reason, message: c.message }));

  return {
    name: node.metadata?.name,
    conditions,
    capacity: node.status?.capacity,
    allocatable: node.status?.allocatable,
    labels: node.metadata?.labels,
    taints: node.spec?.taints || [],
  };
}
