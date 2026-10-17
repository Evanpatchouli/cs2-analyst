import type { DesktopPlayerAnalytics } from '@cs2-analyst/report-contract';
import type { UtilityIconKind } from './utility-icons';

/** Presentation-only mapping from the frozen utility DTO. No metric is inferred or recalculated. */
export type UtilityMetric = DesktopPlayerAnalytics['utility'];
export interface UtilityDisplayRow {
  label: string;
  kind: UtilityIconKind;
  value: string;
  /** Explains the slash-separated flash columns; only set when the row has that composite. */
  order?: string;
}

const count = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : value.toFixed(0);
const points = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(0)} 点`;
/** Both fire throw counters come from the same completeness/ambiguity gate; a merged total is unavailable if either is. */
const mergedFireThrow = (incendiary: number | null, molotov: number | null) =>
  incendiary === null || molotov === null ? null : incendiary + molotov;

export const flashOrder = '致盲敌人 / 队友受闪 / 闪光助攻';

/** 投掷统计: incendiary and molotov are one display row; their counts are summed. */
export function utilityThrowRows(utility: UtilityMetric): UtilityDisplayRow[] {
  return [
    { label: '闪光弹', kind: 'flashbang', value: count(utility.throws.flash) },
    { label: '烟雾弹', kind: 'smoke', value: count(utility.throws.smoke) },
    { label: '高爆手雷', kind: 'he', value: count(utility.throws.he) },
    { label: '燃烧弹', kind: 'incendiary', value: count(mergedFireThrow(utility.throws.incendiary, utility.throws.molotov)) },
    { label: '诱饵弹', kind: 'decoy', value: count(utility.throws.decoy) },
  ];
}

/**
 * 伤害统计: same labels and icons, only the right-hand value changes.
 * "—" stays the frozen metric's unavailable marker; "-" is reserved for a missing metric.
 */
export function utilityDamageRows(utility: UtilityMetric): UtilityDisplayRow[] {
  return [
    {
      label: '闪光弹', kind: 'flashbang',
      value: `${count(utility.enemyFlashEffects)}/${count(utility.teamFlashEffects)}/${count(utility.flashAssists)}`,
      order: flashOrder,
    },
    { label: '烟雾弹', kind: 'smoke', value: '-' },
    { label: '高爆手雷', kind: 'he', value: points(utility.heDamage) },
    { label: '燃烧弹', kind: 'incendiary', value: points(utility.fireDamage) },
    { label: '诱饵弹', kind: 'decoy', value: '-' },
  ];
}
