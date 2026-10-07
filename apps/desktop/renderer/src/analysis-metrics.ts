import type { DesktopPlayerComparison } from '@cs2-analyst/report-contract';

export const comparisonMetrics = [
  { key: 'adr', label: 'ADR', digits: 2 },
  { key: 'kdRatio', label: 'K/D', digits: 2 },
  { key: 'kastPercentage', label: 'KAST', digits: 1, percent: true },
  { key: 'headshotPercentage', label: 'HS%', digits: 1, percent: true },
  { key: 'openingWinRate', label: '首杀对决胜率', digits: 1, percent: true, fraction: true },
  { key: 'tradeRate', label: '死亡后队友补枪率', digits: 1, percent: true },
  { key: 'tradeKills', label: '补枪击杀', digits: 0 },
] as const;
export type ComparisonMetric = typeof comparisonMetrics[number];
export type ComparisonMetricKey = ComparisonMetric['key'];

export function comparisonValue(player: DesktopPlayerComparison, metric: ComparisonMetric): string {
  const value = player[metric.key];
  if (value === null) return '—';
  const scaled = 'fraction' in metric ? value * 100 : value;
  return `${scaled.toFixed(metric.digits)}${'percent' in metric ? '%' : ''}`;
}
export function comparisonIncomplete(player: DesktopPlayerComparison, key: ComparisonMetricKey): boolean {
  return key === 'kastPercentage' ? !player.kastComplete
    : key === 'tradeRate' || key === 'tradeKills' ? !player.tradeComplete : false;
}
export function sortedComparison(players: readonly DesktopPlayerComparison[], key: ComparisonMetricKey): DesktopPlayerComparison[] {
  return [...players].sort((a, b) => {
    const x = a[key], y = b[key];
    return x === null ? (y === null ? 0 : 1) : y === null ? -1 : y - x;
  });
}
