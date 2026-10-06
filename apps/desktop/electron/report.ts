import { basename } from 'node:path';
import { analyzeMatch } from '@cs2-coach/analytics';
import type { PlayerMetrics } from '@cs2-coach/analytics';
import { Demoparser2Provider } from '@cs2-coach/dem-parser';
import { generateFindings } from '@cs2-coach/findings';
import type { Finding, FindingEvidence } from '@cs2-coach/findings';
import type { BombAction, Match, Round } from '@cs2-coach/match-model';
import type {
  DesktopFinding, DesktopMatchReport, DesktopPlayerTimeline, DesktopRoundTimeline,
  DesktopTimelineEvent, ImportResult,
} from '@cs2-coach/report-contract';

/** Stable initial-team membership from the first observed freeze-end roster, or null. */
function initialSides(match: Match): Map<string, string> | null {
  const first = match.rounds[0]?.stateSnapshots?.find(s => s.boundary === 'freeze_end' && s.availability === 'observed');
  if (!first || first.unidentifiedPlayerCount > 0) return null;
  return new Map(first.players.filter(p => p.participant === true && p.side !== 'Unknown').map(p => [p.steamId, p.side]));
}

/**
 * Score belongs to stable teams, not the CT/T sides that swap at halftime, so a running
 * total is only produced while every round's winner maps back to exactly one initial team.
 * The first round that cannot be mapped is null, and it stays null from then on: the
 * timeline shows "—" rather than a guessed score.
 */
function roundScoreLookup(match: Match): Map<number, { initialCT: number; initialT: number } | null> {
  const scores = new Map<number, { initialCT: number; initialT: number } | null>();
  const initial = initialSides(match);
  if (!initial) {
    for (const round of match.rounds) scores.set(round.number, null);
    return scores;
  }
  let initialCT = 0;
  let initialT = 0;
  let broken = false;
  for (const round of [...match.rounds].sort((a, b) => a.number - b.number)) {
    if (broken) { scores.set(round.number, null); continue; }
    const snapshot = round.stateSnapshots?.find(s => s.boundary === 'freeze_end' && s.availability === 'observed');
    if (!round.winner || !snapshot || snapshot.unidentifiedPlayerCount > 0) { broken = true; scores.set(round.number, null); continue; }
    const winners = snapshot.players.filter(p => p.participant === true && p.side === round.winner);
    const teams = new Set(winners.map(p => initial.get(p.steamId)));
    if (!winners.length || teams.size !== 1 || teams.has(undefined)) { broken = true; scores.set(round.number, null); continue; }
    if (teams.has('CT')) initialCT++; else initialT++;
    scores.set(round.number, { initialCT, initialT });
  }
  return scores;
}

/**
 * Caveats that limit a number shown in the report. Unverified flash duration is
 * deliberately excluded: it never changes the displayed counts and has its own
 * caption in the Utility card.
 */
function coverageNotes(player: PlayerMetrics, clutchIneligible: boolean): string[] {
  const notes: string[] = [];
  const c = player.coverage;
  if (c.skippedMissingWindow > 0 || c.skippedUnconfirmedParticipation > 0) notes.push('部分回合参与数据不完整。');
  if (c.effectiveDamageUnresolved > 0 || c.damageWithoutKnownSides > 0) notes.push('部分伤害证据无法归属，每回合平均有效伤害可能不可用。');
  if (!player.kast.complete || !player.trade.complete || clutchIneligible) notes.push('部分回合贡献率、补枪或残局证据不完整。');
  const u = player.utility;
  if (!u.throws.complete || !u.he.complete || !u.fire.complete
    || !u.flash.enemy.complete || !u.flash.teammate.complete || !u.flash.assistsComplete) {
    notes.push('部分道具计数、伤害或助攻证据不完整。');
  }
  return notes;
}

