import { useState } from 'react';
import { Badge, Body1, Card, Caption1, Dropdown, Option, Subtitle1, Title2, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { DesktopAnalysisViews, DesktopPlayerAnalysis } from '@cs2-coach/report-contract';
import { comparisonMetrics, comparisonValue, comparisonIncomplete, sortedComparison } from './analysis-metrics';
import type { ComparisonMetricKey } from './analysis-metrics';
import { palette } from './theme';

const useStyles = makeStyles({
  section: { display: 'flex', flexDirection: 'column', gap: '16px' },
  panel: { backgroundColor: palette.card, border: `1px solid ${palette.border}`, borderRadius: tokens.borderRadiusLarge, boxShadow: 'none', padding: '20px', gap: '16px' },
  heading: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' },
  column: { display: 'flex', flexDirection: 'column', gap: '6px' },
  muted: { color: tokens.colorNeutralForeground3 },
  rows: { display: 'flex', flexDirection: 'column', gap: '6px' },
  row: { display: 'grid', gridTemplateColumns: 'minmax(100px, 200px) minmax(40px, 1fr) 132px', alignItems: 'center', gap: '16px', minHeight: '34px', borderRadius: tokens.borderRadiusMedium, ':focus-visible': { outline: `2px solid ${tokens.colorBrandStroke1}` }, '@media (max-width: 650px)': { gridTemplateColumns: 'minmax(85px, 120px) minmax(20px, 1fr) 100px', gap: '8px' } },
  name: { overflowWrap: 'anywhere' },
  track: { height: '12px', backgroundColor: palette.pageTop, borderRadius: '2px', overflow: 'hidden' },
  bar: { height: '100%', backgroundColor: palette.textMuted, borderRadius: '2px' },
  currentBar: { backgroundColor: tokens.colorBrandBackground },
  number: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  scroll: { overflowX: 'auto' },
  trend: { display: 'flex', gap: '6px', alignItems: 'stretch', minWidth: '680px', paddingTop: '8px' },
  round: { flex: '1 0 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', borderRadius: tokens.borderRadiusMedium, ':focus-visible': { outline: `2px solid ${tokens.colorBrandStroke1}` } },
  roundTrack: { height: '144px', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', borderBottom: `1px solid ${palette.borderStrong}`, backgroundColor: palette.pageTop },
  roundBar: { width: '68%', backgroundColor: tokens.colorBrandBackground, borderTopLeftRadius: '2px', borderTopRightRadius: '2px' },
  sides: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px', '@media (max-width: 650px)': { gridTemplateColumns: '1fr' } },
  side: { display: 'flex', flexDirection: 'column', gap: '12px' },
  stat: { display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '8px 0', borderBottom: `1px solid ${palette.rowDivider}` },
});

const resultLabel = { win: '成功', loss: '失败', unknown: '结果未知' } as const;
const resultColor = { win: 'success', loss: 'danger', unknown: 'warning' } as const;
const partialEvidence = '当前 DEM 的相关证据不完整，该数值可能不代表完整比赛。';

function RoundTrend({ player }: { player: DesktopPlayerAnalysis }) {
  const s = useStyles();
  const maxKills = Math.max(1, ...player.roundTrend.filter(r => r.complete).map(r => r.kills));
  return <Card className={s.panel} aria-label="回合表现趋势">
    <Title2>回合表现趋势</Title2>
    <Caption1 className={s.muted}>每回合击杀数 · 独立回合，柱高按击杀数缩放 · 阵亡与胜负见标签或提示</Caption1>
    <div className={s.scroll}><div className={s.trend} role="list" aria-label="每回合击杀数">
      {player.roundTrend.map(r => {
        const side = r.side === 'Unknown' ? '阵营未知' : r.side;
        const detail = `R${r.round} · ${side} · ${resultLabel[r.result]} · ${r.complete ? `${r.kills} 击杀 · ${r.died ? '阵亡' : '未阵亡'}` : '回合窗口证据不足，击杀与死亡不可用'}`;
        return <Tooltip key={r.round} content={detail} relationship="description">
          <div role="listitem" tabIndex={0} className={s.round} aria-label={detail} data-trend-round={r.round}>
            <div className={s.roundTrack} aria-hidden="true">
              <Caption1>{r.complete ? r.kills : '—'}</Caption1>
              {r.complete ? <div className={s.roundBar} style={{ height: `${r.kills / maxKills * 112}px` }} /> : null}
            </div>
            <Caption1>R{r.round}</Caption1>
            <Badge size="small" appearance="tint" color={resultColor[r.result]}>{r.result === 'win' ? '胜' : r.result === 'loss' ? '负' : '?'}</Badge>
            <Caption1 className={s.muted}>{r.complete ? r.died ? '亡' : '存' : '—'}</Caption1>
          </div>
        </Tooltip>;
      })}
    </div></div>
    <Caption1 className={s.muted}>亡：阵亡 · 存：未阵亡 · —：回合窗口证据不足 · 最大柱：{maxKills} 击杀</Caption1>
  </Card>;
}

function SideComparison({ player }: { player: DesktopPlayerAnalysis }) {
  const s = useStyles();
  return <Card className={s.panel} aria-label="CT / T 表现对比">
    <Title2>CT / T 表现对比</Title2>
    <Caption1 className={s.muted}>当前目标玩家 · ADR 为每回合平均有效伤害</Caption1>
    <div className={s.sides}>{(['CT', 'T'] as const).map(side => {
      const p = player.sideSplit[side];
      return <div key={side} className={s.side} data-analysis-side={side}>
        <Subtitle1>{side}</Subtitle1>
        <div className={s.stat}><Body1>回合</Body1><Body1 className={s.number}>{p.roundsPlayed}</Body1></div>
        <div className={s.stat}><Body1>K / D / A</Body1><Body1 className={s.number}>{p.kills} / {p.deaths} / {p.assists}</Body1></div>
        <div className={s.stat}><Body1>ADR</Body1><Body1 className={s.number}>{p.adr === null ? '—' : p.adr.toFixed(2)}</Body1></div>
        {p.adr === null ? <Caption1 className={s.muted}>ADR 证据不足或该阵营无已确认参与回合。</Caption1> : null}
      </div>;
    })}</div>
  </Card>;
}

export function AnalysisViews({ analysis, playerId }: { analysis: DesktopAnalysisViews; playerId: string }) {
  const s = useStyles();
  const [metricKey, setMetricKey] = useState<ComparisonMetricKey>('adr');
  const metric = comparisonMetrics.find(m => m.key === metricKey)!;
  const players = sortedComparison(analysis.players, metricKey);
  const max = Math.max(1, ...players.map(p => p[metricKey] ?? 0));
  const player = analysis.perPlayer.find(p => p.playerId === playerId);
  return <section className={s.section} aria-label="分析视图">
    <Card className={s.panel}>
      <div className={s.heading}>
        <div className={s.column}><Title2>全场玩家对比</Title2><Caption1 className={s.muted}>比较本场 {players.length} 名玩家的确定性指标</Caption1></div>
        <div className={s.column}><Caption1>指标</Caption1><Dropdown aria-label="对比指标" value={metric.label} selectedOptions={[metricKey]} onOptionSelect={(_, data) => {
          const choice = comparisonMetrics.find(m => m.key === data.optionValue);
          if (choice) setMetricKey(choice.key);
        }}>{comparisonMetrics.map(m => <Option key={m.key} value={m.key} text={m.label}>{m.label}</Option>)}</Dropdown></div>
      </div>
      <div className={s.rows} role="list" aria-label={`${metric.label} 玩家对比`}>
        {players.map(p => {
          const value = p[metricKey];
          const incomplete = comparisonIncomplete(p, metricKey);
          const name = `${p.playerName}${p.playerId === playerId ? ' · 当前' : ''}`;
          const formatted = comparisonValue(p, metric);
          const detail = `${name} · ${metric.label} ${formatted}${value === null ? ' · 证据不足或无适用样本' : ''}${incomplete ? ` · 部分证据：${partialEvidence}` : ''}`;
          return <Tooltip key={p.playerId} content={detail} relationship="description">
            <div role="listitem" tabIndex={0} className={s.row} aria-label={detail} data-comparison-player={p.playerId} data-metric-value={value === null ? 'null' : value}>
              <Body1 className={s.name}>{name}</Body1>
              <div className={s.track} aria-hidden="true">{value !== null ? <div className={mergeClasses(s.bar, p.playerId === playerId && s.currentBar)} style={{ width: `${value / max * 100}%` }} /> : null}</div>
              <div className={s.number}><Body1>{formatted}</Body1>{incomplete ? <div><Caption1 className={s.muted}>部分证据</Caption1></div> : null}</div>
            </div>
          </Tooltip>;
        })}
      </div>
      <Caption1 className={s.muted}>按所选指标降序 · — 表示证据不足或无适用样本 · 悬停或键盘聚焦查看详情</Caption1>
    </Card>
    {player ? <><RoundTrend player={player} /><SideComparison player={player} /></> : <Body1>当前玩家没有可用分析数据。</Body1>}
  </section>;
}
