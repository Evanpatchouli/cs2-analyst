# P5.7.8 Deep Review Desktop UX

Status (2026-10-09): **implementation complete / copy revised / visual product acceptance pending**.
Baseline for this copy revision: `ccb6402e9b264bab3cab0b538d35e8b028c1fd04`
(P5.7.8 implementation was `a11f6af`). P5.7.8.1 plain-language copy polish changes presentation copy only;
no P5.7.1–7 judgement, threshold, ranking or evidence semantics changed.
P5.7.0 PARTIAL PASS; P5.7.1–7 PASS. v0.1 Final Acceptance **PAUSED**.
Personal matchmaking / Perfect World DEM compatibility **UNVERIFIED**.
Train **REMOVED / NOT REQUIRED**.

## Desktop pipeline

The Main-selected file is passed to the existing Utility Process. `analyzeDemoFile()` invokes
`Demoparser2Provider.parseWithSpatial()` once: one input read shared by the existing native
queries and the sparse spatial query. There is no second `parse()` or per-player parser call.
The actual result is `{ match, spatial, performance }`; no native bytes or spatial domain object
crosses IPC.

```text
parseWithSpatial → Match + Spatial Evidence
├── analyzeMatch → P3 metrics + Findings V1 + Timeline + Analysis Views
└── analyzeEngagements
    → analyzeKillImpact
    → analyzeTeamplay
    → analyzeUtilityContext
    → analyzeCombatExecution
    → analyzeDeepReviewFindings for every valid player
    → Desktop DTO
```

All five evidence analyses run once per import and their results are shared by all players.
No P5.7.1–7 algorithms, policies, thresholds or rule definitions changed.
P3 numeric semantics, V1 ranking/contracts and the existing Utility panel remain frozen.
V1's heading becomes “基础规则提示”, with a link in the copy to 深度复盘.

## Contract and boundaries

`DesktopMatchReport.schemaVersion` is **2**. `deepReview` contains `available` and one
`DesktopDeepReviewPlayer` for every report player, with reviews/highlights/contexts and
complete/partial/unavailable coverage. Availability means some player has usable coverage;
it does not require a finding to trigger. Empty findings are legitimate.

`DesktopDeepReviewFinding` is owned by report-contract and whitelists id/ruleId/category/kind,
plain-language title/summary, occurrences/eligibleOccurrences, occurrence-only relatedRounds,
an optional occurrenceLabel and user-facing caveats. The optional technical refs/facts and the
internal evidenceQuality field are intentionally omitted from the production DTO. Diagnostics,
suppressed rules, denominator strings, SteamID evidence refs, ticks/eventIndex/engagementId,
Match, SpatialEvidence, Maps and class instances are absent. The Renderer imports only
report-contract types; it never imports deep-review or derives evidence.

Unavailable evidence is expressed through analyzer coverage, retaining the basic report.
Invariant/programming errors still enter the existing import error handler; no catch fabricates
“evidence insufficient”. No new IPC privilege or test seam is shipped.

## Experience

Four panels remain mounted in order: 深度复盘 (default), 比赛报告, 回合时间线, 分析.
A newly imported match resets the Report component by match identity. Quiet Studio keeps
maxWidth 1120, the current dark blue-grey tokens, Fluent UI v9, flat card surfaces and single-column
reading order. No chat, scores, radar/HUD, AI coach or new analysis is introduced.

- 优先复盘: “复盘重点” uses Fluent warning/amber; no red or severity ranking.
- 亮点: Fluent success; no carry/MVP/impact score.
- 补充观察: Fluent informative (neutral foreground/background/stroke), including lone contact,
  same-fight no-follow and teamflash. No warning/problem label or inferred advice. The former
  “上下文” heading was renamed because these findings are observations, not problem verdicts.
- `apps/desktop/electron/deep-review-copy.ts` converts ruleId + facts + occurrence counts into
  user-visible title/summary/occurrenceLabel/caveats inside the Electron presenter, so the
  Renderer renders finished copy and never assembles domain sentences.
- No evidence-quality badge is shown. A finding with caveats exposes only a neutral
  “说明与限制” entry, so “部分证据” can never contradict a body that says all required evidence
  was present.
