import type { Match } from "@cs2-coach/match-model";

/**
 * Convert parser-specific output into CS2 Coach domain models.
 *
 * This boundary intentionally prevents demoparser2 data structures from leaking
 * into the rest of the application.
 */
export function convertToMatch(input: unknown): Match {
  void input;

  return {
    id: crypto.randomUUID(),
    map: "unknown",
    players: [],
    rounds: [],
  };
}
