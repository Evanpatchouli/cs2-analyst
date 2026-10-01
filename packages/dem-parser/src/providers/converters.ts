import type { KillEvent, Match, MatchEvent, Player, Round, TeamSide } from "@cs2-coach/match-model";

type Row = Record<string, unknown>;

const eventTypes = new Map<string, MatchEvent["type"]>([
  ["player_death", "kill"],
  ["player_hurt", "damage"],
  ["weapon_fire", "weapon_fire"],
  ["smokegrenade_detonate", "utility"],
  ["hegrenade_detonate", "utility"],
  ["flashbang_detonate", "utility"],
  ["inferno_startburn", "utility"],
  ["decoy_started", "utility"],
]);

function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("DEM 解析结果应为对象");
  }
  return value as Row;
}

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error("DEM 解析结果应为数组");
  return value.map(row);
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function steamId(value: unknown): string | undefined {
  // SteamID64 must never pass through a JavaScript number (precision loss).
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : undefined;
}

function side(value: unknown): TeamSide {
  if (value === 2 || value === "T") return "T";
  if (value === 3 || value === "CT") return "CT";
  return "Unknown";
}

function convertEvent(event: Row): MatchEvent | null {
  const type = eventTypes.get(String(event.event_name));
  if (!type) return null;
  const tick = integer(event.tick);
  if (tick === undefined) throw new Error("DEM 事件缺少有效 tick");
  if (type !== "kill") return { type, tick };

  const victim = steamId(event.user_steamid);
  if (!victim) return null;
  const kill: KillEvent = {
    type,
    tick,
    killer: steamId(event.attacker_steamid) ?? "world",
    victim,
  };
  if (typeof event.weapon === "string") kill.weapon = event.weapon;
  if (typeof event.headshot === "boolean") kill.headshot = event.headshot;
  return kill;
}

function convertPlayers(metadata: Row[], events: Row[]): Player[] {
  const players = new Map<string, Player>();
  for (const entry of metadata) {
    const id = steamId(entry.steamid);
    if (!id) continue;
    players.set(id, {
      steamId: id,
      nickname: typeof entry.name === "string" ? entry.name : id,
      team: side(entry.team_number),
    });
  }

  // Metadata can describe the final half. Prefer the first observed live
  // side, and include participants missing from the metadata table.
  const observedSides = new Set<string>();
  for (const event of events) {
    for (const prefix of ["user", "attacker", "assister"]) {
      const id = steamId(event[`${prefix}_steamid`]);
      if (!id) continue;
      let player = players.get(id);
      if (!player) {
        const name = event[`${prefix}_name`];
        player = { steamId: id, nickname: typeof name === "string" ? name : id, team: "Unknown" };
        players.set(id, player);
      }
      const team = side(event[`${prefix}_team_num`]);
      if (!observedSides.has(id) && team !== "Unknown") {
        player.team = team;
        observedSides.add(id);
      }
    }
  }
  return [...players.values()].sort((a, b) => a.steamId.localeCompare(b.steamId));
}

function convertRounds(events: Row[]): Round[] {
  const rounds = new Map<number, Round>();
  let current: Round | undefined;
  let startTick: number | undefined;

  function getRound(event: Row): Round {
    const explicit = integer(event.round);
    const played = integer(event.total_rounds_played);
    const number = explicit && explicit > 0 ? explicit : played !== undefined ? played + 1 : undefined;
    if (number === undefined) throw new Error("DEM 事件缺少有效回合编号");
    let round = rounds.get(number);
    if (!round) {
      round = { number, winner: null, events: [] };
      rounds.set(number, round);
    }
    return round;
  }

  for (const event of events) {
    if (event.event_name === "round_start") {
      const next = getRound(event);
      // Replace an abandoned attempt, but retain events on duplicate starts.
      if (next === current && startTick !== event.tick) {
        next.events = [];
        next.winner = null;
      }
      current = next;
      startTick = integer(event.tick);
      continue;
    }
    if (event.event_name === "round_end") {
      // Old demos have numeric winners and a pre-increment counter; newer
      // demos have CT/T winners and an explicit one-based round field.
      current = event.round !== undefined ? getRound(event) : current ?? getRound(event);
      const winner = side(event.winner);
      current.winner = winner === "Unknown" ? null : winner;
      continue;
    }
    const converted = convertEvent(event);
    if (converted) {
      // Keep post-round combat in the same round until the next round_start.
      current ??= getRound(event);
      current.events.push(converted);
    }
  }
  return [...rounds.values()].sort((a, b) => a.number - b.number);
}

function tickRate(events: Row[]): number | undefined {
  const timed = events.filter((event) => typeof event.game_time === "number" && Number.isFinite(event.game_time));
  const first = timed[0];
  const last = timed.at(-1);
  if (!first || !last) return undefined;
  const elapsed = (last.game_time as number) - (first.game_time as number);
  if (elapsed <= 0) return undefined;
  const rate = ((last.tick as number) - (first.tick as number)) / elapsed;
  const rounded = Math.round(rate);
  return rounded > 0 && Math.abs(rate - rounded) < 0.01 ? rounded : undefined;
}

/** Validate native results and translate them into the existing domain model. */
export function convertToMatch(input: unknown): Match {
  const output = row(input);
  const header = row(output.header);
  if (typeof output.id !== "string" || !output.id) throw new Error("DEM 缺少内容标识");
  if (typeof header.map_name !== "string" || !header.map_name.trim()) {
    throw new Error("DEM header 缺少地图名称");
  }
  const metadata = rows(output.players);
  const events = rows(output.events)
    .filter((event) => event.is_warmup_period !== true)
    .map((event) => {
      if (integer(event.tick) === undefined) throw new Error("DEM 事件缺少有效 tick");
      return event;
    })
    .sort((a, b) => (a.tick as number) - (b.tick as number));

  const match: Match = {
    id: output.id,
    map: header.map_name,
    players: convertPlayers(metadata, events),
    rounds: convertRounds(events),
  };
  const rate = tickRate(events);
  if (rate !== undefined) match.tickRate = rate;
  return match;
}
