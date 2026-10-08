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
