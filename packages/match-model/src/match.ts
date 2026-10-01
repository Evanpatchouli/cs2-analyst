import type { Player } from "./player.js";
import type { Round } from "./round.js";

export interface Match {
  id: string;
  map: string;
  tickRate?: number;
  players: Player[];
  rounds: Round[];
}
