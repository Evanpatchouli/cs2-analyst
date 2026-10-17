import type { DesktopHeatmapMetadata, DesktopHeatmapRequest, DesktopHeatmapResult, DesktopHeatmapScope, HeatmapLayer, HeatmapResolution, MapHeatmapProjection } from '@cs2-analyst/report-contract';
import { validateHeatmapRequest, validateHeatmapResult } from '../../shared/heatmap-ipc.ts';

export const heatmapLayers: HeatmapLayer[] = ['positions', 'kills', 'deaths'];
/** Only the position source is on by default; event layers stay opt-in and unavailable sources stay off. */
export function defaultHeatmapLayers(metadata?: Pick<DesktopHeatmapMetadata, 'available' | 'layers'>): HeatmapLayer[] {
  return metadata?.available && metadata.layers.positions.available ? ['positions'] : [];
}
export const defaultHeatmapScope: DesktopHeatmapScope = {
  rounds: null, playerIds: null, side: 'all', floor: null, includeFreezeTime: false, samplingSet: 'all-valid',
};
export type HeatmapLayerState = { status: 'loading' } | { status: 'error'; message: string }
  | { status: 'ready'; projection: MapHeatmapProjection };

/** One renderer-wide pool: retired sessions still occupy slots until their real IPC settles. */
export class HeatmapScheduler {
  private active = 0;
  private generation = 0;
  private pending: (() => void)[] = [];
  update(metadata: DesktopHeatmapMetadata, resolution: HeatmapResolution, scope: DesktopHeatmapScope,
    enabled: HeatmapLayer[], getGrid: (request: DesktopHeatmapRequest) => Promise<DesktopHeatmapResult>,
    publish: (layer: HeatmapLayer, state: HeatmapLayerState) => void): () => void {
    const token = ++this.generation;
    this.pending = [];
    for (const layer of enabled) {
      const request: DesktopHeatmapRequest = { schemaVersion: 1, sessionId: metadata.sessionId, layer, resolution, scope };
      if (!validateHeatmapRequest(request, metadata)) {
        publish(layer, { status: 'error', message: '热力图筛选或会话不可用。' });
        continue;
      }
      publish(layer, { status: 'loading' });
      this.pending.push(() => {
        this.active++;
        // Catch synchronous bridge failures as well as rejected promises. Main owns the 15s timeout.
        void Promise.resolve().then(() => getGrid(request)).then(result => {
          if (token !== this.generation) return;
          if (!validateHeatmapResult(result, request, metadata)) throw new Error('热力图响应无效。');
          publish(layer, result.kind === 'success' ? { status: 'ready', projection: result.projection }
            : { status: 'error', message: result.message });
        }).catch(reason => {
          if (token === this.generation) publish(layer, { status: 'error', message: reason instanceof Error ? reason.message : '热力图请求失败。' });
        }).finally(() => { this.active--; this.pump(); });
      });
    }
    this.pump();
    return () => { if (this.generation === token) { this.generation++; this.pending = []; } };
  }
  private pump() { while (this.active < 2 && this.pending.length) this.pending.shift()!(); }
}
export const heatmapScheduler = new HeatmapScheduler();

export const heatmapReason = (reason: string | null | undefined): string => ({
  'replay-unavailable': '位置回放源不可用', 'spatial-unavailable': '精确事件位置源不可用',
  'uniform-grid-unavailable': 'uniform-8hz 采样集不适用于此回放', 'memory-budget-exceeded': '热力图初始化超出 JS heap 准入预算',
  'initialization-failed': '热力图初始化失败', 'session-ended': '分析会话已结束，请重新导入',
  'sources-unavailable': '没有可用的热力图数据源',
}[reason ?? ''] ?? '热力图元数据不可用');
