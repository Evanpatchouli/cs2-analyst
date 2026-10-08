# CS2 Analyst Architecture

## Overview

CS2 Analyst is structured as a desktop application with a deterministic analysis core.

## Packages

- `dem-parser`: CS2 DEM parsing adapter layer
- `match-model`: domain models for matches, rounds and players
- `analytics`: deterministic metrics calculation
- `deep-review`: deterministic Engagement segmentation and death-state Kill / Multi-kill evidence
- `findings`: pattern detection and coaching evidence
- `report-contract`: JSON-only Electron/Renderer presentation DTO (types only)

The Electron desktop app runs the native parser and the full deterministic pipeline in a Utility Process and sends a serializable report DTO to the sandboxed renderer over contextBridge IPC. The renderer never imports `dem-parser`, Node builtins or Analytics, and never recomputes metrics. Process model, IPC contract and UI: [desktop report](./desktop-report.md).

The Windows window shell is frameless (`frame: false`), with a persistent 40px Fluent UI title bar outside the report error boundary. Only the report content scrolls. Renderer window controls cross the named preload/contextBridge API; Main validates the current webContents and main frame for every invoke, shares the same gate with report import, and broadcasts native maximize/unmaximize state. Caption close calls BrowserWindow.close(), retaining worker cleanup in closed. There is no native titleBarOverlay, menu, renderer Electron access, or change to report data DTOs.

`report-contract` also carries a read-only per-player Round Timeline projection of existing `Match` facts (round side / result / cumulative score plus filtered kill / death / clutch / bomb events with round-relative seconds). It is built in the Desktop presenter from frozen data, never in the renderer, and adds no new Analytics semantics.

`report-contract.analysis` adds presentation-only player comparisons, per-player round trends and CT/T splits. The Desktop presenter copies frozen `PlayerMetrics` and counts existing Timeline kill/death facts; no raw MatchEvent reaches the renderer and no new Analytics algorithm is introduced. Missing round windows are marked incomplete rather than shown as confirmed zero facts.

**Supported platform: Windows x64 only.** Packaging targets the NSIS x64 installer and stages the `win32-x64-msvc` native binding; there is no cross-platform packaging path.

For Windows distribution the Main and Utility Process bundles inline every workspace package, and the native parser is staged next to the worker bundle as an asar-unpacked binding, so an installed application resolves nothing through pnpm workspace links. Packaging layout, staging script and installed-app verification: [Windows packaging](./windows-packaging.md).

The DEM implementation routes native demoparser2 results through an internal adapter and converter before returning `Match`. Native APIs are not exported by the package. The Electron main build keeps the native parser external and bundles the workspace packages. See [DEM parsing](./dem-parser.md) for the current mappings and limitations.

P5.7.1 adds explicit `Demoparser2Provider.parseWithSpatial()` returning Match plus a separate `MatchSpatialEvidence` domain contract from match-model. Its internal adapter reads the DEM once and shares bytes between the existing parser and one sparse spatial query. Core event/boundary ticks survive any budget; optional combat context alone can be trimmed. Event references, exact requested/actual ticks, relations and field coverage preserve missing evidence. Native types/Buffer remain internal; Analytics does not call demoparser2 and the existing desktop/Renderer path still uses `parse()`. Contract and evidence: [Spatial foundation](./spatial-evidence.md).

P5.7.2 adds `deep-review`, depending only on match-model in production: `dem-parser → match-model → { analytics, deep-review }`. `analyzeEngagements(Match, optional MatchSpatialEvidence, options)` groups explicit hostile damage/kill contacts within formal round windows through shared-participant/time-gap connected components. The default 3-second gap is a product heuristic; no reliable tickRate means contacts remain but time grouping is unavailable. Spatial joins use exact round/type/tick/eventIndex with separate enrichment coverage. Utility and weapon_fire do not create anchors; unknown contact weapons are retained. No cycles, changes to frozen P3/Findings V1, desktop integration, AI or coaching conclusions. Future Findings V2 can consume both independent outputs. Definition, contracts, Nuke invariants and sensitivity: [Engagement analysis](./engagement-analysis.md).

P5.7.3 adds independent `resolveRoundAliveState(Round)` and `analyzeKillImpact(Match, optional EngagementAnalysis)` in deep-review. Freeze-end/start fallback roster evidence and formal victim deaths drive atomic same-tick groups; invalid roster/lifecycle/death/end evidence suppresses counts. Enemy attribution and four-key Engagement linkage have separate coverage. Round multi-kills retain state transitions and final round result without scores, causality or coaching. Spatial evidence is not required. P3 Opening/Clutch/multiKills, Findings V1 and Renderer remain frozen. Contracts, tests and Nuke samples: [Kill impact analysis](./kill-impact-analysis.md).

v0.1 Final Acceptance is **PAUSED — Deep Review product gap discovered**; current work is **P5.7 Deep Review / P5.7.3 Kill / Multi-kill Impact** (implemented, Nuke structural verification complete; product acceptance pending). P5.7.0 is **PARTIAL PASS — GOTV verified, personal DEM compatibility pending**. P5.7.1 and P5.7.2 are **PASS**; personal DEM compatibility remains **UNVERIFIED**, required before Deep Review FINAL Acceptance. Repository: `Evanpatchouli/cs2-analyst`.

`analytics` implements the P3 deterministic player and combat metrics and depends only on `match-model` domain types. Round windowing and roster coverage are centralized in `packages/analytics/src/coverage.ts` so individual metrics do not re-implement eligibility; the shared survival/trade timeline for KAST, Trade and Clutch lives in `packages/analytics/src/timeline.ts`. Definitions and limits: [analytics metrics](./analytics-metrics.md).

## Principles

DEM parsing, analysis logic and UI presentation must remain independent.

AI coaching is an optional interpretation layer built on top of structured findings.

## Future boundary (not implemented)

Auto DEM discovery / directory scanning is **not planned**: the user always selects the DEM explicitly, and no code scans Steam / CS2 directories. A future `apps/api` may add account / session and match-history summary storage, but DEM parsing, Analytics and Findings stay local to Desktop — the service never receives DEM files and never analyzes them.

`findings` consumes only frozen `MatchAnalytics` via the Analytics public package. `generateFindings` runs pure deterministic rules and returns ranked evidence with per-player caps (3 issues, 2 highlights). It does not parse DEMs or recompute Analytics; parser is a devDependency only for real-demo golden tests. Policy and gaps: [Findings Engine](./findings-engine.md).

## Desktop branding (P5.6.5)

CS2 Analyst uses a 20px transparent PNG mark plus its product name in the 40px titlebar. The text lockup is retained as a canonical resource. Windows EXE/NSIS/uninstaller icons use a seven-resolution ICO (16/24/32/48/64/128/256). BrowserWindow uses the mark from extraResources in installed apps and a bundle-relative path in dev/preview; Renderer imports the PNG through Vite. No shell resource depends on the source machine's Downloads directory.

Workspace packages, the preload bridge and environment variables are now @cs2-analyst/*, window.cs2Analyst and CS2_ANALYST_*. This is an identifier migration with no domain algorithm changes. Production App ID is com.evanpatchouli.cs2analyst; test seam appends .testseam. Full installed and native visual acceptance remains incomplete; see the P5.6.5 validation record in windows-packaging.md.
