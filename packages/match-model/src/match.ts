import type { Player } from "./player";
import type { Round } from "./round";

export interface Match {
  id: string;
  map: string;
  tickRate?: number;
  players: Player[];
  rounds: Round[];
}
