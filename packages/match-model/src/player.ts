export type TeamSide = "CT" | "T" | "Unknown";

export interface Player {
  steamId: string;
  nickname: string;
  team: TeamSide;
}
