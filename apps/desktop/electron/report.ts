import { basename } from 'node:path';
import { analyzeMatch } from '@cs2-coach/analytics';
import type { PlayerMetrics } from '@cs2-coach/analytics';
import { Demoparser2Provider } from '@cs2-coach/dem-parser';
import { generateFindings } from '@cs2-coach/findings';
import type { Match } from '@cs2-coach/match-model';
import type { DesktopMatchReport, ImportResult } from '@cs2-coach/report-contract';

/** Score belongs to stable teams, not the CT/T sides that swap at halftime. */
function teamScore(match: Match): DesktopMatchReport['match']['score'] {
  const first = match.rounds[0]?.stateSnapshots?.find(s => s.boundary === 'freeze_end' && s.availability === 'observed');
  if (!first || first.unidentifiedPlayerCount > 0) return null;
  const initial = new Map(first.players.filter(p => p.participant === true && p.side !== 'Unknown').map(p => [p.steamId, p.side]));
  const score = { initialCT: 0, initialT: 0 };
  for (const round of match.rounds) {
    const snapshot = round.stateSnapshots?.find(s => s.boundary === 'freeze_end' && s.availability === 'observed');
    if (!round.winner || !snapshot || snapshot.unidentifiedPlayerCount > 0) return null;
    const winners = snapshot.players.filter(p => p.participant === true && p.side === round.winner);
    const teams = new Set(winners.map(p => initial.get(p.steamId)));
    if (!winners.length || teams.size !== 1 || teams.has(undefined)) return null;
    if (teams.has('CT')) score.initialCT++; else score.initialT++;
  }
  return score;
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

export function buildDesktopReport(match: Match, filePath: string): DesktopMatchReport {
  const a = analyzeMatch(match);
  const valid = a.players.filter(p => p.steamId && p.roundsPlayed > 0);
  if (!valid.length) throw new Error('DEM 没有可报告的有效玩家或完整回合。');
  const selected = valid.find(p => p.nickname.toLowerCase() === 'twinkle') ?? valid[0];
  const clutchIneligible = Boolean(a.coverage.issues['clutch-round-ineligible']);
  return {
    schemaVersion: 1,
    match: { id: match.id, fileName: basename(filePath), map: match.map, rounds: match.rounds.length, score: teamScore(match) },
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
    findings: valid.flatMap(p => generateFindings(a, p.steamId)),
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
