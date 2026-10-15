import type { MatchReplay } from '@cs2-analyst/match-model';
import type { SpatialParseResult } from './spatial.js';
export interface ReplayParseResult extends SpatialParseResult {
  replay: MatchReplay | null;
  replayUnavailableReason: string | null;
  replayMs: number;
}
