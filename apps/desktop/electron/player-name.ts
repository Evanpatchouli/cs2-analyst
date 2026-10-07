/** Presentation only: test for blank names without changing supplied nicknames. */
export function displayPlayerName(_playerId: string, nickname?: string | null): string {
  return nickname?.trim() ? nickname : '未知玩家';
}
