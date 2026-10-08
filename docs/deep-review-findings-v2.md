# P5.7.7 Findings V2

2026-10-09. Baseline `065f0f316f9b2366864b0b5a66be796bbad659fa`; fixture migration commit `c8b0100` precedes this work. Status: **implementation complete / product acceptance pending**. P5.7.0 **PARTIAL PASS**, P5.7.1–P5.7.6 **PASS**; P5.7.8 is next, Final Acceptance **PAUSED**.

## Boundary and API

```ts
analyzeDeepReviewFindings(match: Match, playerId: string,
  inputs: DeepReviewFindingsInputs): DeepReviewFindingsAnalysis
```

Inputs contain `engagements`, `impact`, `teamplay`, `utility`, `execution`: the existing EngagementAnalysis, KillImpactAnalysis, TeamplayAnalysis, UtilityContextAnalysis and CombatExecutionAnalysis. Production code lives only in `packages/deep-review`, whose dependency remains match-model. No parser/native calls or upstream analyzer calls occur in Findings V2. Source validation checks supplied refs, identity sets, published projections and absence constraints; it never produces replacement Evidence or regroups contacts.

P4 `packages/findings` Findings V1 contracts, ruleIds, thresholds, ranking and behavior remain frozen. P3, parser API, match-model, report-contract, Timeline, Renderer, Electron and Desktop UI are unchanged. This phase provides evidence-backed review candidates answering “what is worth revisiting”; it does not assign tactical intent or a top-level diagnosis.

## JSON contracts and exact references

`DeepReviewFinding`: stable `id`, `ruleId`, string `playerId`, category impact/execution/teamplay/utility, kind highlight/review/context, title/summary, occurrences, eligibleOccurrences (number or null), sorted relatedRounds, evidenceRefs, scalar facts, evidenceQuality complete/partial, caveats. No score, rating, confidence percent or probability fields.

`DeepReviewFindingsAnalysis`: matchId/playerId, reviews/highlights/contexts, consideredRules, suppressedRules, rule diagnostics (eligible/occurrence/triggered/emitted), input issues, contradiction diagnostics, coverage and excluded occurrences. Suppression reasons: insufficient-denominator, insufficient-occurrences, rate-below-threshold, coverage-insufficient, deduplicated, contradiction, not-applicable, max-count-reached. `triggered` records the candidate before dedup/caps; `emitted` records final output.

Evidence ref union:

| kind | Identity |
| --- | --- |
| engagement | engagementId |
| kill | exact eventRef |
| multi-kill | playerId + round |
| teammate-death-response | playerId + teammateId + deathRef |
| player-death-response | playerId + deathRef |
| utility-effect | effectRef (round/type/tick/eventIndex + utility/action) |
| execution-engagement | playerId + engagementId |
| opponent-exchange | playerId + opponentId + engagementId |

Pattern refs include every accepted denominator row, enabling exact recomputation of N and M from supplied analysis. Impact refs identify the chosen sequence and its confirmed kills. Flash refs identify the affected exact effects. Refs carry no complete Evidence, Match, Round, raw MatchEvent or SpatialEvidence object. IDs are URI-escaped matchId/playerId + ruleId; changing the selected example does not change the player's rule identity. Outputs use plain JSON data, finite numbers and string SteamIDs; no Map/Set/Date/BigInt/class instances. Inputs remain immutable.

## Rule catalog and thresholds

All policy values and priority live in `src/findings-policy.ts`. They are **product heuristics**, not CS2 official rules, professional standards or statistical significance.

| ruleId (prefix `deep.`) | kind | Required observation / trigger |
| --- | --- | --- |
| impact.multikill-swing | highlight | >=2 kills; contains equalizer, advantage gain, deficit reduction or enemy elimination |
| impact.sole-survivor-sequence | highlight | >=2 kills; contains confirmed sole-survivor kill; never automatically called clutch |
| impact.multikill-unconverted | context | >=3 kills and observed roundResult=loss |
| execution.no-confirmed-return-pattern | review | received-first directional exchanges; >=5 eligible, >=3 none-observed, rate>=0.5 |
| execution.return-contact-consistent | highlight | same denominator; >=5 eligible, >=4 kill/damage returns, rate>=0.6 |
| teamplay.lone-contact-death-pattern | review | >=5 eligible deaths, >=3 only-confirmed-side-participant + team none-observed, rate>=0.5 |
| teamplay.no-followup-pattern | review | >=5 eligible alive-player/alive-killer teammate deaths, >=3 none-observed, rate>=0.5 |
| utility.teamflash-repeated | review | >=3 distinct exact flash effects affecting teammates, >=5 teammate effect rows |

