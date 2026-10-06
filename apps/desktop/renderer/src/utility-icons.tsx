import type { ReactNode } from 'react';
import { palette } from './theme';

/**
 * P5.4 道具图标：道具面板使用的彩色实心图标集。
 *
 * 刻意与 `icons.tsx` 分开：后者是界面自身的单色线性图标，道具列表不允许混入另一套风格。
 * 图形与填充色取自 CS2 Coach 道具图标资源包（flashbang / smoke / he-grenade /
 * incendiary / molotov / decoy），颜色统一登记在 `theme.ts` 的 `palette.utility`。
 *
 * 图标全部为装饰性内容：`aria-hidden`，含义由同一行的中文名称承担，
 * 因此不使用颜色表达任何数据含义，也不新增 accessible name。
 */
export type UtilityIconKind = 'flashbang' | 'smoke' | 'he' | 'incendiary' | 'molotov' | 'decoy';

/** 与图标资源包一致的 24px 网格实心图形。 */
const glyphs: Record<UtilityIconKind, ReactNode> = {
  flashbang: <g fill={palette.utility.flashbang}>
    <circle cx="12" cy="12" r="4.2" />
    <rect x="11.25" y="1.6" width="1.5" height="4.1" rx=".75" />
    <rect x="11.25" y="18.3" width="1.5" height="4.1" rx=".75" />
    <rect x="1.6" y="11.25" width="4.1" height="1.5" rx=".75" />
    <rect x="18.3" y="11.25" width="4.1" height="1.5" rx=".75" />
    <rect x="4.2" y="4.2" width="1.5" height="4" rx=".75" transform="rotate(-45 4.95 6.2)" />
    <rect x="18.3" y="15.8" width="1.5" height="4" rx=".75" transform="rotate(-45 19.05 17.8)" />
    <rect x="15.8" y="4.2" width="1.5" height="4" rx=".75" transform="rotate(45 16.55 6.2)" />
    <rect x="6.7" y="15.8" width="1.5" height="4" rx=".75" transform="rotate(45 7.45 17.8)" />
  </g>,
  smoke: <path fill={palette.utility.smoke} d="M7.3 18.2h9.1c3 0 5.1-1.7 5.1-4.1 0-2.2-1.8-3.9-4.1-4.1C16.8 7.6 14.7 6 12.2 6 9.4 6 7.1 8 6.7 10.6 4.2 10.7 2.5 12.3 2.5 14.5c0 2.1 1.9 3.7 4.8 3.7Z" />,
  he: <g fill={palette.utility.he}>
    <path d="M8.8 7.2h6.5l2.7 3.1-.9 7.3-3.3 3H8.9l-3.6-3 .1-6.7 3.4-3.7Z" />
    <rect x="10" y="3.5" width="4.1" height="3" rx=".8" />
    <path d="M13.2 3.2c.9-1.2 2.4-1.7 3.9-1.2l1.1.4-.6 1.6-1-.4c-.8-.2-1.6 0-2.1.7l-1.3-1.1Z" />
    <rect x="7.6" y="10.1" width="8.1" height="1.2" rx=".6" transform="rotate(28 11.65 10.7)" />
    <rect x="7.8" y="14.4" width="8.1" height="1.2" rx=".6" transform="rotate(-25 11.85 15)" />
  </g>,
  incendiary: <g fill={palette.utility.incendiary}>
    <path d="M12 2.4c1.2 2.3 3.5 3.9 3.5 6.6 0 1-.3 1.8-.8 2.5.1-2-1-3.1-2.1-4.2-.2 1.8-1.6 2.8-2.8 4-1 1-1.6 2.2-1.6 3.8 0 2.6 1.9 4.5 4.5 4.5 3.1 0 5.5-2.3 5.5-5.6 0-4-2.7-7.9-6.2-11.6Z" />
    <path d="M10.8 20.6H6.3l-2.7-2.8 1-5.2 2.8-2.4c-.2 1.1-.3 2.3-.1 3.4.5 3.1 2 5.5 3.5 7Z" opacity=".95" />
  </g>,
  molotov: <g fill={palette.utility.molotov}>
    <path d="M9.2 3h5.6v4.1l1.4 1.8v8.9c0 2-1.6 3.6-3.6 3.6h-1.2c-2 0-3.6-1.6-3.6-3.6V8.9l1.4-1.8V3Z" />
    <rect x="10.2" y="1.7" width="3.6" height="2.2" rx=".5" />
    <path d="M15.2 2.2c1.6.7 3 1.9 3.6 3.5.4 1 .3 2-.2 2.9-1.4-1-2.4-2.1-2.7-3.4-.2-.8-.4-1.8-.7-3Z" />
    <path d="M8.8 13.6h6.4v4.1c0 1.4-1.1 2.5-2.5 2.5h-1.4a2.5 2.5 0 0 1-2.5-2.5v-4.1Z" opacity=".75" />
  </g>,
  decoy: <g fill={palette.utility.decoy}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="3.2" fill={palette.pageTop} />
    <path d="M12 1.7a10.3 10.3 0 0 1 8.9 5.2l-2.1 1.2A7.9 7.9 0 0 0 12 4.1V1.7Zm0 20.6a10.3 10.3 0 0 1-8.9-5.2l2.1-1.2A7.9 7.9 0 0 0 12 19.9v2.4Z" />
  </g>,
};

/** 统一 22px 视觉尺寸的装饰性道具图标。 */
export function UtilityIcon({ kind, size = 22 }: { kind: UtilityIconKind; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{glyphs[kind]}</svg>;
}
