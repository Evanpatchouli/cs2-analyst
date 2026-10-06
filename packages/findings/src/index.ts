import type { MatchAnalytics, PlayerMetrics } from "@cs2-coach/analytics";

export type FindingCategory = "side-impact" | "trade" | "opening" | "utility" | "discipline" | "clutch";
export type FindingSeverity = "high" | "medium" | "low" | "positive";
/** Paths reference frozen Analytics or documented derived counts. Round/tick locate evidence. */
export interface FindingEvidence {
  metric: string;
  value: number | boolean | string;
  unit: "count" | "hp" | "hp/round" | "ratio" | "percent" | "seconds" | "flag" | "side" | "player-id";
  round?: number;
  tick?: number;
}
export interface Finding {
  id: string;
  ruleId: string;
  playerId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  summary: string;
  evidence: FindingEvidence[];
  relatedRounds?: number[];
  /** Evidence certainty, not probability of future performance. */
  confidence: "high" | "medium";
}
/** MVP heuristics, not population benchmarks. */
export const findingThresholds = Object.freeze({
  sideRounds: 8, sideAdrGap: 25, sideAdrRatio: 0.7,
  tradeDeaths: 8, tradeRate: 30,
  openingDuels: 4, openingLow: 0.25, openingHigh: 0.75,
  damageThrows: 8, utilityLowDamagePerThrow: 10, utilityHighDamagePerThrow: 30,
  teamFlashThrows: 8, teamFlashEffects: 5, teamFlashEffectsPerThrow: 0.3,
  flashThrows: 8, flashEnemyEffects: 12, flashEffectsPerThrow: 1.5, flashAssists: 3,
  maxIssues: 3, maxHighlights: 2,
});
const metric = (metric: string, value: FindingEvidence["value"], unit: FindingEvidence["unit"]): FindingEvidence =>
  ({ metric, value, unit });
const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);
const textOrder = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const severityOrder: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2, positive: 3 };
const categoryOrder: Record<FindingCategory, number> = {
  "side-impact": 0, trade: 1, discipline: 2, opening: 3, utility: 4, clutch: 5,
};