Optional enemy-flash positive context is not implemented: direct effect counts add insufficient distinct information here. Low HE damage, fire attribution unavailable and smoke without direct damage never trigger Findings. No weapon-fire count, miss, accuracy, spray or delay rule exists.

## Evidence and stale-input gates

- Match identity and plain JSON values are validated. matchId mismatches suppress dependent rules. Unknown/non-member player produces no findings and unavailable coverage.
- Engagement refs must match original event index/type/tick, actor/victim, event sides, weapon classification, fatal flag and reported damage. IDs/refs/membership are unique; actual contact min/max ticks and participant sets agree. Eligible source contact identities cannot disappear. Published grouping tick configuration and duration must agree with current Match.tickRate.
- KillImpact source kill/unattributed partition, round identities and multi-kill keys must cover the current source ledger. Multi-kill rows must agree with published kills, counts, tags, side and winner/result. Baseline/roster/death refs and current end snapshot/lifecycle constrain published alive projections. Atomic ordered/deathCount/credited count must agree with the exact group; same-tick group impact cannot become individual ordered impact. Required multi-kill coverage cannot override incomplete child coverage.
- Execution required layers: engagementLinkage, contactEvidence, returnContact **complete with no reasons**. Pair refs exactly match the firearm contacts of the existing Engagement. First-role flags, incoming/outgoing origin, raw full-round death boundary and accepted return outcome/refs must agree. Current unknown IDs/sides/weapons/illegal ticks cannot be hidden by stale complete flags. Same-tick and unavailable outcomes are excluded.
- Lone-death required layers: engagementParticipation, aliveState, followUpTiming, on both death context and team response. onlyConfirmedSideParticipant is verified against actual direct-contact participants. Complete eligibility covers kill/damage/none-observed team responses, not unavailable/same-tick rows. No ambiguous alive teammate may support negative absence.
- No-followup requires aliveState and followUpTiming complete, playerAliveAtDeath=true, killerState=alive-after-death, outcome kill/damage/none-observed. Its participation/geometry is not required. Exact origin and full response-key sets are checked, so deletion of successful rows cannot manufacture a smaller denominator. The actual Teamplay window is used (default 5s), with current reliable tickRate.
- Flash requires complete actorAttribution/directOutcome, linkage exact, unique same-round grenade identity, exact raw actor/victim/effect refs and complete linked victim set. Distinct teammate rows cannot be claimed twice. Ambiguous effects do not count.

Required partial/unavailable layers are excluded conservatively. Missing geometry or firearm-fire context is irrelevant to direct-contact pattern rules; these layers may be partial/unavailable, but every accepted finding receives an explicit caveat and evidenceQuality=partial. `complete` refers to required observed evidence, not proof of an absolutely complete native feed or tactical visibility. An unavailable required occurrence never becomes zero.

### Execution denominator limitation

The requested rule explicitly requires `firstContactRole=received-first`. Frozen P5.7.6 returns `unknown` for received-only exchanges; these can nevertheless have complete none-observed return evidence. V2 does **not** reclassify those rows. Consequently the negative rule has a conservative semantic coverage gap; all four professional maps have zero negative triggers and the 10 players with >=5 accepted exchanges all satisfy the positive heuristic. This does not validate the negative rule's sensitivity.

Synthetic Scenario B uses an explicit posthumous-boundary case: incoming contact, own later death, still later outgoing raw contact. Upstream role is received-first, but that outgoing contact is outside the alive return window. This verifies the frozen rule contract, not prevalence in human gameplay. Addressing received-only unknown eligibility requires a separately approved contract/product decision; no threshold tuning can fix it.

## Ranking, dedup and contradictions

Caps: **3 reviews / 2 highlights / 1 context**; each player/rule has at most one finding. No per-round card flood.

Review priority: execution no-return, lone-contact death, no-followup, repeated teamflash. Highlight priority: sole-survivor sequence, multikill swing, consistent return. Context priority: unconverted multikill. Same priority: occurrences descending, eligible descending (null=0), earliest related round ascending, ruleId lexicographic ascending.

Impact example selection uses an explicit tuple: killCount descending, number of confirmed swing tag types descending, round win before other results, round ascending, firstKillTick ascending. It is not an impact score. Sole-survivor and swing from the same selected sequence merge into the richer sole-survivor finding. A lost sequence already highlighted carries factual loss/unconverted context on that card; the separate context rule is suppressed as deduplicated. Distinct sequences can remain separate up to caps.

