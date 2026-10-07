import type { DamageEvent } from "@cs2-analyst/match-model";

import type { RoundCoverage } from "./coverage.js";

/**
 * Spawn health for a formal round.
 *
 * A hurt event carries the victim's health *after* the hit, so the first
 * in-window hit on a victim can only be resolved by starting from full health.
 * The value is validated on every first hit: a round that opens on an already
 * wounded or resupplied player yields a chain-broken coverage count instead of
 * a silent guess.
 */
export const spawnHealth = 100;

/** Why a hit's actual HP loss could not be established from the recorded evidence. */
export type DamageLossIssue =
  | "damage-effective-chain-broken"
  | "damage-effective-same-tick-ambiguous";

export const damageLossIssueTypes: readonly DamageLossIssue[] = [
  "damage-effective-chain-broken",
  "damage-effective-same-tick-ambiguous",
];

/**
 * Per-hit effective (actual HP) loss for one round.
 *
 * The demo reports integer `dmg_health` while `health` is the post-hit
 * remainder, so one hit can remove exactly one more HP than reported. A hit is
 * accepted only when its measured loss stays inside that one-point band around
 * the capped reported damage; a larger gap means the HP trajectory is missing
 * evidence, and the hit is surfaced through coverage rather than attributed.
 */
export interface DamageLedger {
  /** Actual HP removed by the hit; null when the recorded trajectory cannot resolve it. */
  loss(event: DamageEvent): number | null;
  /** Unresolved hit counts keyed by coverage issue, attributed once per event. */
  unresolved: Readonly<Partial<Record<DamageLossIssue, number>>>;
}

function isResolvable(loss: number, cappedReported: number): boolean {
  return loss >= 0 && loss - cappedReported >= -1 && loss - cappedReported <= 1;
}

/**
 * Resolve every in-window damage event against its victim's HP trajectory.
 *
 * Friendly, self and world damage are kept in the trajectory (they change the
 * victim's remaining HP) even though only enemy damage is ever credited to a
 * player. Damage outside the formal round window never enters the chain.
 */
export function buildDamageLedger(round: RoundCoverage): DamageLedger {
  const events = round.eventsInWindow().filter((event): event is DamageEvent => event.type === "damage");
  const byVictim = new Map<string, DamageEvent[]>();
  for (const event of events) {
    const list = byVictim.get(event.victim);
    if (list) list.push(event);
    else byVictim.set(event.victim, [event]);
  }

  const losses = new Map<DamageEvent, number>();
  const unresolved: Partial<Record<DamageLossIssue, number>> = {};
  const add = (issue: DamageLossIssue, amount: number): void => {
    unresolved[issue] = (unresolved[issue] ?? 0) + amount;
  };

  for (const list of byVictim.values()) {
    // The first in-window hit is measured against spawn health.
    let remaining = spawnHealth;
    let index = 0;
    while (index < list.length) {
      const tick = list[index].tick;
      let end = index;
      while (end + 1 < list.length && list[end + 1].tick === tick) end++;
      const group = list.slice(index, end + 1);

      // Same-tick hits are ordered only by the demo array, which is not a
      // subtick timestamp; the recorded post-hit HP has to corroborate that
      // order before any of the group is attributed.
      const resolved: [DamageEvent, number][] = [];
      let groupRemaining = remaining;
      let broken = false;
      for (const event of group) {
        const loss = groupRemaining - event.healthRemaining;
        if (!isResolvable(loss, Math.min(event.healthDamage, groupRemaining))) {
          broken = true;
          break;
        }
        resolved.push([event, loss]);
        groupRemaining = event.healthRemaining;
      }

      if (broken) {
        // A rejected post-hit value can no longer anchor the rest of this
        // victim's round, so the remaining hits stay unresolved too.
        add(group.length > 1 ? "damage-effective-same-tick-ambiguous" : "damage-effective-chain-broken", group.length);
        const rest = list.length - (end + 1);
        if (rest > 0) add("damage-effective-chain-broken", rest);
        break;
      }

      for (const [event, loss] of resolved) losses.set(event, loss);
      remaining = groupRemaining;
      index = end + 1;
    }
  }

  return {
    loss: (event: DamageEvent) => losses.get(event) ?? null,
    unresolved,
  };
}
