import type { Match, MatchSpatialEvidence } from "@cs2-analyst/match-model";
import { analyzeEngagements } from "../src/index.js";
import type { EngagementAnalysis, EngagementContact, EngagementOptions } from "../src/index.js";
declare const match: Match;
declare const spatial: MatchSpatialEvidence;
const options: EngagementOptions = { contactGapSeconds: 3 };
const result: EngagementAnalysis = analyzeEngagements(match, spatial, options);
const contact: EngagementContact = result.directContacts[0];
const id: string = contact.attackerId;
const ordinal: number = contact.eventRef.eventIndex;
// @ts-expect-error A SteamID stays a string.
const numericId: number = contact.attackerId;
// @ts-expect-error No gameplay quality score in the foundation.
result.engagements[0].aimScore;
// @ts-expect-error Raw MatchEvent is not part of the evidence contract.
contact.event;
void [id, ordinal, numericId];
import { analyzeDeepReviewFindings } from "../src/index.js";
import type { DeepReviewFinding, DeepReviewFindingsAnalysis, DeepReviewFindingsInputs, DeepReviewEvidenceRef } from "../src/index.js";
declare const findingInputs: DeepReviewFindingsInputs;
const deepFindings: DeepReviewFindingsAnalysis = analyzeDeepReviewFindings(match, id, findingInputs);
const finding: DeepReviewFinding = deepFindings.reviews[0];
const findingRef: DeepReviewEvidenceRef = { kind: "opponent-exchange", playerId: id, opponentId: "2", engagementId: "engagement" };
// @ts-expect-error No numerical skill rating is part of Findings V2.
finding.score;
// @ts-expect-error Raw Match objects cannot be evidence references.
const rawFindingRef: DeepReviewEvidenceRef = match;
// @ts-expect-error SteamID is never numeric.
analyzeDeepReviewFindings(match, 1, findingInputs);
// @ts-expect-error Production thresholds are fixed; there is no sensitivity option.
analyzeDeepReviewFindings(match, id, findingInputs, { minimumEligible: 4 });
void [findingRef, rawFindingRef];
import { analyzeKillImpact, resolveRoundAliveState } from "../src/index.js";
import type { KillImpactAnalysis, PlayerRoundMultiKillImpact } from "../src/index.js";
const impact: KillImpactAnalysis = analyzeKillImpact(match, result);
const multi: PlayerRoundMultiKillImpact = impact.multiKills[0];
const playerId: string = multi.playerId;
// @ts-expect-error Evidence has no impact score.
impact.kills[0].impactScore;
// @ts-expect-error No raw event/native reference.
impact.kills[0].event;
void [playerId, resolveRoundAliveState(match.rounds[0])];
import { analyzeTeamplay } from "../src/index.js";
import type { TeamplayAnalysis, TeamplayOptions } from "../src/index.js";
const teamplayOptions: TeamplayOptions = { followUpWindowSeconds: 5 };
const teamplay: TeamplayAnalysis = analyzeTeamplay(match, result, impact, spatial, teamplayOptions);
const firstRole: "unique-first" | "shared-first" | "later" | "unknown" = teamplay.playerEngagementContexts[0].firstSideContactRole;
// @ts-expect-error No teamplay score.
teamplay.teamplayScore;
// @ts-expect-error No distance-based support inference.
teamplay.playerEngagementContexts[0].spatialContext.nearestConfirmedAliveTeammate?.closeEnough;
void [firstRole];
import { analyzeUtilityContext } from "../src/index.js";
import type { UtilityContextAnalysis, UtilityEffectRef } from "../src/index.js";
const utility: UtilityContextAnalysis = analyzeUtilityContext(match, spatial, impact);
const effectRef: UtilityEffectRef = utility.effects[0].effectRef;
const effectIndex: number = effectRef.eventIndex;
// @ts-expect-error Context does not claim a release trajectory.
utility.effects[0].releaseRef;
// @ts-expect-error No utility quality score.
utility.effects[0].utilityScore;
// @ts-expect-error Distance does not prove effective range.
utility.effects[0].nearestEnemy?.inRange;
void [effectIndex];
import { analyzeCombatExecution } from "../src/index.js";
import type { CombatExecutionAnalysis, WeaponFireRef } from "../src/index.js";
const execution: CombatExecutionAnalysis = analyzeCombatExecution(match, result, impact, spatial);
const fireRef: WeaponFireRef = execution.weaponFireEvidence[0].eventRef;
// @ts-expect-error A fire event has no inferred opponent.
execution.weaponFireEvidence[0].opponentId;
// @ts-expect-error No aim/execution score.
execution.playerSummaries[0].executionScore;
// @ts-expect-error Observed fire count is not missed shots.
execution.playerEngagementExecutions[0].missedShots;
// @ts-expect-error Return event interval is not reaction time.
execution.playerEngagementExecutions[0].opponentExchanges[0].reactionTime;
// @ts-expect-error View convention remains unverified.
execution.playerEngagementExecutions[0].opponentExchanges[0].angularSeparationDegrees;
// @ts-expect-error No raw source event.
execution.contacts[0].event;
void [fireRef];
