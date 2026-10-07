import { Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import type { DesktopTimelineEvent } from '@cs2-analyst/report-contract';
import { FlashAssistIcon, HeadshotIcon, WeaponIcon, weaponLabel } from './killfeed-icons';
import { palette } from './theme';

const useStyles = makeStyles({
  row: { display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: '12px', padding: '6px 0', borderTop: `1px solid ${palette.rowDivider}`, ':first-child': { borderTopStyle: 'none' }, ':focus-visible': { outline: `2px solid ${tokens.colorBrandStroke1}` }, '@media (max-width: 650px)': { gap: '6px' } },
  time: { color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  name: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  attacker: { textAlign: 'right' },
  icons: { display: 'flex', alignItems: 'center', gap: '6px', color: tokens.colorNeutralForeground2 },
  icon: { display: 'inline-flex', flexShrink: 0 },
});

export function KillFeedEvent({ event, round }: { event: DesktopTimelineEvent; round: number }) {
  const s = useStyles();
  const time = event.roundTimeSeconds === undefined ? '—' : `+${event.roundTimeSeconds.toFixed(2)} 秒`;
  const target = event.targetName ?? '未知玩家';
  const world = !event.actorId || event.actorId === 'world';
  const attacker = world ? target : event.actorName ?? '未知玩家';
  const victim = world ? '阵亡' : target;
  const weapon = world ? '世界伤害 / 无已知攻击者' : event.weapon ? weaponLabel(event.weapon) : '未知武器';
  const when = event.roundTimeSeconds === undefined ? '回合内时间证据不足' : `回合开始后 ${event.roundTimeSeconds.toFixed(2)} 秒`;
  const label = `R${round} ${when}，${world ? `${target} 因${weapon}阵亡` : `${attacker} 使用 ${weapon} 击杀 ${target}`}${event.headshot === true ? '，爆头' : ''}${event.assistedFlash === true ? '，闪光助攻' : ''}`;
  return <div className={s.row} tabIndex={0} aria-label={label} data-killfeed-event={event.type}>
    <span className={s.time}>{time}</span>
    <Tooltip content={attacker} relationship="description"><span className={`${s.name} ${s.attacker}`} tabIndex={0} data-killfeed-attacker>{attacker}</span></Tooltip>
    <span className={s.icons}>
      <Tooltip content={weapon} relationship="description"><span className={s.icon} tabIndex={0} aria-label={weapon} data-killfeed-weapon={event.weapon ?? 'unknown'}><WeaponIcon weapon={world ? 'world' : event.weapon} /></span></Tooltip>
      {event.headshot === true ? <Tooltip content="爆头" relationship="description"><span className={s.icon} tabIndex={0} aria-label="爆头"><HeadshotIcon /></span></Tooltip> : null}
      {event.assistedFlash === true ? <Tooltip content="闪光助攻" relationship="description"><span className={s.icon} tabIndex={0} aria-label="闪光助攻"><FlashAssistIcon /></span></Tooltip> : null}
    </span>
    <Tooltip content={victim} relationship="description"><span className={s.name} tabIndex={0} data-killfeed-victim>{victim}</span></Tooltip>
  </div>;
}
