import { describe, expect, it } from '@jest/globals';
import { escapeLogqlString, formatLokiStreams } from '../src/providers/logs/queries';

describe('Loki result formatting', () => {
  it('expands all values in every stream and converts nanoseconds to ISO timestamps', () => {
    const firstTimestamp = 1_710_000_000_000_000_000n;
    const secondTimestamp = firstTimestamp + 1_000_000n;

    const result = formatLokiStreams([
      {
        stream: { service: 'payments', namespace: 'production' },
        values: [
          [firstTimestamp.toString(), 'level=error request failed'],
          [secondTimestamp.toString(), 'level=warn retrying'],
        ],
      },
      {
        stream: { app: 'worker', ns: 'jobs' },
        values: [['1710000002000', 'completed']],
      },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      timestamp: new Date(Number(firstTimestamp / 1_000_000n)).toISOString(),
      level: 'error',
      service: 'payments',
      namespace: 'production',
      count: 1,
    });
    expect(result[1].timestamp).toBe(new Date(Number(secondTimestamp / 1_000_000n)).toISOString());
    expect(result[2]).toMatchObject({ service: 'worker', namespace: 'jobs' });
  });

  it('escapes quotes, backslashes, and newlines in LogQL string values', () => {
    expect(escapeLogqlString('api"\\name\nnext'))
      .toBe('api\\"\\\\name\\nnext');
  });
});
