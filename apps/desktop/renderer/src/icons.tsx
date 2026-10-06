import React from 'react';

/**
 * Single-style icon set for the report page chrome: one 20px grid, monochrome
 * `currentColor` outlines, no mixed filled/outlined variants. Drawings are kept
 * local so the renderer never mixes unrelated icon sources.
 *
 * 道具面板的彩色实心图标是刻意区分的第二套风格，单独放在 `utility-icons.tsx`。
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

/** 帮助入口：问号。 */
export function QuestionCircleIcon(props: IconProps) {
  return <Icon {...props}>
    <circle cx="10" cy="10" r="7" />
    <path d="M8 7.9a2 2 0 1 1 2.8 1.85c-.6.28-.8.7-.8 1.35v.3" />
    <circle cx="10" cy="14" r=".55" fill="currentColor" stroke="none" />
  </Icon>;
}