/**
 * Presentation-only round clock: real elapsed seconds inside the round, computed as
 * (eventTick - roundStartTick) / tickRate. Returns undefined whenever the round start,
 * the event tick or a reliable tick rate is missing, so the UI never guesses a time.
 * Frozen Analytics semantics are not touched; the raw tick stays in the contract.
 */
function roundClock(match: Match): (round: number | undefined, tick: number | undefined) => number | undefined {
  const rate = match.tickRate;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return () => undefined;
  const roundStarts = new Map(match.rounds.map(round => [round.number, round.startTick]));
  return (round, tick) => {
    if (round === undefined || tick === undefined) return undefined;
    const start = roundStarts.get(round);
    if (typeof start !== 'number') return undefined;
    const seconds = (tick - start) / rate;
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  };
}

/** Finding-evidence adapter for the shared round clock. */
function roundTimeLookup(match: Match): (evidence: FindingEvidence) => number | undefined {
  const clock = roundClock(match);
  return ({ round, tick }) => clock(round, tick);
}

/** Copies a finding and adds only the round-time presentation field to its evidence. */
function withRoundTime(finding: Finding, roundTime: (evidence: FindingEvidence) => number | undefined): DesktopFinding {
  return {
    ...finding,
    evidence: finding.evidence.map(evidence => {
      const roundTimeSeconds = roundTime(evidence);
      return roundTimeSeconds === undefined ? evidence : { ...evidence, roundTimeSeconds };
    }),
  };
}

/** Bomb lifecycle actions worth showing. Pickup/drop carry no round-level value. */
const bombTimeline: Partial<Record<BombAction, { type: DesktopTimelineEvent['type']; description: string }>> = {
  plant_start: { type: 'bomb-plant-start', description: '开始安放炸弹' },
  planted: { type: 'bomb-planted', description: '炸弹安放完成' },
  defuse_start: { type: 'bomb-defuse-start', description: '开始拆弹' },
  defused: { type: 'bomb-defused', description: '炸弹拆除成功' },
  exploded: { type: 'bomb-exploded', description: '炸弹爆炸' },
};

/** Same boundary preference as Analytics: observed freeze end, else the documented start fallback. */
function playerSide(round: Round, steamId: string): 'CT' | 'T' | 'Unknown' {
  for (const boundary of ['freeze_end', 'start'] as const) {
    const snapshot = round.stateSnapshots?.find(s => s.boundary === boundary && s.availability === 'observed');
    if (!snapshot) continue;
    const state = snapshot.players.find(p => p.steamId === steamId);
    return state && state.participant === true && state.side !== 'Unknown' ? state.side : 'Unknown';
  }
  return 'Unknown';
}

/** Same-tick ordering: player actions before the round outcome markers. */
const timelineTypeOrder: Record<DesktopTimelineEvent['type'], number> = {
  kill: 0, death: 1, 'clutch-start': 2,
  'bomb-plant-start': 3, 'bomb-planted': 4,
  'bomb-defuse-start': 5, 'bomb-defused': 6, 'bomb-exploded': 7,
};

/**
 * Presentation-only high-value filter: the target player's kills and deaths (posthumous
 * kills included — a dead killer is not filtered out), the proven clutch start and the
 * bomb lifecycle. Damage, weapon fire, grenade effects, flash victims and snapshots never
 * reach the timeline, so it does not become a log browser. Events are only taken from the
 * formal round window, so post-round combat is never shown; an incomplete window yields no
 * events rather than a guess.
 */