- Occurrence counts read “符合此情况：M / N 次” without a Renderer-computed rate.
- “说明与限制” is a native keyboard-accessible details/summary, closed by default.
- Empty sections have quiet copy; all-empty displays the legal no-conclusion state. No fallback finding.

Finding buttons pass occurrence-only relatedRounds to existing `showRounds()`: switch to Timeline,
expand all known occurrence rounds, scroll the first after the DOM commit and highlight it for 2.4s.
Timeline filtering is unchanged: kill/death/clutch-start/bomb lifecycle only.
Switching players selects precomputed V2/P3/V1/Timeline/Analysis DTOs without importing or recomputing.
Nonblank nicknames are preserved exactly, even numeric/SteamID-like/long/equal to ID; only blank
or null names fall back to 未知玩家. Evidence IDs never become visible player labels.
Loading analysis copy is “正在生成指标与深度复盘…”, without invented progress percentages.

## Product Copy Principles

These rules are the long-term UI copy standard for CS2 Analyst, not a one-off edit.

- **信 — never go beyond the evidence.** Copy states only what the DEM records: “没有记录到后续伤害或
  击杀”, never 反应慢 / 枪法差; “只有你留下了交火记录”, never 站位孤立 / 太莽; “没有记录到队友跟进”,
  never 补枪失败; “闪光弹影响了队友”, never 闪光扔得差.
- **达 — understandable on the first read.** A normal CS2 player needs no technical document and no
  knowledge of the internal data model.
- **雅 — natural, concise, professional Chinese.** It should read like a post-match review tool, not a
  database report, machine translation, thesis or development log.

User-visible copy must never leak domain implementation vocabulary or reason codes. Forbidden in the
Desktop UI: Engagement, direct contact, evidence, fireEvidence, received-first, return contact,
partial, same-tick-fire-contact-ambiguous, eventIndex, coverage, linkage, denominator and every
other internal reason code. They may exist only in domain packages, tests, developer diagnostics and
engineering doc sections.

Common CS terms stay in English where players already know them — ADR, KAST, Trade, Opening, Clutch,
2K / 3K / 4K / 5K — and their existing Chinese explanations are kept. Do not force “纯中文” at the
cost of readability.

Translation happens in `apps/desktop/electron/deep-review-copy.ts` (ruleId + facts + occurrence
counts → title / summary / occurrenceLabel / caveats). The domain contract keeps raw ruleId / facts /
refs / coverage. The Renderer consumes only the adapted `DesktopDeepReviewFinding` fields and never
renders domain title / summary / raw caveats. Adding a language or rewording a sentence must not
require touching an analysis rule.

Coverage caveats are rewritten as complete sentences, never by regex-deleting identifiers. For
example: “部分开枪与伤害事件发生在同一游戏刻，无法判断严格先后；这不会影响本条结论所依据的伤害
与击杀记录。” Every emitted finding keeps a plain-language `说明与限制` note.

## Validation

- `pnpm typecheck`: PASS, 13 tasks; `pnpm build`: PASS, 7 tasks.
- match-model contract test PASS; parser 39/39, analytics 53/53, V1 findings 17/17,
  deep-review 210/210, desktop 22/22; zero failures/skips.
- demo1 historical goldens: K/D/A 25/20/4, ADR 91.375, KAST 75%, Trade 4/18,
  Opening, Utility, Clutch, Timeline, Analysis and V1 rule order unchanged.
  Instrumentation rejects `parse()` and counts exactly one parseWithSpatial call per import.
- Nuke actual `analyzeDemoFile()` twice: available, 10 player entries, at least one finding,
  legal relatedRounds, strict JSON-only DTO and identical deterministic reports, P3/V1 retained.
  No player finding counts are locked as a new golden.
- SSR Renderer checks (including desktop): three distinct Fluent semantics, adapted copy,
  collapsed 说明与限制, no evidence-quality badge, technical-ref decoys not visible,
  empty/unavailable states.
