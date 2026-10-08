import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Badge, Body1, Button, Card, Caption1, Divider, Dropdown, FluentProvider,
  MessageBar, MessageBarBody, Option, Spinner, Subtitle1, Title1, Title2,
  Tooltip, TabList, Tab, makeStyles, tokens,
} from '@fluentui/react-components';
import type {
  DesktopMatchReport, DesktopPlayerAnalytics, DesktopRoundTimeline, DesktopTimelineEvent,
} from '@cs2-analyst/report-contract';
import { KillFeedEvent } from './killfeed-event';
import { AnalysisViews } from './analysis-views';
import { DeepReview } from './deep-review';
import { useReport } from './store';
import { QuestionCircleIcon } from './icons';
import { UtilityIcon } from './utility-icons';
import type { UtilityIconKind } from './utility-icons';
import { coachTheme, palette, useScrollbarStyles } from './theme';
import { AppTitlebar } from './app-titlebar';

/** One surface for every card on the page: same background, same weak border, same radius, no shadows. */
const cardSurface = {
  backgroundColor: palette.card,
  border: `1px solid ${palette.border}`,
  borderRadius: tokens.borderRadiusLarge,
  boxShadow: 'none',
};

/** One row rhythm for every list on the page (utility counts, utility effects, clutch). */
const rowHeight = '34px';

