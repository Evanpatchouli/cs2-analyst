import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import type { ParserAdapter } from "../adapter.js";
import type { SpatialParseResult, SpatialSamplingOptions } from "../spatial.js";
import { convertToMatch } from "./converters.js";
import { buildSpatialEvidence, planSpatialSampling, spatialFields } from "./spatial-evidence.js";

// Keep all native APIs and their untyped results behind this adapter.
export class Demoparser2Adapter implements ParserAdapter {
  readonly name = "demoparser2";

  async parse(filePath: string): Promise<unknown> {
    const { bytes, native } = await this.readInput(filePath);
    return this.parseInput(bytes, native);
  }

  async parseWithSpatial(filePath: string, options: SpatialSamplingOptions = {}): Promise<SpatialParseResult> {
    const started = performance.now();
    const { bytes, native } = await this.readInput(filePath);
    const match = convertToMatch(this.parseInput(bytes, native));
    const parsed = performance.now();
    const plan = planSpatialSampling(match, options);
    const ticks = [...plan.coreTicks, ...plan.optionalTicks].sort((a, b) => a - b);
    let rawRows: unknown = [];
    let failed = false;
    if (ticks.length) {
      try {
        // Reuse the input bytes. One new native query, never an empty full-tick query.
        rawRows = native.parseTicks(bytes, spatialFields, ticks) as unknown;
      } catch {
        failed = true;
      }
    }
    const spatial = buildSpatialEvidence(match, plan, rawRows, failed);
    const finished = performance.now();
    return { match, spatial, performance: {
      parserMs: parsed - started, spatialMs: finished - parsed, totalMs: finished - started, peakMemory: "UNKNOWN",
    } };
  }

  private async readInput(filePath: string) {
    const bytes = await readFile(filePath);
    if (bytes.length < 16 || !bytes.subarray(0, 8).equals(Buffer.from("PBDEMS2\0"))) {
      throw new Error("文件不是有效的 CS2 DEM（PBDEMS2）");
    }

    const native = await import("@laihoe/demoparser2");
    return { bytes, native };
  }

  private parseInput(bytes: Buffer, native: typeof import("@laihoe/demoparser2")): unknown {
    const events = native.parseEvents(
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
        "player_spawn",
        "player_disconnect",
        "player_team",
      ],
      ["team_num", "is_alive"],
      ["total_rounds_played", "is_warmup_period", "game_time"],
    ) as unknown;
    const boundaryTicks = [...new Set((events as Record<string, unknown>[])
      .filter(event => event.is_warmup_period !== true
        && ["round_start", "round_freeze_end", "round_end"].includes(String(event.event_name))
        && typeof event.tick === "number" && Number.isSafeInteger(event.tick) && event.tick >= 0)
      .map(event => event.tick as number))].sort((a, b) => a - b);

    return {
      id: createHash("sha256").update(bytes).digest("hex"),
      header: native.parseHeader(bytes) as unknown,
      players: native.parsePlayerInfo(bytes) as unknown,
      events,
      stateRows: boundaryTicks.length > 0
        ? native.parseTicks(bytes, ["team_num", "is_alive"], boundaryTicks) as unknown
        : [],
    };
  }
}
