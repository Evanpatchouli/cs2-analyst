import React from 'react';

/**
 * Single-style icon set for the report page: one 20px grid, monochrome
 * `currentColor` outlines, no mixed filled/outlined variants. Drawings are kept
 * local so the renderer never mixes unrelated icon sources.
 */
export type IconProps = { size?: number; className?: string };

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Icon({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 20 20"
    aria-hidden="true" focusable="false" {...stroke}>{children}</svg>;
}

/** 闪光弹：闪光符号。 */
export function FlashbangIcon(props: IconProps) {
  return <Icon {...props}><path d="M11.2 2.6 5.4 11.2h4l-.6 6.2 5.8-8.6h-4z" /></Icon>;
}

/** 烟雾弹：烟雾。 */
export function SmokeIcon(props: IconProps) {
  return <Icon {...props}><path d="M7 15.5a3.5 3.5 0 0 1-.4-6.98 4 4 0 0 1 7.73-.9A3.25 3.25 0 0 1 14 15.5Z" /></Icon>;
}

/** 高爆手雷：手雷轮廓。 */
export function ExplosiveIcon(props: IconProps) {
  return <Icon {...props}>
    <ellipse cx="10" cy="11.4" rx="4.2" ry="5" />
    <path d="M6.5 9.4h7M6.5 12.4h7M10 6.5v9.8M8.6 6.6V4.2h2.8v2.4" />
    <circle cx="10" cy="3" r="1.2" />
  </Icon>;
}

/** 燃烧弹：火焰。 */
export function IncendiaryIcon(props: IconProps) {
  return <Icon {...props}><path d="M10 2.8c2.3 2.7 3.5 4.5 3.5 6.6a3.5 3.5 0 1 1-7 0c0-1.2.5-2.4 1.4-3.6.4.9.9 1.5 1.4 1.8-.2-1.7-.1-3.2.7-4.8Z" /></Icon>;
}

/** 燃烧瓶：瓶身。 */
export function MolotovIcon(props: IconProps) {
  return <Icon {...props}><path d="M8.4 2.6h3.2M9.2 2.6v2.9L7.4 8.3a3 3 0 0 0-.4 1.5v4.4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V9.8a3 3 0 0 0-.4-1.5l-1.8-2.8V2.6" /></Icon>;
}

/** 诱饵弹：声音。 */
export function DecoyIcon(props: IconProps) {
  return <Icon {...props}>
    <circle cx="7.6" cy="10" r="1.4" fill="currentColor" stroke="none" />
    <path d="M10.4 7.6a3.4 3.4 0 0 1 0 4.8M12.9 5.4a6.3 6.3 0 0 1 0 9.2" />
  </Icon>;
}

/** 帮助入口：问号。 */
export function QuestionCircleIcon(props: IconProps) {
  return <Icon {...props}>
    <circle cx="10" cy="10" r="7" />
    <path d="M8 7.9a2 2 0 1 1 2.8 1.85c-.6.28-.8.7-.8 1.35v.3" />
    <circle cx="10" cy="14" r=".55" fill="currentColor" stroke="none" />
  </Icon>;
}