const useStyles = makeStyles({
  page: { height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: palette.pageBottom, backgroundImage: palette.pageGradient, color: tokens.colorNeutralForeground1 },
  body: { flex: 1, minHeight: 0, overflowY: 'auto' },
  content: { maxWidth: '1120px', margin: '0 auto', padding: '28px 32px 44px', display: 'flex', flexDirection: 'column', gap: '20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' },
  column: { display: 'flex', flexDirection: 'column', gap: '8px' },
  section: { display: 'flex', flexDirection: 'column', gap: '16px' },
  muted: { color: tokens.colorNeutralForeground3 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', '@media (max-width: 900px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } },
  split: { display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: '20px', '@media (max-width: 900px)': { gridTemplateColumns: '1fr' } },
  stat: { ...cardSurface, padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' },
  statHeader: { display: 'flex', alignItems: 'center', gap: '2px' },
  panel: { ...cardSurface, padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' },
  panelHeader: { display: 'flex', alignItems: 'center', gap: '2px' },
  help: {
    color: tokens.colorNeutralForeground3, flexShrink: 0,
    ':hover': { color: tokens.colorNeutralForeground1 },
    ':focus-visible': { color: tokens.colorNeutralForeground1 },
  },
  list: { display: 'flex', flexDirection: 'column' },
  row: {
    display: 'grid', alignItems: 'center', columnGap: '10px', minHeight: rowHeight, padding: '0 4px',
    borderBottom: `1px solid ${palette.rowDivider}`, ':last-child': { borderBottomStyle: 'none' },
  },
  listRow: { gridTemplateColumns: '22px minmax(0, 1fr) auto' },
  effectRow: { gridTemplateColumns: 'minmax(0, 1fr) auto' },
  rowIcon: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px' },
  rowLabel: { color: tokens.colorNeutralForeground2 },
  clutchHead: { display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) auto', alignItems: 'center', columnGap: '10px', padding: '0 4px' },
  clutchRow: { gridTemplateColumns: '56px minmax(0, 1fr) auto' },
  numberCell: { fontVariantNumeric: 'tabular-nums' },
  clutchResult: { display: 'flex', justifyContent: 'flex-end' },
  rowValue: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  finding: { ...cardSurface, padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  evidenceSummary: { cursor: 'pointer', borderRadius: tokens.borderRadiusMedium, padding: '4px', ':hover': { backgroundColor: palette.cardHover }, ':focus-visible': { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '2px' } },
  evidence: { padding: '8px 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px', borderBottom: `1px solid ${palette.rowDivider}`, overflowWrap: 'anywhere' },
  empty: { ...cardSurface, padding: '72px 32px', alignItems: 'center', textAlign: 'center' },
  timelineRound: {
    borderTop: `1px solid ${palette.rowDivider}`, ':first-child': { borderTopStyle: 'none' },
    borderRadius: tokens.borderRadiusMedium, transitionProperty: 'background-color', transitionDuration: '240ms',
  },
  timelineRoundHighlight: { backgroundColor: palette.raised },
  timelineRow: {
    appearance: 'none', background: 'transparent', border: 'none', margin: 0, font: 'inherit', textAlign: 'left',
    boxSizing: 'border-box', cursor: 'pointer', width: '100%',
    display: 'grid', gridTemplateColumns: '56px 56px 76px minmax(0, 1fr) auto', alignItems: 'center',
    columnGap: '10px', minHeight: rowHeight, padding: '0 6px', color: tokens.colorNeutralForeground1,
    ':hover': { backgroundColor: palette.cardHover },
    ':focus-visible': { outline: `1px solid ${palette.borderStrong}`, outlineOffset: '2px' },
  },
  timelineSide: { color: tokens.colorNeutralForeground2 },
  timelineToggle: { color: tokens.colorNeutralForeground3 },
  timelineDetail: { display: 'flex', flexDirection: 'column', padding: '2px 6px 10px 72px', '@media (max-width: 650px)': { paddingLeft: '6px' } },
  timelineEvent: {
    display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr) auto', alignItems: 'baseline',
    columnGap: '10px', padding: '4px 0', borderTop: `1px solid ${palette.rowDivider}`,
    ':first-child': { borderTopStyle: 'none' },
  },
  timelineTime: { color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  playerName: { display: 'block', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  playerDropdown: { maxWidth: '250px', '& button': { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
});

/** Display-only number rules: counts 0, ADR/seconds 2, percentages 1, KAST integer. */
const decimal = (value: number | null, digits: number) => value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
const count = (value: number | null) => decimal(value, 0);
const percent = (value: number | null, digits = 1) => value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}%`;
const seconds = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(2)} 秒`;
const points = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(0)} 点`;

/** Presentation-only help copy. Metric definitions stay identical to the frozen contracts. */
const help = {
  kda: '击杀 / 死亡 / 助攻。仅统计正式回合内符合规则的事件，不包含热身和回合结束后的无效事件。',
  adr: '每回合平均有效伤害。按实际从敌人生命值中扣除的伤害计算，不计友伤、自伤和超过敌人剩余生命值的额外伤害。',
  hs: '爆头击杀占全部有效击杀的比例。',
  kast: '某回合只要满足击杀、助攻、存活，或死亡后队友完成补枪任一条件，该回合就计入 KAST，用于观察整场比赛的稳定参与度。',
  tradeRate: '你死亡后，队友在 5 秒内击杀该名敌人的比例。队友当时存活不代表一定具备补枪位置，因此该指标主要用于定位值得复盘的死亡回合。',
  tradeKills: '队友被敌人击杀后，你在 5 秒内击杀该名敌人的次数。',
  opening: '每回合首个有效击杀形成的首杀对决，包括首杀、首死以及对决胜率，用于观察开局阶段的影响。',
  clutch: '当你成为队伍唯一存活玩家且敌方仍有人存活时形成 1vN 残局机会。只有证据明确的回合才会计入。',
  utility: '统计本场正式回合内确认的道具事件。投掷数量为游戏记录的投掷次数；伤害为实际从敌人生命值中扣除的有效伤害；受闪次数按游戏记录到的受闪事件统计，可能包含几乎未产生实际致盲效果的记录，因此不能直接理解为“有效闪光次数”或实际致盲时长。“—”表示当前录像证据不足，无法可靠计算。',
};
const flashCaveat = '受闪次数按游戏记录到的受闪事件统计，其中可能包含几乎未产生实际致盲效果的记录，因此不能直接理解为“有效闪光次数”或实际致盲时长。“—”表示当前录像证据不足，无法可靠计算。';

/** Findings evidence is a frozen technical contract; only its presentation is localized. */
const metricLabels: Record<string, string> = {
  "side.CT.adr": "CT 方 ADR", "side.T.adr": "T 方 ADR",
  "side.CT.roundsPlayed": "CT 方参与回合", "side.T.roundsPlayed": "T 方参与回合",
  "side.CT.kills": "CT 方击杀", "side.T.kills": "T 方击杀",
  "side.CT.deaths": "CT 方死亡", "side.T.deaths": "T 方死亡",
  "trade.tradeableDeaths": "死亡时仍有队友存活", "trade.tradedDeaths": "其中 5 秒内队友击杀该敌人",
  "trade.tradeRate": "补枪率", "trade.complete": "补枪证据完整", "tradeWindow.seconds": "补枪判定窗口",
  "opening.kills": "首杀", "opening.deaths": "首死", "opening.duels": "首杀对决次数", "opening.winRate": "首杀对决胜率",
  "utility.throws.counts.hegrenade": "高爆手雷投掷", "utility.throws.counts.fire": "燃烧道具投掷",
  "utility.he.enemyDamage": "高爆手雷对敌伤害", "utility.fire.enemyDamage": "燃烧伤害",
  "utility.throws.counts.flashbang": "闪光弹投掷", "utility.flash.enemy.count": "敌人受闪效果",
  "utility.flash.assists": "闪光助攻", "utility.flash.teammate.nonzeroEffects": "队友受闪效果",
  "utility.flash.teammate.evidence.victim": "受闪队友",
  "utility.flash.teammate.evidence.event.blindDurationSeconds": "游戏记录的受闪时长（原始值）",
  "clutch.list.opponents": "残局敌人数量", "clutch.list.won": "残局获胜", "clutch.list.side": "残局所在阵营",
};
const metricLabel = (metric: string) => metricLabels[metric] ?? metric;
/** Clutch outcomes are labelled; a missing result is never guessed. Colour only reinforces the label. */
const clutchResult = (won: boolean | null): { label: string; color: 'success' | 'danger' | 'warning' } =>
  won === null ? { label: '结果未知', color: 'warning' } : won ? { label: '成功', color: 'success' } : { label: '失败', color: 'danger' };
/** Round Timeline labels. Missing side/result/score/time stay unknown and are never guessed. */
const sideText = (side: DesktopRoundTimeline['side']) => side === 'Unknown' ? '阵营未知' : side;
const scoreAfterText = (score: DesktopRoundTimeline['scoreAfter']) => score ? `${score.initialCT} : ${score.initialT}` : '—';
const roundResult = (result: DesktopRoundTimeline['result']): { label: string; color: 'success' | 'danger' | 'warning' } =>
  result === 'win' ? { label: '成功', color: 'success' }
    : result === 'loss' ? { label: '失败', color: 'danger' } : { label: '结果未知', color: 'warning' };
const eventTime = (event: DesktopTimelineEvent) =>
  event.roundTimeSeconds === undefined ? '—' : `+${event.roundTimeSeconds.toFixed(2)} 秒`;
const severityText: Record<string, string> = { high: "高", medium: "中", low: "低", positive: "亮点" };
const evidenceText = (value: number | boolean | string, unit: string): string => {
  if (unit === "flag") return value === true ? "是" : value === false ? "否" : String(value);
  if (typeof value !== "number") return String(value);
  switch (unit) {
    case "ratio": return `${(value * 100).toFixed(1)}%`;
    case "percent": return `${value.toFixed(1)}%`;
    case "hp": return points(value);
    case "hp/round": return `${value.toFixed(2)} 点/回合`;
    case "seconds": return seconds(value);
    case "count": return count(value);
    default: return decimal(value, Number.isInteger(value) ? 0 : 2);
  }
};

/** Uniform help entry: Fluent UI v9 Tooltip on a focusable, clickable button. */
function InfoTip({ label, content }: { label: string; content: React.ReactElement | string }) {
  const s = useStyles();
  return <Tooltip content={content} relationship="description" withArrow>
    <Button appearance="transparent" size="small" className={s.help} icon={<QuestionCircleIcon size={16} />} aria-label={`${label}说明`} />
  </Tooltip>;
}

function Stat({ label, value, hint, tip }: { label: string; value: string; hint?: React.ReactNode; tip: React.ReactElement | string }) {
  const s = useStyles();
  return <Card className={s.stat}>
    <div className={s.statHeader}><Caption1 className={s.muted}>{label}</Caption1><InfoTip label={label} content={tip} /></div>
    <Title2>{value}</Title2>
    {hint ? <Caption1>{hint}</Caption1> : null}
  </Card>;
}

function Findings({ report, playerId, onShowRounds }: {
  report: DesktopMatchReport; playerId: string; onShowRounds: (rounds: number[]) => void;
}) {
  const s = useStyles();
  const rows = report.findings.filter(f => f.playerId === playerId);
  return <section className={s.section} aria-label="基础规则提示">
    <Title2>基础规则提示</Title2>
    <Caption1 className={s.muted}>来自基础指标规则 · 深度交火与团队证据请查看「深度复盘」</Caption1>
    {rows.length ? rows.map(f => <Card key={f.id} className={s.finding} data-rule={f.ruleId}>
      <div className={s.header}><Subtitle1>{f.title}</Subtitle1><Badge appearance="tint" color={f.severity === 'positive' ? 'success' : f.severity === 'high' ? 'danger' : 'warning'}>{severityText[f.severity] ?? f.severity}</Badge></div>
      <Body1>{f.summary}</Body1>
      {f.relatedRounds?.length ? <div>
        <Button appearance="subtle" size="small" onClick={() => onShowRounds(f.relatedRounds!)}>
          {f.relatedRounds.length === 1 ? `查看 R${f.relatedRounds[0]}` : '查看相关回合'}
        </Button>
      </div> : null}
      <details><summary className={s.evidenceSummary}>查看证据（{f.evidence.length}）</summary>
        {f.evidence.map((e, i) => {
          const when = [e.round === undefined ? null : `R${e.round}`, e.roundTimeSeconds === undefined ? null : `回合开始后 ${seconds(e.roundTimeSeconds)}`].filter(Boolean).join(' · ');
          return <div key={i} className={s.evidence}>
            <Caption1 className={s.muted}>{metricLabel(e.metric)}{when ? ` · ${when}` : ''}</Caption1>
            <Caption1>{evidenceText(e.value, e.unit)}</Caption1>
          </div>;
        })}
      </details>
    </Card>) : <Body1>本场没有达到规则阈值且证据充分的复盘结论。</Body1>}
  </section>;
}

/** Row-per-metric utility panel; the numbers come straight from the DTO. */
function UtilityPanel({ utility }: { utility: DesktopPlayerAnalytics['utility'] }) {
  const s = useStyles();
  const throws: { label: string; kind: UtilityIconKind; value: string }[] = [
    { label: '闪光弹', kind: 'flashbang', value: count(utility.throws.flash) },
    { label: '烟雾弹', kind: 'smoke', value: count(utility.throws.smoke) },
    { label: '高爆手雷', kind: 'he', value: count(utility.throws.he) },
    { label: '燃烧弹', kind: 'incendiary', value: count(utility.throws.incendiary) },
    { label: '燃烧瓶', kind: 'molotov', value: count(utility.throws.molotov) },
    { label: '诱饵弹', kind: 'decoy', value: count(utility.throws.decoy) },
  ];
  const effects = [
    { label: '高爆手雷对敌伤害', value: points(utility.heDamage) },
    { label: '燃烧伤害', value: points(utility.fireDamage) },
    { label: '敌人受闪效果', value: count(utility.enemyFlashEffects) },
    { label: '队友受闪效果', value: count(utility.teamFlashEffects) },
    { label: '闪光助攻', value: count(utility.flashAssists) },
  ];
  return <Card className={s.panel}>
    <div className={s.panelHeader}><Subtitle1>道具</Subtitle1><InfoTip label="道具面板" content={help.utility} /></div>
    <Caption1 className={s.muted}>投掷数量</Caption1>
    <div className={s.list}>
      {throws.map(row => <div key={row.label} className={`${s.row} ${s.listRow}`}>
        <span className={s.rowIcon}><UtilityIcon kind={row.kind} /></span>
        <span className={s.rowLabel}>{row.label}</span>
        <span className={s.rowValue}>{row.value}</span>
      </div>)}
    </div>
    <Divider />
    <Caption1 className={s.muted}>道具效果</Caption1>
    <div className={s.list}>
      {effects.map(row => <div key={row.label} className={`${s.row} ${s.effectRow}`}>
        <span className={s.rowLabel}>{row.label}</span>
        <span className={s.rowValue}>{row.value}</span>
      </div>)}
    </div>
    {utility.flashEffectsComplete ? null : <Caption1 className={s.muted}>受闪与闪光助攻证据不完整，相关数值可能偏低。</Caption1>}
    <Caption1 className={s.muted}>{flashCaveat}</Caption1>
  </Card>;
}

/** Round-by-round summary with click-to-expand key events; all rounds start collapsed. */
function RoundTimeline({ rounds, expanded, highlighted, onToggle }: {
  rounds: DesktopRoundTimeline[];
  expanded: number[];
  highlighted: number | null;
  onToggle: (round: number) => void;
}) {
  const s = useStyles();
  return <section id="round-timeline" className={s.section} aria-label="回合时间线">
    <Title2>回合时间线</Title2>
    <Caption1 className={s.muted}>每回合显示目标玩家阵营、胜负、回合结束比分与关键事件；点击回合展开详情，时间为回合开始后的秒数。</Caption1>
    <Card className={s.panel}>
      <div className={s.list}>
        {rounds.map(r => {
          const open = expanded.includes(r.round);
          const badge = roundResult(r.result);
          return <div key={r.round} id={`round-r${r.round}`} data-timeline-round={r.round}
            data-highlighted={highlighted === r.round ? 'true' : undefined}
            className={`${s.timelineRound}${highlighted === r.round ? ` ${s.timelineRoundHighlight}` : ''}`}>
            <button type="button" className={s.timelineRow} data-round-summary={r.round} aria-expanded={open} onClick={() => onToggle(r.round)}>
              <span className={s.numberCell}>R{r.round}</span>
              <span className={s.timelineSide}>{sideText(r.side)}</span>
              <span><Badge appearance="tint" color={badge.color}>{badge.label}</Badge></span>
              <span className={s.numberCell}>{scoreAfterText(r.scoreAfter)}</span>
              <span className={s.timelineToggle}>{open ? '收起' : '查看详情'}</span>
            </button>
            {open ? <div className={s.timelineDetail} data-round-detail={r.round}>
              {r.events.length ? r.events.map(e => e.type === 'kill' || e.type === 'death' ? <KillFeedEvent key={e.id} event={e} round={r.round} /> : <div key={e.id} className={s.timelineEvent}>
                <span className={s.timelineTime}>{eventTime(e)}</span>
                <Tooltip content={e.description} relationship="description"><span className={s.playerName} tabIndex={0}>{e.description}</span></Tooltip>
              </div>) : <Caption1 className={s.muted}>本回合没有可展示的关键事件。</Caption1>}
            </div> : null}
          </div>;
        })}
      </div>
    </Card>
  </section>;
}

function Report({ report, playerId }: { report: DesktopMatchReport; playerId: string }) {
  const s = useStyles();
  const selectPlayer = useReport(state => state.selectPlayer);
  const player = report.players.find(p => p.id === playerId)!;
  const p = report.analytics.find(a => a.playerId === playerId)!;
  const timeline = report.timeline.find(t => t.playerId === playerId)?.rounds ?? [];
  const [activeTab, setActiveTab] = useState('report');
  const [expanded, setExpanded] = useState<number[]>([]);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [scrollRound, setScrollRound] = useState<number | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);
  const toggleRound = (round: number) =>
    setExpanded(prev => prev.includes(round) ? prev.filter(x => x !== round) : [...prev, round]);
  // Findings linkage: expand the related rounds, scroll to the first and briefly emphasise it.
  const showRounds = (rounds: number[]) => {
    const known = rounds.filter(round => timeline.some(r => r.round === round));
    if (!known.length) return;
    setActiveTab('timeline');
    setScrollRound(known[0]);
    setExpanded(prev => Array.from(new Set([...prev, ...known])));
    setHighlighted(known[0]);
    if (highlightTimer.current !== undefined) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlighted(null), 2400);
  };
  // Effects run after React commits hidden=false and expanded content to the DOM.
  useEffect(() => {
    if (activeTab !== 'timeline' || scrollRound === null) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`round-r${scrollRound}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setScrollRound(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, scrollRound]);
  useEffect(() => () => { if (highlightTimer.current !== undefined) window.clearTimeout(highlightTimer.current); }, []);
  return <>
    <div className={s.header}>
      <div className={s.column}><Title1>{report.match.map}</Title1><Body1>{report.match.score ? `${report.match.score.initialCT} : ${report.match.score.initialT}` : '比分不可用'} · 开局 CT 队 / 开局 T 队 · {report.match.rounds} 回合</Body1><Caption1 className={s.muted}>{report.match.fileName}</Caption1></div>
      <div className={s.column}><Caption1>目标玩家</Caption1><Tooltip content={player.nickname} relationship="description"><Dropdown className={s.playerDropdown} listbox={{ style: { maxWidth: '250px' } }} aria-label="目标玩家" value={player.nickname} selectedOptions={[playerId]} onOptionSelect={(_, data) => data.optionValue && selectPlayer(data.optionValue)}>
        {report.players.map(p => <Option key={p.id} value={p.id} text={p.nickname}><Tooltip content={p.nickname} relationship="description"><span className={s.playerName}>{p.nickname}</span></Tooltip></Option>)}
      </Dropdown></Tooltip></div>
    </div>
    <TabList aria-label="报告页面" selectedValue={activeTab} onTabSelect={(_, data) => setActiveTab(String(data.value))}>
      <Tab id="report-tab" value="report" aria-controls="report-panel">比赛报告</Tab>
      <Tab id="deep-review-tab" value="deep-review" aria-controls="deep-review-panel">深度复盘</Tab>
      <Tab id="timeline-tab" value="timeline" aria-controls="timeline-panel">回合时间线</Tab>
      <Tab id="analysis-tab" value="analysis" aria-controls="analysis-panel">分析</Tab>
    </TabList>
    <div id="deep-review-panel" role="tabpanel" aria-labelledby="deep-review-tab" hidden={activeTab !== 'deep-review'}>
      <DeepReview key={playerId} player={report.deepReview.players.find(p => p.playerId === playerId)!} onShowRounds={showRounds} />
    </div>
    <div id="report-panel" role="tabpanel" aria-labelledby="report-tab" hidden={activeTab !== 'report'}>
      <div className={s.section}>
      {p.coverage.notes.length ? <MessageBar intent="warning"><MessageBarBody>{p.coverage.notes.join(' ')}</MessageBarBody></MessageBar> : null}
      <div className={s.grid} aria-label="玩家指标">
        <Stat label="K / D / A" value={`${p.kills} / ${p.deaths} / ${p.assists}`} tip={help.kda} />
        <Stat label="ADR" value={decimal(p.adr, 2)} hint="每回合平均有效伤害" tip={help.adr} />
        <Stat label="HS%（爆头率）" value={percent(p.headshotPercentage, 1)} tip={help.hs} />
        <Stat label="KAST（回合贡献率）" value={percent(p.kast.percentage, 0)} hint={`${p.kast.rounds} / ${p.kast.eligibleRounds} 回合${p.kast.complete ? '' : ' · 部分证据'}`} tip={help.kast} />
        <Stat label="Trade rate（死亡后队友补枪率）" value={percent(p.trade.rate, 1)}
          hint={`${count(p.trade.tradedDeaths)} / ${count(p.trade.tradeableDeaths)} 次死亡后队友完成补枪${p.trade.complete ? '' : ' · 部分证据'}`}
          tip={<>{help.tradeRate}<br />{`死亡时仍有队友存活：${count(p.trade.tradeableDeaths)}`}<br />{`其中 5 秒内队友击杀该敌人：${count(p.trade.tradedDeaths)}`}</>} />
        <Stat label="Trade kills（补枪击杀）" value={count(p.trade.kills)} tip={help.tradeKills} />
        <Stat label="Opening（首杀对决）" value={`${p.opening.kills} 首杀 / ${p.opening.deaths} 首死`} hint={p.opening.winRate === null ? undefined : `首杀对决胜率 ${percent(p.opening.winRate * 100, 1)}`} tip={help.opening} />
        <Stat label="Clutch（残局）" value={`${p.clutch.wins} 胜 / ${p.clutch.opportunities} 次`} hint={p.clutch.complete ? '已证明的 1vN 机会' : '仅已证明的部分机会'} tip={help.clutch} />
      </div>
      <Divider />
      <div className={s.split}>
        <Findings report={report} playerId={playerId} onShowRounds={showRounds} />
        <div className={s.section}>
          <Title2>道具与残局</Title2>
          <UtilityPanel utility={p.utility} />
          <Card className={s.panel}>
            <Subtitle1>残局</Subtitle1>
            {p.clutch.list.length ? <>
              <div className={s.clutchHead}>
                <Caption1 className={s.muted}>回合</Caption1>
                <Caption1 className={s.muted}>局面</Caption1>
                <Caption1 className={s.muted}>结果</Caption1>
              </div>
              <div className={s.list}>
                {p.clutch.list.map(c => {
                  const result = clutchResult(c.won);
                  return <div key={c.round} className={`${s.row} ${s.clutchRow}`}>
                    <span className={s.numberCell}>R{c.round}</span>
                    <span className={s.numberCell}>1v{c.opponents}</span>
                    <span className={s.clutchResult}><Badge appearance="tint" color={result.color}>{result.label}</Badge></span>
                  </div>;
                })}
              </div>
            </> : <Body1>没有可证明的残局机会。</Body1>}
          </Card>
        </div>
      </div>
      </div>
    </div>
    <div id="timeline-panel" role="tabpanel" aria-labelledby="timeline-tab" hidden={activeTab !== 'timeline'}>
      <RoundTimeline rounds={timeline} expanded={expanded} highlighted={highlighted} onToggle={toggleRound} />
    </div>
    <div id="analysis-panel" role="tabpanel" aria-labelledby="analysis-tab" hidden={activeTab !== 'analysis'}>
      <AnalysisViews analysis={report.analysis} playerId={playerId} />
    </div>
  </>;
}

function App() {
  const s = useStyles();
  const { status, report, playerId, error, importDemo, setPhase } = useReport();
  useEffect(() => window.cs2Analyst.onProgress(setPhase), [setPhase]);
  const busy = status === 'selecting' || status === 'parsing' || status === 'analyzing';
  const phase = status === 'selecting' ? '正在选择 DEM…' : status === 'parsing' ? '正在后台解析 DEM…' : '正在生成指标与深度复盘…';
  return <main className={s.content} data-status={status}>
    <header className={s.header}><div className={s.column}><Subtitle1>CS2 Analyst</Subtitle1><Caption1 className={s.muted}>本地赛后报告</Caption1></div><Button appearance="primary" disabled={busy} onClick={() => void importDemo()}>{report || status === 'error' ? '重新选择 DEM' : '选择 DEM'}</Button></header>
    {busy ? <div role="status"><Spinner label={phase} /><Caption1 className={s.muted}>大型录像可能需要数十秒，请保持应用打开。</Caption1></div> : null}
    {error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}
    {report ? <>{status === 'error' || busy ? <Caption1>下方为上一次成功导入的报告。</Caption1> : null}<Report key={report.match.id} report={report} playerId={playerId} /></> : !busy ? <Card className={s.empty}><Title1>从一场比赛开始</Title1><Body1>选择 CS2 .dem 录像，查看玩家表现与有证据的复盘重点。</Body1><Caption1 className={s.muted}>文件只在本机处理。</Caption1></Card> : null}
  </main>;
}

class ReportErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <MessageBar intent="error"><MessageBarBody>报告展示失败。<Button onClick={() => { useReport.setState({ status: 'idle', report: null, error: null }); this.setState({ failed: false }); }}>重新选择 DEM</Button></MessageBarBody></MessageBar> : this.props.children;
  }
}
function DesktopShell() {
  useScrollbarStyles();
  const s = useStyles();
  return <div className={s.page}><AppTitlebar /><div className={s.body} data-app-content><ReportErrorBoundary><App /></ReportErrorBoundary></div></div>;
}
document.body.style.margin = '0';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><FluentProvider theme={coachTheme}><DesktopShell /></FluentProvider></React.StrictMode>,
);
