export { analyzeEngagements } from "./engagements.js";
export { classifyContactWeapon } from "./weapons.js";
export { analyzeKillImpact } from "./kill-impact.js";
export { analyzeTeamplay } from "./teamplay.js";
export type * from "./teamplay-contracts.js";
export { resolveRoundAliveState } from "./alive-state.js";
export type * from "./impact-contracts.js";
export type {
  ContactSourceKind, ContactEventRef, ContactSpatialSample, ContactSpatialCoverage,
  EngagementContact, SpatialEnrichmentCoverage, SegmentationReason, EventSegmentationCoverage,
  Engagement, EngagementOptions, EngagementDiagnostics, EngagementAnalysis,
} from "./contracts.js";