- P5.7.8.1 copy audit: `deep-review-copy.test.mjs` covers all eight rules and partial-coverage caveat
  translation; desktop tests (27/27) and the demo1/Nuke DTO tests assert that no
  title/summary/occurrenceLabel/caveat contains Engagement, direct contact, evidence, partial,
  coverage, linkage, received, return contact, same-tick, eventIndex, fireEvidence or denominator.
  Electron report smoke also scans the real and synthetic Deep Review panels for the same forbidden
  vocabulary and for the retired “部分证据 / 证据边界 / 上下文 / 可判定场景” wording.
- deep-review package regression 210/210 PASS; no P5.7.1–7 rule, threshold, ranking or evidence
  semantics changed.
- Store regression selects every player using the same report object without an import.
- Electron CDP report smoke: real DEM, broken DEM and non-DEM rejection PASS; four mounted tabs,
  default Deep Review, switching players, existing V1 → Timeline and V2 → Timeline PASS.
  Synthetic scenarios A–D run in the QA process through existing React report props, with data
  restored afterward. They add no production bridge or fixture injection capability.
  Scroll instrumentation confirms Timeline visible and all [R7,R24] occurrences expanded before
  scrollIntoView(R7); first occurrence gets transient highlight. 900/800/650 widths have no page
  or Deep Review horizontal overflow.
- Electron dev/preview launch, preload, assets and clean close: PASS.
- `pack:win` / `pack:win:test` / `test:installed`: PASS. Both installers ~109.9 MiB;
  installed ASAR 3.43 MiB / 82 entries, native binding unpacked, all workspace dependencies
  (including deep-review) bundled. Production seam absence/path-injection protection PASS.
  Installed test-seam real demo1, Deep Review synthetic A–D, four tabs, player switch, V1/V2
  Timeline linkage, asset decoding, broken DEM, mid-analysis close/no residual worker and both
  uninstall paths PASS. Windows branding/shortcuts/registration checks also passed.
- Independent reviewer: PASS, no actionable findings; independent SSR6/6 and diff whitespace checks PASS.

Full seven-map recalibration is unnecessary: algorithm packages were not changed.

## Observational performance

Timing callbacks are developer-only, outside the deterministic report and product UI.
The non-Deep report phase includes existing P3/V1 work and DTO/Timeline/Analysis projection;
Deep Review time includes shared analyzers, per-player Findings V2 and their field projection.
No hard SLA or parser optimization is introduced.

| Fixture | parseWithSpatial | Deep Review | Non-Deep report phase | Total |
|---|---:|---:|---:|---:|
| demo1 | 3016.54 ms | 1102.81 ms | 55.82 ms | 4175.17 ms |
| Nuke | 2917.39 ms | 730.84 ms | 15.60 ms | 3663.83 ms |

First separate Desktop run observed totals 4153.04 ms / 4570.05 ms respectively;
these measurements are observations, not guarantees. Peak memory **UNKNOWN**.

## Screenshots and remaining acceptance

Actual Electron captures under local ignored `.tmp/p578-qa/`:

- `deep-review-real-default.png`: demo1/twinkle, review + highlight + context, 1280×1400
  tall viewport to include the full reading sequence.
- `deep-review-real-caveat.png`: real Execution Review card with 说明与限制 expanded.
- `deep-review-real-highlight.png`: real highlight card focused at 1280×820.
- `deep-review-real-context.png`: real 补充观察 card focused at 1280×820.
- `deep-review-real-timeline.png`: real finding occurrence rounds expanded, first highlighted.
- `deep-review-real-900.png`, `deep-review-real-800.png`, `deep-review-real-650.png`: narrow viewports.
- `deep-review-synthetic-three-kinds.png`, `deep-review-synthetic-partial-caveat.png`,
  `deep-review-synthetic-timeline-occurrences.png`: explicitly synthetic QA scenarios.

Screenshots were inspected for readable copy, restrained distinct badges, matching flat surfaces,
no clipping in the full-page capture and no unwanted raw evidence labels. Product Owner visual
acceptance is **pending**; automated checks and agent inspection do not grant Product FINAL PASS.
Personal DEM provenance remains unconfirmed: demo1 historical golden and professional GOTV/Nuke
cannot prove Personal matchmaking / Perfect World compatibility. Native feed absolute completeness,
entity freshness, other recording modes and peak memory remain UNKNOWN. No algorithm blocker found.
