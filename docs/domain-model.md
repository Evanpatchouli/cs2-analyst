# CS2 Coach Domain Model

## Core Principle

match-model defines the internal representation of a CS2 match. It does not depend on DEM format, parser implementation, analytics rules, or AI.

## Entities

### Match

Represents one complete CS2 demo.

Contains:
- metadata
- map information
- teams
- players
- rounds

### Player

Represents a participant.

Contains:
- steamId
- nickname
- team
- statistics reference

### Round

Represents a single round lifecycle.

Contains:
- round number
- side information
- winner
- events

### Event

Base event model.

Possible events:
- KillEvent
- DamageEvent
- WeaponFireEvent
- UtilityEvent
- PositionEvent

## Dependency Direction

DEM parser -> match-model -> analytics -> findings -> report