Teamplay merge requires at least **50% of no-followup occurrences** to share an exact Engagement scene or overlap the lone-death observation window against the **same killer in the same round**. For the latter, own death is strictly later and within the configured Teamplay window. Merely sharing a round is insufficient. Lone-death is retained; no-followup N/M, overlappingSceneOccurrences and exact refs are added to facts/evidence, with both caveats. Synthetic tests verify real pipeline merge and different-killer nonmerge.

Opposing execution patterns on the same denominator suppress both and record contradiction diagnostics. Defaults cannot meet both rate thresholds simultaneously; an internal test exercises the guard using deliberately overlapping developer thresholds. There is only one flash rule, so there is no opposing flash conclusion. Caps and dedup retain their suppression reason; diagnostics distinguish triggered from emitted.

## Wording and empty results

Findings describe confirmed contacts, counts, observed windows, alive-number transitions and round result. Required caveats explicitly state: execution evidence is not reaction time/aim rating; lone contact is not spatial isolation or wrong positioning; no-followup is not P3 Trade and does not prove a trade opportunity; rawBlindDuration is not continuous blindness. Winning after a kill does not prove the kill caused victory. No tactical intent, LOS/nav/map geometry, supportability from distance, top-level problem diagnosis or numerical gameplay skill ratings are inferred.

`reviews=[]`, `highlights=[]`, `contexts=[]` is valid. Thresholds are never lowered to fill a UI. All 40 professional players happened to emit at least one finding; zero-finding Nuke sample is null rather than fabricated. Synthetic empty/insufficient-evidence cases are tested.

## Four-map validation and observations

[Fixture matrix](./demo-fixtures.md), [cross-map report](./deep-review-findings-cross-map.json), [Nuke detailed report](./deep-review-findings-nuke.json).

Each fixture is explicitly selected and parsed once with parseWithSpatial, followed by Engagement → KillImpact → Teamplay → UtilityContext → CombatExecution → Findings V2. All identifiable players use the same production entry and default policy. Repeated determinism and sensitivity runs reuse analysis in memory, with no native reparsing. Tests verify exact refs, occurrence/denominator counts, caps, JSON safety, immutability and absence of contradictory output. Counts below are development diagnostics, never golden player/finding counts.

| Map | rounds / players | swing triggered / emitted | sole triggered | execution positive triggered / emitted | lone review | no-followup review | teamflash review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Nuke | 21 / 10 | 10 / 7 | 4 | 2 / 1 | 6 | 10 | 3 |
| Inferno | 24 / 10 | 9 / 9 | 3 | 4 / 1 | 6 | 10 | 0 |
| Dust2 | 24 / 10 | 10 / 6 | 7 | 2 / 2 | 2 | 10 | 10 |
| Mirage | 17 / 10 | 9 / 8 | 4 | 2 / 2 | 7 | 10 | 0 |

Execution negative: 0/10 evaluable players; all maps zero. Unconverted context triggers Nuke 1 and Mirage 1, both merge into highlights. No contradictions; all emitted refs exact; no hardcoded names, player IDs, scores, winners or sample round numbers.

Nuke auto-selection includes swing, sole-survivor, lost3K merged context, positive execution, lone death, no-followup and teamflash. Negative execution and zero-finding player are null because absent. Each present sample retains finding/facts/refs/source summaries/coverage/caveats/suppression.

Mirage first identity: filename `mirage.dem`, SHA-256 `62cb3af35c3893a91c7dd8c9007fdb1105950ec8963a46eca6006dac96655acb`, header/domain map `de_mirage`, **296074918 bytes**, 64 tick/s, 17 rounds, 10 players. The fixture test locks filename/SHA/map only; round/player counts are observations.

### Overbreadth inspection

Aggregate review diagnostic: lone death **21/40=52.5%**, no-followup **40/40=100%**: **overbreadth-review-required**. Teamflash 13/39=33.3% overall; Dust2 alone 10/10 is additionally flagged. No automatic failure or threshold change.

Source inspection reads actual occurrence examples and denominator rows (stored in report.manualEvidenceInspection). Nuke lone sample includes an only-confirmed-contact death with zero confirmed alive teammates: it is a valid literal observation, but carries little coaching implication about team support. No-followup examples have complete alive/timing with player and killer alive; some have unavailable participation or partial spatial context, explicitly caveated as irrelevant to the contact observation. Dust2 flash examples are exact entity-linked teammate effects, including short raw durations and mixed enemy/team effects from one flash. They demonstrate effects, not bad flash quality.

The high no-followup rate reflects how broad “surviving teammate did not contact this killer within 5 seconds” is. These observations do not establish that support was feasible. Professional triggering is neither proof of a bad rule nor proof of player weakness. **Product acceptance remains pending** to judge review usefulness; there is no claim these descriptive patterns establish causal coaching problems. No thresholds were tuned to suppress professional triggers.