function buildRoundEvents(
  round: Round,
  steamId: string,
  nickname: ReadonlyMap<string, string>,
  clock: (round: number | undefined, tick: number | undefined) => number | undefined,
  clutch: { tick: number; opponents: number } | undefined,
): DesktopTimelineEvent[] {
  if (typeof round.startTick !== 'number' || typeof round.endTick !== 'number') return [];
  const events: DesktopTimelineEvent[] = [];
  const push = (event: Omit<DesktopTimelineEvent, 'id' | 'roundTimeSeconds'>): void => {
    const id = `${round.number}:${event.type}:${event.tick}:${event.actorId ?? '-'}:${event.targetId ?? '-'}`;
    const roundTimeSeconds = clock(round.number, event.tick);
    events.push({ id, ...event, ...(roundTimeSeconds === undefined ? {} : { roundTimeSeconds }) });
  };
  for (const event of round.events) {
    if (event.tick < round.startTick || event.tick > round.endTick) continue;
    if (event.type === 'kill') {
      if (event.killer === steamId && event.killer !== event.victim && event.teamkill !== true) {
        const actorName = nickname.get(event.killer);
        const targetName = nickname.get(event.victim) ?? event.victim;
        push({ type: 'kill', tick: event.tick, actorId: event.killer, ...(actorName ? { actorName } : {}),
          targetId: event.victim, targetName, ...(event.weapon ? { weapon: event.weapon } : {}),
          description: `${actorName ?? event.killer} → ${targetName}` });
      } else if (event.victim === steamId) {
        const actorName = event.killer === 'world' ? undefined : nickname.get(event.killer);
        const targetName = nickname.get(steamId) ?? steamId;
        push({ type: 'death', tick: event.tick, ...(actorName ? { actorId: event.killer, actorName } : {}),
          targetId: steamId, targetName, ...(event.weapon ? { weapon: event.weapon } : {}),
          description: actorName ? `${actorName} → ${targetName}` : `${targetName} 阵亡` });
      }
    } else if (event.type === 'bomb') {
      const mapped = bombTimeline[event.action];
      if (!mapped) continue;
      const actorName = event.player === null ? undefined : nickname.get(event.player);
      push({ type: mapped.type, tick: event.tick, ...(event.player && actorName ? { actorId: event.player, actorName } : {}),
        description: mapped.description });
    }
  }
  if (clutch && clutch.tick >= round.startTick && clutch.tick <= round.endTick) {
    const actorName = nickname.get(steamId);
    push({ type: 'clutch-start', tick: clutch.tick, actorId: steamId, ...(actorName ? { actorName } : {}),
      opponents: clutch.opponents, description: `进入 1v${clutch.opponents} 残局` });
  }
  events.sort((a, b) => a.tick - b.tick || timelineTypeOrder[a.type] - timelineTypeOrder[b.type] || a.id.localeCompare(b.id));
  const seen = new Map<string, number>();
  return events.map(event => {
    const count = seen.get(event.id) ?? 0;
    seen.set(event.id, count + 1);
    return count === 0 ? event : { ...event, id: `${event.id}#${count}` };
  });
}

/**
 * Read-only per-player Round Timeline built from existing Match facts and the already
 * resolved clutch opportunities. It never re-parses, re-runs Analytics or guesses a
 * missing side / result / score / time.
 */
function buildTimeline(
  match: Match,
  players: readonly PlayerMetrics[],
  scores: Map<number, { initialCT: number; initialT: number } | null>,
): DesktopPlayerTimeline[] {
  const nickname = new Map(match.players.map(p => [p.steamId, p.nickname]));
  const clock = roundClock(match);
  const rounds = [...match.rounds].sort((a, b) => a.number - b.number);
  const clutches = new Map<string, { tick: number; opponents: number }>();
  for (const player of players) {
    for (const opportunity of player.clutch.list) {
      if (opportunity.player === player.steamId) {
        clutches.set(`${player.steamId}#${opportunity.round}`, { tick: opportunity.tick, opponents: opportunity.opponents });
      }
    }
  }
  return players.map(player => ({
    playerId: player.steamId,
    rounds: rounds.map((round): DesktopRoundTimeline => {
      const side = playerSide(round, player.steamId);
      const winner = round.winner;
      const result = (winner === 'CT' || winner === 'T') && side !== 'Unknown'
        ? winner === side ? 'win' : 'loss'
        : 'unknown';
      return {
        round: round.number,
        side,
        result,
        scoreAfter: scores.get(round.number) ?? null,
        startTick: typeof round.startTick === 'number' ? round.startTick : null,
        events: buildRoundEvents(round, player.steamId, nickname, clock, clutches.get(`${player.steamId}#${round.number}`)),
      };
    }),
  }));
}

