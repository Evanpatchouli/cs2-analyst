import type {
  BombAction, BombEvent, DamageEvent, FlashEvent, KillEvent, Match, MatchEvent,
  Player, Round, RoundPlayerLifecycleEvent, RoundPlayerState, RoundStateBoundary,
  RoundStateSnapshot, TeamSide, UtilityAction, UtilityEvent, UtilityKind, WeaponFireEvent,
} from "@cs2-analyst/match-model";

type Row = Record<string, unknown>;

const utilityEffects = new Map<string, [UtilityKind, UtilityAction]>([
  ["smokegrenade_detonate", ["smoke", "detonate"]],
  ["hegrenade_detonate", ["hegrenade", "detonate"]],
  ["flashbang_detonate", ["flashbang", "detonate"]],
  // The effect event does not distinguish molotov from incendiary grenades.
  ["inferno_startburn", ["fire", "start_burn"]],
  ["decoy_started", ["decoy", "start_decoy"]],
]);

const bombActions = new Map<string, BombAction>([
  ["bomb_pickup", "pickup"],
  ["bomb_dropped", "drop"],
  ["bomb_beginplant", "plant_start"],
  ["bomb_planted", "planted"],
  ["bomb_begindefuse", "defuse_start"],
  ["bomb_defused", "defused"],
  ["bomb_exploded", "exploded"],
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
  if (typeof value === "number" || typeof value === "bigint") {
    throw new Error("DEM SteamID64 必须为 string");
  }
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : undefined;
}

function side(value: unknown): TeamSide {
  if (value === 2 || value === "T") return "T";
  if (value === 3 || value === "CT") return "CT";
  return "Unknown";
}

function requiredInteger(event: Row, field: string): number {
  const value = integer(event[field]);
  if (value === undefined) throw new Error(`DEM ${event.event_name} 缺少有效 ${field}`);
  return value;
}

function label(value: unknown): value is string | number {
  return typeof value === "string" || integer(value) !== undefined;
}

function convertEvent(event: Row): MatchEvent | null {
  const tick = requiredInteger(event, "tick");
  const name = String(event.event_name);
  if (name === "player_death") {
    const victim = steamId(event.user_steamid);
    if (!victim) return null;
    const killer = steamId(event.attacker_steamid);
    const kill: KillEvent = {
      type: "kill", tick, killer: killer ?? "world", victim,
      killerSide: side(event.attacker_team_num), victimSide: side(event.user_team_num),
    };
    if (typeof event.weapon === "string") kill.weapon = event.weapon;
    if (typeof event.headshot === "boolean") kill.headshot = event.headshot;
    const assister = steamId(event.assister_steamid);
    if (assister) {
      kill.assister = assister;
      kill.assisterSide = side(event.assister_team_num);
    }
    if (typeof event.assistedflash === "boolean") kill.assistedFlash = event.assistedflash;
    if (killer && kill.killerSide !== "Unknown" && kill.victimSide !== "Unknown") {
      kill.teamkill = killer !== victim && kill.killerSide === kill.victimSide;
    }
    return kill;
  }
  if (name === "player_hurt") {
    const victim = steamId(event.user_steamid);
    if (!victim) return null;
    const damage: DamageEvent = {
      type: "damage", tick, attacker: steamId(event.attacker_steamid) ?? null, victim,
      attackerSide: side(event.attacker_team_num), victimSide: side(event.user_team_num),
      healthDamage: requiredInteger(event, "dmg_health"),
      armorDamage: requiredInteger(event, "dmg_armor"),
      healthRemaining: requiredInteger(event, "health"),
      armorRemaining: requiredInteger(event, "armor"),
    };
    if (typeof event.weapon === "string") damage.weapon = event.weapon;
    if (label(event.hitgroup)) damage.hitgroup = event.hitgroup;
    return damage;
  }
  if (name === "weapon_fire") {
    const shooter = steamId(event.user_steamid);
    if (!shooter) return null;
    if (typeof event.weapon !== "string" || !event.weapon) {
      throw new Error("DEM weapon_fire 缺少有效 weapon");
    }
    const fire: WeaponFireEvent = {
      type: "weapon_fire", tick, shooter, shooterSide: side(event.user_team_num), weapon: event.weapon,
    };
    if (typeof event.silenced === "boolean") fire.silenced = event.silenced;
    return fire;
  }
  const effect = utilityEffects.get(name);
  if (effect) {
    const utility: UtilityEvent = {
      type: "utility", tick, utility: effect[0], action: effect[1],
      thrower: steamId(event.user_steamid) ?? null, throwerSide: side(event.user_team_num),
    };
    const entityId = integer(event.entityid);
    if (entityId !== undefined) utility.entityId = entityId;
    const { x, y, z } = event;
    if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
      && typeof z === "number" && Number.isFinite(z)) utility.position = { x, y, z };
    return utility;
  }
  if (name === "player_blind") {
    const victim = steamId(event.user_steamid);
    if (!victim) return null;
    const duration = event.blind_duration;
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
      throw new Error("DEM player_blind 缺少有效 blind_duration");
    }
    const flash: FlashEvent = {
      type: "flash", tick, attacker: steamId(event.attacker_steamid) ?? null, victim,
      attackerSide: side(event.attacker_team_num), victimSide: side(event.user_team_num),
      blindDurationSeconds: duration,
    };
    const entityId = integer(event.entityid);
    if (entityId !== undefined) flash.entityId = entityId;
    return flash;
  }
  const action = bombActions.get(name);
  if (action) {
    const bomb: BombEvent = {
      type: "bomb", tick, action, player: steamId(event.user_steamid) ?? null,
      playerSide: side(event.user_team_num),
    };
    const siteIndex = integer(event.site);
    if (siteIndex !== undefined) bomb.siteIndex = siteIndex;
    if (typeof event.haskit === "boolean") bomb.hasKit = event.haskit;
    return bomb;
  }
  return null;
}