### Threshold sensitivity

Internal developer evaluator only; no public threshold option/UI. Nine combinations: minimumEligible=4/5/6, minimumOccurrences fixed=3, minimumRate=0.4/0.5/0.6. Positive and flash thresholds stay fixed.

| minimumRate | lone Nuke / Inferno / Dust2 / Mirage | no-followup, each map | execution negative, each map |
| --- | --- | --- | --- |
| 0.4 | 8 / 7 / 7 / 8 | 10 | 0 |
| 0.5 | 6 / 6 / 2 / 7 | 10 | 0 |
| 0.6 | 3 / 4 / 1 / 3 | 10 | 0 |

These counts are identical across minimumEligible=4/5/6 for these samples. They expose sensitivity and no-followup breadth, not calibration evidence. Default remains 5 / 3 / 0.5.

## Performance and acceptance debt

All timing is development measurement, no hard SLA. Findings-only measures all 10 players, including source validation; full pipeline includes those Findings calls. SHA/hash/immutability checks and sensitivity runs occur outside the measured production pipeline.

Final timings are stored in cross-map JSON. The report-generation run recorded parseWithSpatial Nuke **2.656s**, Inferno **4.393s**, Dust2 **3.787s**, Mirage **2.622s**; full pipeline **0.722/0.853/0.901/0.634s**; Findings-only **0.597/0.644/0.693/0.511s** for all ten players. Full pipeline is the sum of analyzer time and Findings time, excluding inter-stage test hashes. Earlier runs in this session recorded Nuke 2.615–3.086s, versus P5.7.6's earlier 8.063s and P5.7.1's ~3.2s shared path. Variance is visible; elevated Nuke parsing was not stable in these runs. No parser optimization performed. Persistently elevated parsing should receive a separate investigation before Final Acceptance. Hardware/runtime and simultaneous regression work affect elapsed time; peak memory UNKNOWN.

Professional four-map success establishes current professional GOTV compatibility only. **Personal matchmaking / Perfect World DEM compatibility = UNVERIFIED**. At least one identified real personal DEM remains required before Final Acceptance; the presence of demo1/demo2/demo3 alone does not establish recording mode or personal provenance. No DEM was downloaded, copied, moved, substituted or staged.

Train **REMOVED / NOT REQUIRED**: old professional sample/version incompatibility and unavailable high-quality current competitive replacement do not justify historical compatibility noise. It is retained locally, never run, and is neither P5.7 nor Final Acceptance gate/debt/blocker. Ancient/Anubis/Overpass remain optional, not run for this phase.

## Validation and independent review

Synthetic product scenarios A/B/C/D pass. Tests cover swing/sole/loss/dedup, exact threshold boundaries, positive and contradiction, same-tick/unavailable exclusion, lone/no-followup merge, repeated exact/ambiguous flash, low HE/fire unavailable/smoke non-trigger, irrelevant partial acceptance and relevant partial rejection, no findings, caps/ranking/IDs/JSON/ref traceability/immutability.

Independent review found source-validation gaps: deletion of positive denominator rows; fabricated self-consistent counts; stale tickRate; forged same-tick ordered/coverage flags; ambiguous teammate alive absence; appended unknown-side contacts; end/lifecycle/baseline changes retaining stale complete coverage. All were corrected in the source gates and covered by regressions; final independent review has no unresolved actionable findings. Reviewer independently ran all **27 Findings synthetic tests PASS**. B43 prohibited inference checks passed. The literal execution-role limitation and overbreadth are product limitations retained explicitly.

Full validation: `pnpm typecheck` **12/12**, `pnpm build` **7/7**, match-model contract tests PASS; dem-parser **39**, analytics **53**, Findings V1 **17**, deep-review **199**, desktop **17** tests PASS, **0 FAIL / 0 SKIP**. Final source-gate changes preserve all four Findings deterministic hashes; final timed four-map test additionally passes 5/5. Historical demo1 is now present and its existing goldens run; prior “missing demo1 SKIP” records describe prior sessions. Installer/Renderer E2E are outside this phase because no UI changed.

To regenerate reports after building, run from repository root in PowerShell:

```powershell
$env:FINDINGS_CROSS_MAP_REPORT_FILE = Join-Path (Get-Location) 'docs/deep-review-findings-cross-map.json'
$env:FINDINGS_NUKE_REPORT_FILE = Join-Path (Get-Location) 'docs/deep-review-findings-nuke.json'
node --test packages/deep-review/tests/findings-cross-map.test.mjs
```

The outputs are developer diagnostics, not production goldens. Tests lock exact file identity and structural validity, never these observed professional finding counts.
