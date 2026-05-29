import * as queries from './queries.js';

export async function sloStatus(
  service: string,
  sloTarget: number = 0.999,
  windowDays: number = 30,
  namespace?: string
) {
  const nsFilter = namespace ? `,namespace="${namespace}"` : '';
  const totalQuery = `sum(increase(http_requests_total{job="${service}"${nsFilter}}[${windowDays}d]))`;
  const errorQuery = `sum(increase(http_requests_total{job="${service}",code=~"5.."${nsFilter}}[${windowDays}d]))`;

  const [totalRaw, errorRaw] = await Promise.all([
    queries.query(totalQuery),
    queries.query(errorQuery),
  ]);

  const totalResult = JSON.parse(totalRaw);
  const errorResult = JSON.parse(errorRaw);

  const totalRequests = totalResult.length > 0 ? parseFloat(totalResult[0].valueStr) : 0;
  const actualErrors = errorResult.length > 0 ? parseFloat(errorResult[0].valueStr) : 0;

  const currentSli = totalRequests > 0 ? 1 - (actualErrors / totalRequests) : 1;
  const errorBudgetTotal = (1 - sloTarget) * totalRequests;
  const consumedPercent = errorBudgetTotal > 0 ? (actualErrors / errorBudgetTotal) * 100 : 0;
  const remainingPercent = 100 - consumedPercent;

  // Assume full window elapsed for burn rate (simplification)
  const elapsedDays = windowDays;
  const burnRate = consumedPercent / ((elapsedDays / windowDays) * 100);

  let timeToExhaustionHours: number | null = null;
  if (burnRate > 0 && remainingPercent > 0) {
    const remainingBudget = errorBudgetTotal - actualErrors;
    const errorsPerHour = actualErrors / (elapsedDays * 24);
    timeToExhaustionHours = errorsPerHour > 0 ? Math.round(remainingBudget / errorsPerHour) : null;
  }

  let status: string;
  if (remainingPercent <= 0) status = 'budget_exhausted';
  else if (remainingPercent < 20) status = 'budget_critical';
  else if (remainingPercent < 50) status = 'budget_warning';
  else status = 'healthy';

  return JSON.stringify({
    service,
    slo_target: sloTarget,
    window_days: windowDays,
    current_sli: parseFloat(currentSli.toFixed(6)),
    slo_met: currentSli >= sloTarget,
    error_budget: {
      total_percent: parseFloat(((1 - sloTarget) * 100).toFixed(4)),
      consumed_percent: parseFloat(consumedPercent.toFixed(2)),
      remaining_percent: parseFloat(remainingPercent.toFixed(2)),
      burn_rate: parseFloat(burnRate.toFixed(4)),
      time_to_exhaustion_hours: timeToExhaustionHours,
    },
    status,
  }, null, 2);
}