const lifecycleNames = new Set(["player_spawn", "player_disconnect", "player_team"]);

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
      if (lifecycleNames.has(String(event.event_name))) continue;
      const team = side(event[`${prefix}_team_num`]);
      if (!observedSides.has(id) && team !== "Unknown") {
        player.team = team;
        observedSides.add(id);
      }
    }
  }
  return [...players.values()].sort((a, b) => a.steamId.localeCompare(b.steamId));
}

function lifecycleEvent(event: Row): RoundPlayerLifecycleEvent | null {
  const name = event.event_name;
  if (!lifecycleNames.has(String(name))) return null;
  const tick = requiredInteger(event, "tick");
  const player = steamId(event.user_steamid) ?? null;
  if (name === "player_spawn") return { type: "spawn", tick, player, side: side(event.user_team_num) };
  if (name === "player_disconnect") return { type: "disconnect", tick, player };
  const change: RoundPlayerLifecycleEvent = {
    type: "side_change", tick, player,
    side: side(event.team), previousSide: side(event.oldteam),
  };
  if (typeof event.disconnect === "boolean") change.disconnect = event.disconnect;
  return change;
}

function convertStateRows(value: unknown): {
  byTick: Map<number, { players: RoundPlayerState[]; unidentifiedPlayerCount: number }>;
  names: Map<string, string>;
} {
  const byTick = new Map<number, Map<string, RoundPlayerState>>();
  const unidentified = new Map<number, number>();
  const playerNames = new Map<string, string>();
  for (const entry of rows(value)) {
    const tick = integer(entry.tick);
    if (tick === undefined) throw new Error("DEM state row 缺少有效 tick");
    if (!byTick.has(tick)) byTick.set(tick, new Map());
    const id = steamId(entry.steamid);
    if (!id) {
      unidentified.set(tick, (unidentified.get(tick) ?? 0) + 1);
      continue;
    }
    const rawTeam = entry.team_num;
    const participant = rawTeam === 2 || rawTeam === 3 || rawTeam === "T" || rawTeam === "CT"
      ? true
      : rawTeam === 0 || rawTeam === 1 ? false : null;
    const state: RoundPlayerState = {
      steamId: id,
      side: side(rawTeam),
      alive: typeof entry.is_alive === "boolean" ? entry.is_alive : null,
      participant,
    };
    const states = byTick.get(tick)!;
    const previous = states.get(id);
    if (previous && (previous.side !== state.side || previous.alive !== state.alive
      || previous.participant !== state.participant)) {
      throw new Error(`DEM tick ${tick} SteamID ${id} 有冲突的 state rows`);
    }
    states.set(id, state);
    if (!playerNames.has(id)) playerNames.set(id, typeof entry.name === "string" && entry.name ? entry.name : id);
  }
  return {
    byTick: new Map([...byTick].map(([tick, states]) => [tick, {
      players: [...states.values()].sort((a, b) => a.steamId.localeCompare(b.steamId)),
      unidentifiedPlayerCount: unidentified.get(tick) ?? 0,
    }])),
    names: playerNames,
  };
}

