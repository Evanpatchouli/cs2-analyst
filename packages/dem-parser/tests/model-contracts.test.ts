import type { DamageEvent, MatchEvent } from "@cs2-coach/match-model";

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

void [evidence, emptyDamage, numericAttacker, positionStream];
