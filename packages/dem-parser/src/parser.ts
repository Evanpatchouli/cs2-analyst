import type { Match } from "@cs2-coach/match-model";

export interface DemoParser {
  parse(filePath: string): Promise<Match>;
}
