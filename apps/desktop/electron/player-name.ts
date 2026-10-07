/** Presentation only: retain raw identifiers in DTOs, never use them as names. */
export function displayPlayerName(playerId: string, nickname?: string | null): string {
  const name = nickname?.trim();
  return !name || name === playerId || /^\d{15,22}$/.test(name) ? '未知玩家' : name;
}