export function buildDesktopReport(match: Match, filePath: string): DesktopMatchReport {
  const a = analyzeMatch(match);
  const valid = a.players.filter(p => p.steamId && p.roundsPlayed > 0);
  if (!valid.length) throw new Error('DEM 没有可报告的有效玩家或完整回合。');
  const selected = valid.find(p => p.nickname.toLowerCase() === 'twinkle') ?? valid[0];
  const clutchIneligible = Boolean(a.coverage.issues['clutch-round-ineligible']);
  const roundTime = roundTimeLookup(match);
  const scores = roundScoreLookup(match);
  const lastRound = [...match.rounds].sort((x, y) => x.number - y.number).at(-1);
  return {
    schemaVersion: 1,
    match: { id: match.id, fileName: basename(filePath), map: match.map, rounds: match.rounds.length,
      score: lastRound ? scores.get(lastRound.number) ?? null : null },
    selectedPlayer: selected.steamId,
    players: valid.map(p => ({ id: p.steamId, nickname: p.nickname })),
    analytics: valid.map(p => {
      const notes = coverageNotes(p, clutchIneligible);
      return {
        playerId: p.steamId, kills: p.kills, deaths: p.deaths, assists: p.assists, roundsPlayed: p.roundsPlayed,
        adr: p.adr, headshotPercentage: p.headshotPercentage,
        kast: { percentage: p.kast.percentage, complete: p.kast.complete, rounds: p.kast.rounds, eligibleRounds: p.kast.eligibleRounds },
        trade: { rate: p.trade.tradeRate, complete: p.trade.complete, kills: p.trade.tradeKills, tradedDeaths: p.trade.tradedDeaths, tradeableDeaths: p.trade.tradeableDeaths },
        opening: { kills: p.opening.kills, deaths: p.opening.deaths, winRate: p.opening.winRate },
        utility: {
          throws: { flash: p.utility.throws.counts.flashbang, smoke: p.utility.throws.counts.smoke, he: p.utility.throws.counts.hegrenade,
            incendiary: p.utility.throws.incendiary, molotov: p.utility.throws.molotov, decoy: p.utility.throws.counts.decoy },
          heDamage: p.utility.he.enemyDamage, fireDamage: p.utility.fire.enemyDamage,
          enemyFlashEffects: p.utility.flash.enemy.count, teamFlashEffects: p.utility.flash.teammate.count,
          flashEffectsComplete: p.utility.flash.enemy.complete && p.utility.flash.teammate.complete,
          flashAssists: p.utility.flash.assists,
        },
        clutch: { opportunities: p.clutch.opportunities, wins: p.clutch.wins, complete: !clutchIneligible,
          list: p.clutch.list.map(c => ({ round: c.round, opponents: c.opponents, won: c.won })) },
        coverage: { complete: notes.length === 0, notes },
      };
    }),
    findings: valid.flatMap(p => generateFindings(a, p.steamId).map(finding => withRoundTime(finding, roundTime))),
    timeline: buildTimeline(match, valid, scores),
  };
}

/**
 * Native parse plus the deterministic pipeline. Runs in a Utility Process (see
 * report-worker.ts) so a 200MB+ DEM never blocks the Main or Renderer thread.
 * onParsed fires after the native parser returns and before analysis begins.
 */
export async function analyzeDemoFile(filePath: string, onParsed?: () => void): Promise<ImportResult> {
  try {
    const match = await new Demoparser2Provider().parse(filePath);
    onParsed?.();
    return { kind: 'success', report: buildDesktopReport(match, filePath) };
  } catch (error) {
    console.error('DEM report failed', error);
    return { kind: 'error', message: '无法分析此 DEM。请确认它是完整的 CS2 录像，然后重新选择。' };
  }
}
