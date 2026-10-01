import type { Match } from "@cs2-coach/match-model";

import type { DemoParser } from "../parser.js";
import { convertToMatch } from "./converters.js";

/**
 * demoparser2 implementation entry point.
 *
 * This adapter converts demoparser2 output into match-model.
 * The rest of the application must not depend on demoparser2 directly.
 */
export class Demoparser2Provider implements DemoParser {
  async parse(filePath: string): Promise<Match> {
    // The native demoparser2 loading will be added here after dependency
    // installation is verified. Keep the conversion boundary stable first.
    const parserOutput = {
      filePath,
    };

    return convertToMatch(parserOutput);
  }
}
