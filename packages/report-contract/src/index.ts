import type { Finding } from '@cs2-coach/findings';

/** JSON-only presentation contract. No domain events, native objects or file paths. */
export interface DesktopPlayerAnalytics {
  playerId: string;
  kills: number;
  deaths: number;
  assists: number;
  roundsPlayed: number;
  adr: number | null;
  headshotPercentage: number | null;
  kast: { percentage: number | null; complete: boolean; rounds: number; eligibleRounds: number };
  trade: { rate: number | null; complete: boolean; kills: number; tradedDeaths: number; tradeableDeaths: number };
  opening: { kills: number; deaths: number; winRate: number | null };
  utility: {
    throws: { flash: number | null; smoke: number | null; he: number | null; incendiary: number | null; molotov: number | null; decoy: number | null };
    heDamage: number | null;
    fireDamage: number | null;
    enemyFlashEffects: number;
    teamFlashEffects: number;
    flashEffectsComplete: boolean;
    flashAssists: number | null;
  };
  clutch: { opportunities: number; wins: number; complete: boolean; list: { round: number; opponents: number; won: boolean | null }[] };
  coverage: { complete: boolean; notes: string[] };
}
export interface DesktopMatchReport {
  schemaVersion: 1;
  match: { id: string; fileName: string; map: string; rounds: number; score: { initialCT: number; initialT: number } | null };
  selectedPlayer: string;
  players: { id: string; nickname: string }[];
  analytics: DesktopPlayerAnalytics[];
  findings: Finding[];
}
export type ImportPhase = 'selecting' | 'parsing' | 'analyzing';
export type ImportResult = { kind: 'success'; report: DesktopMatchReport } | { kind: 'cancelled' } | { kind: 'error'; message: string };
export interface DesktopApi {
  version: string;
  importDemo(): Promise<ImportResult>;
  onProgress(listener: (phase: ImportPhase) => void): () => void;
}
