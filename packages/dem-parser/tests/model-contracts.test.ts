import type { DamageEvent, MatchEvent } from "@cs2-analyst/match-model";
import type {
  RoundPlayerLifecycleEvent, RoundPlayerState, RoundStateBoundary, RoundStateSnapshot,
} from "@cs2-analyst/match-model";

// Compile the domain contract as a consumer, including discriminant narrowing.
function evidence(event: MatchEvent): string | number | null | undefined {
  switch (event.type) {
    case "kill": return event.assister;
    case "damage": return event.healthDamage;
    case "weapon_fire": return event.weapon;
    case "utility": return event.utility;
    case "flash": return event.blindDurationSeconds;
    case "bomb": return event.siteIndex;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

// @ts-expect-error A type/tick placeholder is no longer a combat event.
const emptyDamage: MatchEvent = { type: "damage", tick: 1 };
// @ts-expect-error SteamID64 cannot be a number in the domain contract.
const numericAttacker: DamageEvent["attacker"] = 76561199642456355;
// @ts-expect-error Full position streams are outside the combat event union.
const positionStream: MatchEvent = { type: "position", tick: 1 };

const boundary: RoundStateBoundary = "freeze_end";
const playerState: RoundPlayerState = {
  steamId: "76561199642456355", side: "CT", alive: null, participant: true,
};
const stateSnapshot: RoundStateSnapshot = {
  boundary, tick: 20, availability: "observed", players: [playerState], unidentifiedPlayerCount: 0,
};
const sideChange: RoundPlayerLifecycleEvent = {
  type: "side_change", tick: 21, player: playerState.steamId,
  side: "T", previousSide: "CT", disconnect: false,
};

void [evidence, emptyDamage, numericAttacker, positionStream, stateSnapshot, sideChange];