function attachStateSnapshots(rounds: Round[], stateRows: unknown): Map<string, string> {
  const { byTick, names } = convertStateRows(stateRows);
  const boundaries: [keyof Round, RoundStateBoundary][] = [
    ["startTick", "start"], ["freezeEndTick", "freeze_end"], ["endTick", "end"],
  ];
  const observedIds = new Set<string>();
  for (const round of rounds) {
    const snapshots: RoundStateSnapshot[] = [];
    for (const [field, boundary] of boundaries) {
      const tick = round[field];
      if (typeof tick !== "number") continue;
      const atTick = byTick.get(tick);
      for (const player of atTick?.players ?? []) observedIds.add(player.steamId);
      snapshots.push({
        boundary, tick, availability: atTick ? "observed" : "unavailable",
        players: atTick?.players ?? [], unidentifiedPlayerCount: atTick?.unidentifiedPlayerCount ?? 0,
      });
    }
    if (snapshots.length) round.stateSnapshots = snapshots;
  }
  return new Map([...names].filter(([id]) => observedIds.has(id)));
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
        if (next.playerLifecycle) next.playerLifecycle = [];
        delete next.freezeEndTick;
        delete next.endTick;
        delete next.endReason;
      }
      current = next;
      startTick = integer(event.tick);
      current.startTick = startTick;
      continue;
    }
    if (event.event_name === "round_freeze_end") {
      current ??= getRound(event);
      current.freezeEndTick = integer(event.tick);
      continue;
    }
    if (event.event_name === "round_end") {
      // Old demos have numeric winners and a pre-increment counter; newer
      // demos have CT/T winners and an explicit one-based round field.
      current = event.round !== undefined ? getRound(event) : current ?? getRound(event);
      const winner = side(event.winner);
      current.winner = winner === "Unknown" ? null : winner;
      current.endTick = integer(event.tick);
      if (label(event.reason)) current.endReason = event.reason;
      continue;
    }
    const lifecycle = lifecycleEvent(event);
    if (lifecycle) {
      current ??= getRound(event);
      (current.playerLifecycle ??= []).push(lifecycle);
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

/** Validate native results and translate them into parser-independent domain events. */
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
    // Lifecycle start precedes same-tick events in that round; otherwise retain
    // native ordering without claiming to know the order within a demo tick.
    .sort((a, b) => (a.tick as number) - (b.tick as number)
      || Number(b.event_name === "round_start") - Number(a.event_name === "round_start"));

  const rounds = convertRounds(events);
  let stateOnlyPlayers: Map<string, string> | undefined;
  if (Object.hasOwn(output, "stateRows")) {
    stateOnlyPlayers = attachStateSnapshots(rounds, output.stateRows);
    for (const round of rounds) round.playerLifecycle ??= [];
  }
  const players = convertPlayers(metadata, events);
  if (stateOnlyPlayers) {
    const known = new Set(players.map(player => player.steamId));
    for (const [steamId, nickname] of stateOnlyPlayers) {
      if (!known.has(steamId)) players.push({ steamId, nickname, team: "Unknown" });
    }
    players.sort((a, b) => a.steamId.localeCompare(b.steamId));
  }
  const match: Match = {
    id: output.id,
    map: header.map_name,
    players,
    rounds,
  };
  const rate = tickRate(events);
  if (rate !== undefined) match.tickRate = rate;
  return match;
}
