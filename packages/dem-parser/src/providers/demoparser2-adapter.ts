import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { ParserAdapter } from "../adapter.js";

// Keep all native APIs and their untyped results behind this adapter.
export class Demoparser2Adapter implements ParserAdapter {
  readonly name = "demoparser2";

  async parse(filePath: string): Promise<unknown> {
    const bytes = await readFile(filePath);
    if (bytes.length < 16 || !bytes.subarray(0, 8).equals(Buffer.from("PBDEMS2\0"))) {
      throw new Error("文件不是有效的 CS2 DEM（PBDEMS2）");
    }

    const native = await import("@laihoe/demoparser2");
    return {
      id: createHash("sha256").update(bytes).digest("hex"),
      header: native.parseHeader(bytes) as unknown,
      players: native.parsePlayerInfo(bytes) as unknown,
      events: native.parseEvents(
        bytes,
        [
          "round_start",
          "round_end",
          "round_freeze_end",
          "player_death",
          "player_hurt",
          "weapon_fire",
          "smokegrenade_detonate",
          "hegrenade_detonate",
          "flashbang_detonate",
          "inferno_startburn",
          "decoy_started",
          "player_blind",
          "bomb_pickup",
          "bomb_dropped",
          "bomb_beginplant",
          "bomb_planted",
          "bomb_begindefuse",
          "bomb_defused",
          "bomb_exploded",
        ],
        ["team_num"],
        ["total_rounds_played", "is_warmup_period", "game_time"],
      ) as unknown,
    };
  }
}
