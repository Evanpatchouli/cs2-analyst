import { Badge, Body1, Button, Card, Caption1, Subtitle1, Title2, makeStyles, tokens } from '@fluentui/react-components';
import type { DesktopDeepReviewPlayer } from '@cs2-analyst/report-contract';
import { palette } from './theme';

const useStyles = makeStyles({
  section: { display: 'flex', flexDirection: 'column', gap: '16px' },
  group: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: { backgroundColor: palette.card, border: `1px solid ${palette.border}`, borderRadius: tokens.borderRadiusLarge,
    boxShadow: 'none', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowWrap: 'anywhere' },
  badges: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  muted: { color: tokens.colorNeutralForeground3 },
  summary: { cursor: 'pointer', padding: '4px', borderRadius: tokens.borderRadiusMedium,
    ':hover': { backgroundColor: palette.cardHover },
    ':focus-visible': { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '2px' } },
  caveats: { display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' },
});
const groups = [
  { key: 'reviews', title: '优先复盘', label: '复盘重点', color: 'warning', empty: '本场没有需要优先复盘的问题。' },
  { key: 'highlights', title: '亮点', label: '亮点', color: 'success', empty: '本场没有值得单独标注的亮点。' },
  { key: 'contexts', title: '补充观察', label: '补充观察', color: 'informative', empty: '本场没有额外的补充观察。' },
] as const;

/** All copy/counts/rounds are supplied by the presenter. No evidence inference here. */
export function DeepReview({ player, onShowRounds }: {
  player: DesktopDeepReviewPlayer; onShowRounds: (rounds: number[]) => void;
}) {
  const s = useStyles();
  const empty = !player.reviews.length && !player.highlights.length && !player.contexts.length;
  return <section className={s.section} aria-label="深度复盘" data-deep-player={player.playerId}>
    <Title2>深度复盘</Title2>
    <Body1 className={s.muted}>根据 DEM 中能够明确记录的交火、人数变化、队友跟进和道具效果生成。</Body1>
    {player.coverage.status === 'unavailable' ? <Body1>本场录像无法用于深度复盘，基础比赛报告仍可查看。</Body1>
      : player.coverage.status === 'partial' ? <Caption1 className={s.muted}>这场录像中有部分记录无法完整判断，具体限制可在每张卡片的「说明与限制」中查看。</Caption1> : null}
    {empty ? <Body1>本场没有生成深度复盘结论。</Body1> : null}
    {groups.map(group => <section key={group.key} className={s.group} aria-label={group.title}>
      <Subtitle1>{group.title}</Subtitle1>
      {player[group.key].length ? player[group.key].map(f => <Card key={f.id} className={s.card} data-deep-kind={f.kind} data-deep-rule={f.ruleId}>
        <div className={s.badges}>
          <Badge appearance="tint" color={group.color} data-deep-label={f.kind}>{group.label}</Badge>
        </div>
        <Subtitle1>{f.title}</Subtitle1>
        <Body1>{f.summary}</Body1>
        {f.occurrenceLabel !== null ? <Caption1 className={s.muted}>{f.occurrenceLabel}</Caption1> : null}
        {f.relatedRounds.length ? <div><Button appearance="subtle" size="small" data-deep-rounds={f.relatedRounds.join(',')}
          onClick={() => onShowRounds(f.relatedRounds)}>
          {f.relatedRounds.length === 1 ? `查看 R${f.relatedRounds[0]}` : `查看 ${f.relatedRounds.length} 个相关回合`}
        </Button></div> : null}
        {f.caveats.length ? <details><summary className={s.summary}>说明与限制</summary>
          <div className={s.caveats}>{f.caveats.map((caveat, i) => <Body1 key={i} className={s.muted}>{caveat}</Body1>)}</div>
        </details> : null}
      </Card>) : <Caption1 className={s.muted}>{group.empty}</Caption1>}
    </section>)}
  </section>;
}
