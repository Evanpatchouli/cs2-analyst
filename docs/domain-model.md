# CS2 Analyst Domain Model

## Core Principle

match-model defines the internal representation of a CS2 match. It does not depend on DEM format, parser implementation, analytics rules, or AI.

## Entities

### Match

Represents one complete CS2 demo.

Contains a content ID, map name, optional observed tick rate, players and rounds.

### Player

Represents a participant.

Contains a SteamID64 **string**, nickname and initial observed `team` (`CT`, `T`, or `Unknown`). The initial side is not a persistent team identity or a per-round roster.

### Round

Represents a single round lifecycle.

Contains a one-based number, winner (`CT`, `T`, or `null`) and a combat event timeline. Optional `startTick`, `freezeEndTick`, `endTick` and `endReason` preserve recorded lifecycle evidence. Missing boundaries remain absent; a round restart clears the abandoned attempt's events and lifecycle context.

Post-round events remain attached to that round until the next start. Analytics must use the boundaries to decide which evidence to count. An event at the same tick as `round_start` belongs to the new round; remaining equal-tick order is not guaranteed to represent subtick order.

### Event

`EventBase` contains a demo `tick`. `MatchEvent` is a discriminated union of concrete events, so checking `event.type` exposes the corresponding business payload. A bare `type/tick` damage or utility record is no longer a valid domain event.

| Model / type | Evidence |
| --- | --- |
| `KillEvent` / `kill` | killer, victim, optional weapon/headshot, event sides, assister/assister side, flash-assist flag, known teamkill flag |
| `DamageEvent` / `damage` | attacker or null, victim, event sides, reported health/armor damage, remaining health/armor, optional weapon/hitgroup |
| `WeaponFireEvent` / `weapon_fire` | shooter, event side, reported weapon identifier, optional silenced flag; includes grenade releases and knives |
| `UtilityEvent` / `utility` | effect kind and action, thrower or null, event side, optional entity index and discrete effect origin |
| `FlashEvent` / `flash` | attacker or null, one victim, event sides, reported blind duration in seconds, optional entity index |
| `BombEvent` / `bomb` | pickup/drop/plant start/planted/defuse start/defused/exploded, event-associated player or null, event side, optional site index and kit flag |

All player IDs use strings. `KillEvent.killer` keeps the legacy `"world"` sentinel when no identifiable killer is available; this sentinel does not prove an environmental cause. New nullable actor fields explicitly represent unattributed evidence. Event sides describe that moment, including after halftime, and never fall back to `Player.team`. Unknown sides remain `Unknown`; unknown teamkill status remains absent. Teamkill is derived from identified participants with known sides and excludes suicide.

Damage is preserved as reported, including overkill. It is not precomputed effective HP loss or ADR. Utility origin coordinates are individual event snapshots in map units; there is no `PositionEvent`, full player position stream or full tick stream in `Match`. An inferno effect is `fire`, without guessing molotov versus incendiary. Demo-local entity indices can be reused. Bomb site indices are not A/B labels. Optional booleans retain explicit `false` and remain absent when not reported.

The previous `KillEvent` killer/victim/weapon/headshot contract remains usable; new kill fields are optional. Consumers of the old base `MatchEvent` placeholder must supply the concrete payload. No current desktop/analytics/findings consumer depends on those placeholders.

Round 另可包含 `stateSnapshots` 与 `playerLifecycle`。快照在已记录的 start / freeze_end / end 精确 tick 保存玩家身份、side、participant 和 nullable alive，标记 observed/unavailable 及不可识别玩家行数；名单不依赖战斗事件。生命周期与 combat union 分开，包含实际 spawn、disconnect 与 side_change，不推测连接或复活。兼容缺少这些可选字段的已有 Round。详见 [P2.2 round state](./round-state-evidence.md)。

See [combat event evidence](./combat-event-evidence.md) for native mappings, captured examples, unavailable data and P3 prerequisites.

## Dependency Direction

DEM parser -> match-model -> analytics -> findings -> report
