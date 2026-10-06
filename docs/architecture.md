# CS2 Coach Architecture

## Overview

CS2 Coach is structured as a desktop application with a deterministic analysis core.

## Packages

- `dem-parser`: CS2 DEM parsing adapter layer
- `match-model`: domain models for matches, rounds and players
- `analytics`: deterministic metrics calculation
- `findings`: pattern detection and coaching evidence
- `report-contract`: JSON-only Electron/Renderer presentation DTO (types only)

The Electron desktop app runs the native parser and the full deterministic pipeline in a Utility Process and sends a serializable report DTO to the sandboxed renderer over contextBridge IPC. The renderer never imports `dem-parser`, Node builtins or Analytics, and never recomputes metrics. Process model, IPC contract and UI: [desktop report](./desktop-report.md).

The DEM implementation routes native demoparser2 results through an internal adapter and converter before returning `Match`. Native APIs are not exported by the package. See [DEM parsing](./dem-parser.md) for the current mappings and limitations.

`analytics` implements the P3 deterministic player and combat metrics and depends only on `match-model` domain types. Round windowing and roster coverage are centralized in `packages/analytics/src/coverage.ts` so individual metrics do not re-implement eligibility; the shared survival/trade timeline for KAST, Trade and Clutch lives in `packages/analytics/src/timeline.ts`. Definitions and limits: [analytics metrics](./analytics-metrics.md).

## Principles

DEM parsing, analysis logic and UI presentation must remain independent.

AI coaching is an optional interpretation layer built on top of structured findings.

`findings` consumes only frozen `MatchAnalytics` via the Analytics public package. `generateFindings` runs pure deterministic rules and returns ranked evidence with per-player caps (3 issues, 2 highlights). It does not parse DEMs or recompute Analytics; parser is a devDependency only for real-demo golden tests. Policy and gaps: [Findings Engine](./findings-engine.md).
