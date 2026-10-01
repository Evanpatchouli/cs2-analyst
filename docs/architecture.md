# CS2 Coach Architecture

## Overview

CS2 Coach is structured as a desktop application with a deterministic analysis core.

## Packages

- `dem-parser`: CS2 DEM parsing adapter layer
- `match-model`: domain models for matches, rounds and players
- `analytics`: deterministic metrics calculation
- `findings`: pattern detection and coaching evidence

The DEM implementation routes native demoparser2 results through an internal adapter and converter before returning `Match`. Native APIs are not exported by the package. See [DEM parsing](./dem-parser.md) for the current mappings and limitations.

## Principles

DEM parsing, analysis logic and UI presentation must remain independent.

AI coaching is an optional interpretation layer built on top of structured findings.
