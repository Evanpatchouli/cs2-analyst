import type { Match } from "@cs2-coach/match-model";

import type { DemoParser } from "../parser.js";

/**
 * demoparser2 implementation entry point.
 *
 * This adapter converts demoparser2 output into match-model.
 * The rest of the application must not depend on demoparser2 directly.
 */
export class Demoparser2Provider implements DemoParser {
  async parse(_filePath: string): Promise<Match> {
    throw new Error("demoparser2 provider is not implemented yet");
  }
}
