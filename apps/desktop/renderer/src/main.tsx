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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const s = useStyles();
  return <Card className={s.stat}><Caption1 className={s.muted}>{label}</Caption1><Title2>{value}</Title2>{hint ? <Caption1>{hint}</Caption1> : null}</Card>;
}

function Findings({ report, playerId }: { report: DesktopMatchReport; playerId: string }) {
  const s = useStyles();
  const rows = report.findings.filter(f => f.playerId === playerId);
  return <section className={s.section} aria-label="Findings">
    <Title2>本场复盘重点</Title2>
    <Caption1 className={s.muted}>最多 3 个问题、2 个亮点 · 结论来自确定性规则与本场证据</Caption1>
    {rows.length ? rows.map(f => <Card key={f.id} className={s.finding} data-rule={f.ruleId}>
      <div className={s.header}><Subtitle1>{f.title}</Subtitle1><Badge appearance="tint" color={f.severity === 'positive' ? 'success' : f.severity === 'high' ? 'danger' : 'warning'}>{f.severity}</Badge></div>
      <Body1>{f.summary}</Body1>
      <details><summary>查看证据（{f.evidence.length}）</summary>
        {f.evidence.map((e, i) => <div key={i} className={s.evidence}><Caption1>{e.metric}{e.round !== undefined ? ` · R${e.round}` : ''}{e.tick !== undefined ? ` · tick ${e.tick}` : ''}</Caption1>
          <Caption1>{typeof e.value === 'number' ? fmt(e.value, Number.isInteger(e.value) ? 0 : 2) : String(e.value)} {e.unit}</Caption1></div>)}
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
      <div className={s.column}><Caption1>目标玩家</Caption1><Dropdown aria-label="Player" value={player.nickname} selectedOptions={[playerId]} onOptionSelect={(_, data) => data.optionValue && selectPlayer(data.optionValue)}>
        {report.players.map(p => <Option key={p.id} value={p.id} text={p.nickname}>{p.nickname}</Option>)}
      </Dropdown></div>
    </div>
    {p.coverage.notes.length ? <MessageBar intent="warning"><MessageBarBody>{p.coverage.notes.join(' ')}</MessageBarBody></MessageBar> : null}
    <div className={s.grid} aria-label="玩家指标">
      <Stat label="K / D / A" value={`${p.kills} / ${p.deaths} / ${p.assists}`} />
      <Stat label="ADR" value={fmt(p.adr, 2)} hint="有效敌方 HP / 参与回合" />
      <Stat label="HS%" value={percent(p.headshotPercentage, 1)} />
      <Stat label="KAST" value={percent(p.kast.percentage)} hint={`${p.kast.rounds} / ${p.kast.eligibleRounds} 回合${p.kast.complete ? '' : ' · 部分证据'}`} />
      <Stat label="Trade rate" value={percent(p.trade.rate, 1)} hint={`${p.trade.tradedDeaths} / ${p.trade.tradeableDeaths} 可交易死亡${p.trade.complete ? '' : ' · 部分证据'}`} />
      <Stat label="Trade kills" value={fmt(p.trade.kills)} />
      <Stat label="Opening" value={`${p.opening.kills} 首杀 / ${p.opening.deaths} 首死`} hint={p.opening.winRate === null ? undefined : `首杀对决胜率 ${(p.opening.winRate * 100).toFixed(0)}%`} />
      <Stat label="Clutch" value={`${p.clutch.wins} 胜 / ${p.clutch.opportunities} 次`} hint={p.clutch.complete ? '已证明的 1vN 机会' : '仅已证明的部分机会'} />
    </div>
    <Divider />
    <div className={s.split}>
      <Findings report={report} playerId={playerId} />
      <div className={s.section}>
        <Title2>道具与残局</Title2>
        <Card className={s.finding}>
          <Subtitle1>Utility</Subtitle1>
          <Body1>Flash {fmt(u.throws.flash)} · Smoke {fmt(u.throws.smoke)} · HE {fmt(u.throws.he)}</Body1>
          <Body1>Incendiary {fmt(u.throws.incendiary)} · Molotov {fmt(u.throws.molotov)} · Decoy {fmt(u.throws.decoy)}</Body1>
          <Body1>HE 敌伤 {fmt(u.heDamage)} HP · 燃烧敌伤 {fmt(u.fireDamage)} HP</Body1>
          <Body1>敌方受闪效果 {u.enemyFlashEffects} · 队友受闪效果 {u.teamFlashEffects}{u.flashEffectsComplete ? '' : '（部分证据）'}</Body1>
          <Body1>已确认闪光助攻 {fmt(u.flashAssists)}</Body1>
          <Caption1 className={s.muted}>受闪效果是受害者事件数，包含零 duration；不代表有效投掷数或实际致盲时长。— 表示不可用。</Caption1>
        </Card>
        <Card className={s.finding}>
          <Subtitle1>Clutch</Subtitle1>
          {p.clutch.list.length ? p.clutch.list.map(c => <Body1 key={c.round}>R{c.round} · 1v{c.opponents} · {c.won === null ? '结果未知' : c.won ? 'win' : 'loss'}</Body1>) : <Body1>没有可证明的残局机会。</Body1>}
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
  const phase = status === 'selecting' ? '正在选择 DEM…' : status === 'parsing' ? '正在后台解析 DEM…' : '正在生成指标与 Findings…';
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
