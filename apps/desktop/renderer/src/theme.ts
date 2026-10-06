import { webDarkTheme } from '@fluentui/react-components';
import type { Theme } from '@fluentui/react-components';

/**
 * P5.4 presentation palette: a restrained deep blue-grey system.
 *
 * This is the single place where the report page defines fixed colours. Components read
 * them either through the Fluent UI tokens below (`tokens.colorNeutral*`) or through
 * `palette` inside `makeStyles`, so the renderer never scatters magic colour values.
 * No Analytics / Findings / DTO semantics are involved — this file is presentation only.
 */
export const palette = {
  /** Page background: deep blue-grey, slightly lighter at the top. */
  pageTop: '#161d26',
  pageBottom: '#111821',
  pageGradient: 'linear-gradient(180deg, #161d26 0%, #111821 100%)',
  /** Cards sit one level above the page; inputs and overlays one level above cards. */
  card: '#1d242e',
  cardHover: '#222b36',
  raised: '#232c38',
  raisedHover: '#28313e',
  /** Very weak blue-grey borders: cards, dividers and rows share one family. */
  border: 'rgba(148, 163, 184, 0.12)',
  borderStrong: 'rgba(148, 163, 184, 0.22)',
  rowDivider: 'rgba(148, 163, 184, 0.08)',
  /** Text stays white / neutral grey. */
  text: '#e8eef6',
  textSecondary: '#c5cfdc',
  textMuted: '#8f9db0',
  /** Colours reserved for the utility icons; every one is a visual anchor, not a data encoding. */
  utility: {
    flashbang: '#4DB6FF',
    smoke: '#B9C7D9',
    he: '#FF5A36',
    incendiary: '#FF8A1F',
    molotov: '#FFB13B',
    decoy: '#57D68D',
  },
} as const;

/**
 * Fluent UI neutral tokens re-pointed at the blue-grey palette so every Fluent component
 * (Card, Divider, Badge, Dropdown, Tooltip, MessageBar, Spinner) inherits the same system.
 * Brand and status ramps stay as `webDarkTheme` defines them: colour appears only on the
 * utility icons, severity / clutch badges and a few interaction states.
 */
export const coachTheme: Theme = {
  ...webDarkTheme,
  colorNeutralBackground1: palette.card,
  colorNeutralBackground1Hover: palette.cardHover,
  colorNeutralBackground1Pressed: palette.pageTop,
  colorNeutralBackground1Selected: palette.cardHover,
  colorNeutralBackground2: palette.pageBottom,
  colorNeutralBackground2Hover: palette.raised,
  colorNeutralBackground2Pressed: palette.pageTop,
  colorNeutralBackground3: palette.raised,
  colorNeutralBackground3Hover: palette.raisedHover,
  colorNeutralBackground3Pressed: palette.pageTop,
  colorNeutralBackground4: palette.raised,
  colorNeutralBackground4Hover: palette.raisedHover,
  colorNeutralBackground4Pressed: palette.pageTop,
  colorNeutralStroke1: palette.borderStrong,
  colorNeutralStroke1Hover: 'rgba(148, 163, 184, 0.32)',
  colorNeutralStroke2: palette.border,
  colorNeutralStroke3: palette.rowDivider,
  colorNeutralStrokeAccessible: palette.textSecondary,
  colorNeutralForeground1: palette.text,
  colorNeutralForeground1Hover: palette.text,
  colorNeutralForeground2: palette.textSecondary,
  colorNeutralForeground2Hover: palette.text,
  colorNeutralForeground2Pressed: palette.text,
  colorNeutralForeground3: palette.textMuted,
  colorNeutralForeground3Hover: palette.textSecondary,
  colorNeutralForeground3Pressed: palette.textSecondary,
  colorNeutralForeground4: '#7b8a9d',
  colorNeutralForegroundDisabled: '#5f6c7c',
  colorNeutralBackgroundDisabled: palette.pageTop,
  colorNeutralStrokeDisabled: palette.rowDivider,
  colorSubtleBackground: 'transparent',
  colorSubtleBackgroundHover: 'rgba(148, 163, 184, 0.10)',
  colorSubtleBackgroundPressed: 'rgba(148, 163, 184, 0.16)',
  colorSubtleBackgroundSelected: 'rgba(148, 163, 184, 0.14)',
  colorTransparentBackground: 'transparent',
  colorTransparentStroke: 'transparent',
};
