export interface Match {
  id: string;
  map: string;
  players: Player[];
  rounds: Round[];
}

export interface Player {
  steamId: string;
  nickname: string;
  team: string;
}

export interface Round {
  number: number;
  winner?: "CT" | "T";
  events: MatchEvent[];
}

export interface MatchEvent {
  type: string;
  tick: number;
}
