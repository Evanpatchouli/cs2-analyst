import type { Match } from "@cs2-coach/match-model";

import type { DemoParser } from "../parser.js";
import { convertToMatch } from "./converters.js";
import { Demoparser2Adapter } from "./demoparser2-adapter.js";

/**
 * demoparser2 implementation entry point.
 *
 * This adapter converts demoparser2 output into match-model.
 * The rest of the application must not depend on demoparser2 directly.
 */
export class Demoparser2Provider implements DemoParser {
  private readonly adapter = new Demoparser2Adapter();

  async parse(filePath: string): Promise<Match> {
    try {
      return convertToMatch(await this.adapter.parse(filePath));
    } catch (cause) {
      throw new Error(`无法解析 DEM 文件：${filePath}`, { cause });
    }
  }
}
