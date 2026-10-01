export interface Player {
  steamId: string;
  nickname: string;
}

export interface Match {
  id: string;
  map: string;
  players: Player[];
}
