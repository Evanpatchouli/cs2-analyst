import { create } from 'zustand';
import type { DesktopMatchReport, ImportPhase } from '@cs2-analyst/report-contract';

type Status = 'idle' | ImportPhase | 'success' | 'error';
interface ReportState {
  status: Status;
  report: DesktopMatchReport | null;
  playerId: string;
  error: string | null;
  setPhase(phase: ImportPhase): void;
  selectPlayer(id: string): void;
  importDemo(): Promise<void>;
}
export const useReport = create<ReportState>((set, get) => ({
  status: 'idle', report: null, playerId: '', error: null,
  // Progress only moves an in-flight import forward; a late event must not re-enter busy after success/error.
  setPhase: phase => set(state => ['selecting', 'parsing', 'analyzing'].includes(state.status) ? { status: phase } : {}),
  selectPlayer: id => { if (get().report?.players.some(p => p.id === id)) set({ playerId: id }); },
  importDemo: async () => {
    if (['selecting', 'parsing', 'analyzing'].includes(get().status)) return;
    set({ status: 'selecting', error: null });
    try {
      const result = await window.cs2Analyst.importDemo();
      if (result.kind === 'cancelled') set({ status: get().report ? 'success' : 'idle' });
      else if (result.kind === 'error') set({ status: 'error', error: result.message });
      else set({ status: 'success', report: result.report, playerId: result.report.selectedPlayer });
    } catch {
      set({ status: 'error', error: '桌面分析连接失败。请重新选择 DEM；若仍失败，请重启应用。' });
    }
  },
}));
