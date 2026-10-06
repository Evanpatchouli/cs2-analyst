import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Badge, Body1, Button, Card, Caption1, Divider, Dropdown, FluentProvider,
  MessageBar, MessageBarBody, Option, Spinner, Subtitle1, Title1, Title2,
  makeStyles, tokens, webDarkTheme,
} from '@fluentui/react-components';
import type { DesktopMatchReport } from '@cs2-coach/report-contract';
import { useReport } from './store';

const useStyles = makeStyles({
  page: { minHeight: '100vh', backgroundColor: tokens.colorNeutralBackground2, color: tokens.colorNeutralForeground1 },
  content: { maxWidth: '1120px', margin: '0 auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' },
  column: { display: 'flex', flexDirection: 'column', gap: '8px' },
  section: { display: 'flex', flexDirection: 'column', gap: '16px' },
  muted: { color: tokens.colorNeutralForeground3 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', '@media (max-width: 900px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } },
  split: { display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: '20px', '@media (max-width: 900px)': { gridTemplateColumns: '1fr' } },
  stat: { backgroundColor: tokens.colorNeutralBackground1, padding: '16px' },
  finding: { backgroundColor: tokens.colorNeutralBackground1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  evidence: { padding: '8px 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, overflowWrap: 'anywhere' },
  empty: { padding: '72px 32px', alignItems: 'center', textAlign: 'center' },
});
const fmt = (value: number | null, digits = 0) => value === null ? '—' : value.toFixed(digits);
const percent = (value: number | null, digits = 0) => value === null ? '—' : `${value.toFixed(digits)}%`;

/** Findings evidence is a frozen technical contract; only its presentation is localized. */
const metricLabels: Record<string, string> = {
  "side.CT.adr": "CT 方 ADR", "side.T.adr": "T 方 ADR",
  "side.CT.roundsPlayed": "CT 方参与回合", "side.T.roundsPlayed": "T 方参与回合",
  "side.CT.kills": "CT 方击杀", "side.T.kills": "T 方击杀",
  "side.CT.deaths": "CT 方死亡", "side.T.deaths": "T 方死亡",
  "trade.tradeableDeaths": "死亡时仍有队友存活", "trade.tradedDeaths": "队友成功补枪",
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
const severityText: Record<string, string> = { high: "高", medium: "中", low: "低", positive: "亮点" };
const evidenceText = (value: number | boolean | string, unit: string): string => {
  if (unit === "flag") return value === true ? "是" : value === false ? "否" : String(value);
  if (typeof value !== "number") return String(value);
  switch (unit) {
    case "ratio": return `${(value * 100).toFixed(0)}%`;
    case "percent": return `${value.toFixed(1)}%`;
    case "hp": return `${value} 点`;
    case "hp/round": return `${value} 点/回合`;
    case "seconds": return `${value} 秒`;
    default: return value.toFixed(Number.isInteger(value) ? 0 : 2);
  }
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  const s = useStyles();
  return <Card className={s.stat}><Caption1 className={s.muted}>{label}</Caption1><Title2>{value}</Title2>{hint ? <Caption1>{hint}</Caption1> : null}</Card>;
}

function Findings({ report, playerId }: { report: DesktopMatchReport; playerId: string }) {
  const s = useStyles();
  const rows = report.findings.filter(f => f.playerId === playerId);
  return <section className={s.section} aria-label="本场复盘重点">
    <Title2>本场复盘重点</Title2>
    <Caption1 className={s.muted}>最多 3 个问题、2 个亮点 · 结论来自确定性规则与本场证据</Caption1>
    {rows.length ? rows.map(f => <Card key={f.id} className={s.finding} data-rule={f.ruleId}>
      <div className={s.header}><Subtitle1>{f.title}</Subtitle1><Badge appearance="tint" color={f.severity === 'positive' ? 'success' : f.severity === 'high' ? 'danger' : 'warning'}>{severityText[f.severity] ?? f.severity}</Badge></div>
      <Body1>{f.summary}</Body1>
      <details><summary>查看证据（{f.evidence.length}）</summary>
        {f.evidence.map((e, i) => <div key={i} className={s.evidence}><Caption1>{metricLabel(e.metric)}{e.round !== undefined ? ` · R${e.round}` : ''}{e.tick !== undefined ? ` · tick ${e.tick}` : ''}</Caption1>
          <Caption1>{evidenceText(e.value, e.unit)}</Caption1></div>)}
      </details>
    </Card>) : <Body1>本场没有达到规则阈值且证据充分的复盘结论。</Body1>}
  </section>;
}

function Report({ report, playerId }: { report: DesktopMatchReport; playerId: string }) {
  const s = useStyles();
  const selectPlayer = useReport(state => state.selectPlayer);
  const player = report.players.find(p => p.id === playerId)!;
  const p = report.analytics.find(a => a.playerId === playerId)!;
  const u = p.utility;
  return <>
    <div className={s.header}>
      <div className={s.column}><Title1>{report.match.map}</Title1><Body1>{report.match.score ? `${report.match.score.initialCT} : ${report.match.score.initialT}` : '比分不可用'} · 开局 CT 队 / 开局 T 队 · {report.match.rounds} 回合</Body1><Caption1 className={s.muted}>{report.match.fileName}</Caption1></div>
      <div className={s.column}><Caption1>目标玩家</Caption1><Dropdown aria-label="目标玩家" value={player.nickname} selectedOptions={[playerId]} onOptionSelect={(_, data) => data.optionValue && selectPlayer(data.optionValue)}>
        {report.players.map(p => <Option key={p.id} value={p.id} text={p.nickname}>{p.nickname}</Option>)}
      </Dropdown></div>
    </div>
    {p.coverage.notes.length ? <MessageBar intent="warning"><MessageBarBody>{p.coverage.notes.join(' ')}</MessageBarBody></MessageBar> : null}
    <div className={s.grid} aria-label="玩家指标">
      <Stat label="K / D / A" value={`${p.kills} / ${p.deaths} / ${p.assists}`} />
      <Stat label="ADR" value={fmt(p.adr, 2)} hint="每回合平均有效伤害" />
      <Stat label="HS%（爆头率）" value={percent(p.headshotPercentage, 1)} />
      <Stat label="KAST（回合贡献率）" value={percent(p.kast.percentage)} hint={`${p.kast.rounds} / ${p.kast.eligibleRounds} 回合${p.kast.complete ? '' : ' · 部分证据'}`} />
      <Stat label="Trade rate（死亡后队友补枪率）" value={percent(p.trade.rate, 1)} hint={<>死亡时仍有队友存活：{fmt(p.trade.tradeableDeaths)}<br />队友成功补枪：{fmt(p.trade.tradedDeaths)}{p.trade.complete ? '' : ' · 部分证据'}</>} />
      <Stat label="Trade kills（补枪击杀）" value={fmt(p.trade.kills)} />
      <Stat label="Opening（首杀对决）" value={`${p.opening.kills} 首杀 / ${p.opening.deaths} 首死`} hint={p.opening.winRate === null ? undefined : `首杀对决胜率 ${(p.opening.winRate * 100).toFixed(0)}%`} />
      <Stat label="Clutch（残局）" value={`${p.clutch.wins} 胜 / ${p.clutch.opportunities} 次`} hint={p.clutch.complete ? '已证明的 1vN 机会' : '仅已证明的部分机会'} />
    </div>
    <Divider />
    <div className={s.split}>
      <Findings report={report} playerId={playerId} />
      <div className={s.section}>
        <Title2>道具与残局</Title2>
        <Card className={s.finding}>
          <Subtitle1>道具</Subtitle1>
          <Body1>闪光弹 {fmt(u.throws.flash)} · 烟雾弹 {fmt(u.throws.smoke)} · 高爆手雷 {fmt(u.throws.he)}</Body1>
          <Body1>燃烧弹 {fmt(u.throws.incendiary)} · 燃烧瓶 {fmt(u.throws.molotov)} · 诱饵弹 {fmt(u.throws.decoy)}</Body1>
          <Body1>高爆手雷对敌伤害 {fmt(u.heDamage)} 点 · 燃烧伤害 {fmt(u.fireDamage)} 点</Body1>
          <Body1>敌人受闪效果 {fmt(u.enemyFlashEffects)} · 队友受闪效果 {fmt(u.teamFlashEffects)}{u.flashEffectsComplete ? '' : '（部分证据）'}</Body1>
          <Body1>闪光助攻 {fmt(u.flashAssists)}</Body1>
          <Caption1 className={s.muted}>受闪次数按游戏记录到的受闪事件统计，其中可能包含几乎未产生实际致盲效果的记录，因此不能直接理解为“有效闪光次数”或实际致盲时长。“—”表示当前录像证据不足，无法可靠计算。</Caption1>
        </Card>
        <Card className={s.finding}>
          <Subtitle1>残局</Subtitle1>
          {p.clutch.list.length ? p.clutch.list.map(c => <Body1 key={c.round}>R{c.round} · 1v{c.opponents} · {c.won === null ? '结果未知' : c.won ? '成功' : '失败'}</Body1>) : <Body1>没有可证明的残局机会。</Body1>}
        </Card>
      </div>
    </div>
  </>;
}

function App() {
  const s = useStyles();
  const { status, report, playerId, error, importDemo, setPhase } = useReport();
  useEffect(() => window.cs2Coach.onProgress(setPhase), [setPhase]);
  const busy = status === 'selecting' || status === 'parsing' || status === 'analyzing';
  const phase = status === 'selecting' ? '正在选择 DEM…' : status === 'parsing' ? '正在后台解析 DEM…' : '正在生成指标与复盘结论…';
  return <div className={s.page}><main className={s.content} data-status={status}>
    <header className={s.header}><div className={s.column}><Subtitle1>CS2 Coach</Subtitle1><Caption1 className={s.muted}>本地赛后报告</Caption1></div><Button appearance="primary" disabled={busy} onClick={() => void importDemo()}>{report || status === 'error' ? '重新选择 DEM' : '选择 DEM'}</Button></header>
    {busy ? <div role="status"><Spinner label={phase} /><Caption1 className={s.muted}>大型录像可能需要数十秒，请保持应用打开。</Caption1></div> : null}
    {error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}
    {report ? <>{status === 'error' || busy ? <Caption1>下方为上一次成功导入的报告。</Caption1> : null}<Report report={report} playerId={playerId} /></> : !busy ? <Card className={s.empty}><Title1>从一场比赛开始</Title1><Body1>选择 CS2 .dem 录像，查看玩家表现与有证据的复盘重点。</Body1><Caption1 className={s.muted}>文件只在本机处理。</Caption1></Card> : null}
  </main></div>;
}

class ReportErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <MessageBar intent="error"><MessageBarBody>报告展示失败。<Button onClick={() => { useReport.setState({ status: 'idle', report: null, error: null }); this.setState({ failed: false }); }}>重新选择 DEM</Button></MessageBarBody></MessageBar> : this.props.children;
  }
}
document.body.style.margin = '0';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><FluentProvider theme={webDarkTheme}><ReportErrorBoundary><App /></ReportErrorBoundary></FluentProvider></React.StrictMode>,
);