function candidates(a: MatchAnalytics, p: PlayerMetrics): Finding[] {
  const out: Finding[] = [];
  const emit = (ruleId: string, category: FindingCategory, severity: FindingSeverity,
    title: string, summary: string, evidence: FindingEvidence[], relatedRounds?: number[],
    confidence: Finding["confidence"] = "medium"): void => {
    out.push({ id: JSON.stringify([a.matchId, p.steamId, ruleId]), ruleId, playerId: p.steamId,
      category, severity, title, summary, evidence, confidence,
      ...(relatedRounds ? { relatedRounds } : {}) });
  };
  const t = findingThresholds, c = p.coverage;
  const participationComplete = c.skippedMissingWindow === 0 && c.skippedUnconfirmedParticipation === 0
    && a.coverage.rounds.every(r => !r.rosterDegraded && r.unidentifiedPlayerCount === 0);
  const damageComplete = participationComplete && c.damageWithoutKnownSides === 0 && c.effectiveDamageUnresolved === 0;
  const ct = p.side.CT, ts = p.side.T;
  if (damageComplete && ct.roundsPlayed + ts.roundsPlayed === p.roundsPlayed
    && ct.roundsPlayed >= t.sideRounds && ts.roundsPlayed >= t.sideRounds && finite(ct.adr) && finite(ts.adr)) {
    const weak = ct.adr < ts.adr ? "CT" : "T", strong = weak === "CT" ? "T" : "CT";
    const lo = p.side[weak].adr!, hi = p.side[strong].adr!;
    if (hi - lo >= t.sideAdrGap && lo <= hi * t.sideAdrRatio) {
      emit(`side-impact.${weak.toLowerCase()}-gap`, "side-impact", "medium", `${weak} 方伤害影响明显低于 ${strong} 方`,
        `本场 ${weak} ADR ${lo.toFixed(2)}，${strong} ADR ${hi.toFixed(2)}；两侧伤害贡献有明显落差，值得优先复盘较弱一侧回合。`,
        (["CT", "T"] as const).flatMap(side => {
          const s = p.side[side];
          return [metric(`side.${side}.adr`, s.adr!, "hp/round"), metric(`side.${side}.roundsPlayed`, s.roundsPlayed, "count"),
            metric(`side.${side}.kills`, s.kills, "count"), metric(`side.${side}.deaths`, s.deaths, "count")];
        }));
    }
  }
  const trade = p.trade;
  if (participationComplete && trade.complete && trade.available && finite(trade.tradeRate)
    && trade.tradeableDeaths >= t.tradeDeaths && trade.tradeRate < t.tradeRate) {
    emit("trade.low-rate", "trade", "medium", "本场死亡被交易比例偏低",
      `${trade.tradeableDeaths} 次死亡时仍有存活队友，其中 ${trade.tradedDeaths} 次在 ${a.tradeWindow.seconds} 秒内被交易（${trade.tradeRate.toFixed(1)}%）；多数此类死亡未被及时回收。存活队友不代表有补枪位置，原因需回合复盘。`,
      [metric("trade.tradeableDeaths", trade.tradeableDeaths, "count"), metric("trade.tradedDeaths", trade.tradedDeaths, "count"),
        metric("trade.tradeRate", trade.tradeRate, "percent"), metric("trade.complete", true, "flag"),
        metric("tradeWindow.seconds", a.tradeWindow.seconds, "seconds")]);
  }
  const o = p.opening;
  const openingComplete = participationComplete && !a.coverage.issues["opening-duel-contested"]
    && !a.coverage.issues["opening-duel-unattributed"];
  if (openingComplete && o.duels >= t.openingDuels && finite(o.winRate)
    && (o.winRate <= t.openingLow || o.winRate >= t.openingHigh)) {
    const positive = o.winRate >= t.openingHigh;
    emit(`opening.${positive ? "positive" : "negative"}`, "opening", positive ? "positive" : "medium",
      positive ? "本场首杀对决贡献突出" : "本场首杀对决失利较多",
      `参与 ${o.duels} 次可归属首杀对决，取得 ${o.kills} 次首杀、${o.deaths} 次首死；${positive ? "多次为队伍取得开局人数优势" : "多次使队伍开局减员，值得复盘这些对决"}。`,
      [metric("opening.kills", o.kills, "count"), metric("opening.deaths", o.deaths, "count"),
        metric("opening.duels", o.duels, "count"), metric("opening.winRate", o.winRate, "ratio")]);
  }
  const u = p.utility, heThrows = u.throws.counts.hegrenade, fireThrows = u.throws.counts.fire;
  if (finite(heThrows) && finite(fireThrows) && u.he.complete && u.fire.complete
    && finite(u.he.enemyDamage) && finite(u.fire.enemyDamage)) {
    const throws = heThrows + fireThrows, damage = u.he.enemyDamage + u.fire.enemyDamage;
    const perThrow = throws > 0 ? damage / throws : 0;
    if (throws >= t.damageThrows && (perThrow < t.utilityLowDamagePerThrow || perThrow >= t.utilityHighDamagePerThrow)) {
      const positive = perThrow >= t.utilityHighDamagePerThrow;
      emit(`utility.damage-${positive ? "high" : "low"}`, "utility", positive ? "positive" : "low",
        positive ? "伤害道具取得较高敌方 HP 收益" : "伤害道具的直接敌伤收益偏低",
        `本场投出 ${throws} 枚 HE/燃烧道具，造成 ${damage} 点有效敌伤，平均每枚 ${perThrow.toFixed(1)} 点。${positive ? "提供了可确认的伤害贡献" : "可检查直接命中收益；伤害不衡量封路、拖延等战术价值"}。`,
        [metric("utility.throws.counts.hegrenade", heThrows, "count"), metric("utility.throws.counts.fire", fireThrows, "count"),
          metric("utility.he.enemyDamage", u.he.enemyDamage, "hp"), metric("utility.fire.enemyDamage", u.fire.enemyDamage, "hp")]);
    }
  }
  const flashes = u.throws.counts.flashbang;
  if (finite(flashes) && flashes >= t.flashThrows && u.flash.enemy.complete && u.flash.assistsComplete
    && finite(u.flash.assists) && u.flash.assists >= t.flashAssists
    && u.flash.enemy.count >= t.flashEnemyEffects && u.flash.enemy.count / flashes >= t.flashEffectsPerThrow) {
    emit("utility.flash-high", "utility", "positive", "本场闪光提供明确击杀支援",
      `${flashes} 次投掷记录到 ${u.flash.enemy.count} 条敌方受闪效果及 ${u.flash.assists} 次事件确认的闪光助攻；有可验证的队友击杀支援。效果数包含零 duration 行，不代表实际致盲时间。`,
      [metric("utility.throws.counts.flashbang", flashes, "count"), metric("utility.flash.enemy.count", u.flash.enemy.count, "count"),
        metric("utility.flash.assists", u.flash.assists, "count")]);
  }
  // Nonzero raw duration proves an effect, never actual blind time.
  const effects = u.flash.teammate.evidence.filter(e => e.event.blindDurationSeconds > 0)
    .sort((a, b) => a.round - b.round || a.event.tick - b.event.tick || textOrder(a.event.victim, b.event.victim)
      || a.event.blindDurationSeconds - b.event.blindDurationSeconds);
  if (finite(flashes) && flashes >= t.teamFlashThrows && u.flash.teammate.complete
    && effects.length >= t.teamFlashEffects && effects.length / flashes >= t.teamFlashEffectsPerThrow) {
    emit("team-flash.frequent-effects", "discipline", "medium", "本场多次闪到队友",
      `${flashes} 次闪光投掷中记录到 ${effects.length} 条非零队友受闪效果；可能干扰队友交战，值得检查投掷时机。一次投掷可影响多人，不能计算误闪投掷率或实际致盲时间。`,
      [metric("utility.throws.counts.flashbang", flashes, "count"), metric("utility.flash.teammate.nonzeroEffects", effects.length, "count"),
        ...effects.flatMap(e => [
          { ...metric("utility.flash.teammate.evidence.victim", e.event.victim, "player-id"), round: e.round, tick: e.event.tick },
          { ...metric("utility.flash.teammate.evidence.event.blindDurationSeconds", e.event.blindDurationSeconds, "seconds"), round: e.round, tick: e.event.tick },
        ])],
      [...new Set(effects.map(e => e.round))]);
  }
  // Resolver excludes unreliable rounds. Other missing rounds do not invalidate a proven win.
  for (const win of p.clutch.list.filter(e => e.won === true && e.player === p.steamId)) {
    emit(`clutch.win.r${win.round}`, "clutch", "positive", `R${win.round} 1v${win.opponents} 残局获胜`,
      `R${win.round} 成为唯一存活队员时面对 ${win.opponents} 名敌人，所在阵营最终赢下回合；这是本场明确亮点，不代表长期残局胜率。`,
      [{ ...metric("clutch.list.opponents", win.opponents, "count"), round: win.round, tick: win.tick },
        { ...metric("clutch.list.won", true, "flag"), round: win.round, tick: win.tick },
        { ...metric("clutch.list.side", win.side, "side"), round: win.round, tick: win.tick }], [win.round], "high");
  }
  return out;
}
/** Pure, capped per player; unknown requested player produces no findings. */
export function generateFindings(analytics: MatchAnalytics, playerId?: string): Finding[] {
  return [...analytics.players].filter(p => playerId === undefined || p.steamId === playerId)
    .sort((a, b) => textOrder(a.steamId, b.steamId)).flatMap(p => {
      const rows = candidates(analytics, p);
      const issues = rows.filter(f => f.severity !== "positive").sort((a, b) =>
        severityOrder[a.severity] - severityOrder[b.severity] || categoryOrder[a.category] - categoryOrder[b.category]
        || textOrder(a.ruleId, b.ruleId));
      const highlights = rows.filter(f => f.severity === "positive").sort((a, b) => {
        if (a.category === "clutch" && b.category === "clutch") return Number(b.evidence[0].value) - Number(a.evidence[0].value)
          || a.relatedRounds![0] - b.relatedRounds![0];
        return (a.category === "clutch" ? -1 : b.category === "clutch" ? 1 : 0)
          || categoryOrder[a.category] - categoryOrder[b.category] || textOrder(a.ruleId, b.ruleId);
      });
      return [...issues.slice(0, findingThresholds.maxIssues), ...highlights.slice(0, findingThresholds.maxHighlights)];
    });
}
