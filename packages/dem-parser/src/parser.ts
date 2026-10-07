import type { Match } from "@cs2-analyst/match-model";

export interface DemoParser {
  parse(filePath: string): Promise<Match>;
}
