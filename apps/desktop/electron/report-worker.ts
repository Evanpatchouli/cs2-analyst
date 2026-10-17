import { Demoparser2Provider } from '@cs2-analyst/dem-parser';
import { buildDesktopReport } from './report.js';
import { ReplaySession } from './replay-session.ts';
import { replayResourceId } from '../shared/replay-resource.ts';
import { createHeatmapSession, type HeatmapSession } from './heatmap-session.ts';
import type { DesktopReplayMetadata, DesktopReplayRequest } from '@cs2-analyst/report-contract';

// Owns input and bounded replay chunks. No file path crosses back to Renderer.
let initialized = false;
let session: ReplaySession | null = null;
let heatmapSession: HeatmapSession | null = null;
let disposed = false;
function clearSessions() {
  session?.clear();session=null;
  heatmapSession?.clear();heatmapSession=null;
}
process.on('exit',clearSessions);
process.parentPort?.on('message', async ({ data }: { data: { kind?: string; filePath?: string; sessionId?: string; requestId?: number; request?: unknown } }) => {
  if(!data||typeof data!=='object')return;
  if(data.kind==='session-release'){disposed=true;clearSessions();return;}
  if(data.kind==='heatmap-grid'){
    let result;
    try {result=heatmapSession?.get(data.request)??{kind:'error',message:'热力图会话或图层不可用。'};}
    catch {result={kind:'error',message:'热力图请求失败；比赛报告与回放仍可用。'};}
    process.parentPort?.postMessage({kind:'heatmap-grid',requestId:data.requestId,result});return;
  }
  if (data.kind === 'replay-chunk' && initialized) {
    const chunk = data.request ? session?.get(data.request as DesktopReplayRequest) : null;
    process.parentPort?.postMessage({ kind:'replay-chunk',requestId:data.requestId,
      result:chunk?{kind:'success',chunk}:{kind:'error',message:'回放会话或数据块已失效。'} });
    return;
  }
  if (disposed || initialized || typeof data.filePath !== 'string' || typeof data.sessionId !== 'string') return;
  initialized = true;
  try {
    const parsed = await new Demoparser2Provider().parseWithReplay(data.filePath);
    if(disposed)return;
    process.parentPort?.postMessage({ kind:'progress',phase:'analyzing' });
    const report = buildDesktopReport(parsed.match,data.filePath,parsed.spatial);
    let metadata:DesktopReplayMetadata={schemaVersion:1,available:false,unavailableReason:parsed.replayUnavailableReason??'回放不可用。',
      sessionId:null,matchId:parsed.match.id,map:parsed.match.map,resourceId:replayResourceId,samplingVersion:parsed.replay?.samplingVersion??'unavailable',
      tickRate:parsed.replay?.tickRate??null,maxInterpolationTicks:parsed.replay?.maxInterpolationTicks??null,perspective:'global',players:[],rounds:[],excludedRounds:[]};
    try { if(parsed.replay){session=new ReplaySession(parsed.match,parsed.replay,data.sessionId);metadata=session.metadata;} }
    catch { session?.clear();session=null;metadata.unavailableReason='回放超出本机会话缓存预算；比赛报告仍可用。'; }
    report.replay=metadata;
    // Independent guarded initialization: heatmap failure never rejects a usable report/replay.
    const heatmap=createHeatmapSession(parsed.match,parsed.replay,parsed.spatial,data.sessionId);
    heatmapSession=heatmap.session;report.heatmap=heatmap.metadata;
    process.parentPort?.postMessage({kind:'success',report});
  } catch {
    clearSessions();
    process.parentPort?.postMessage({kind:'error',message:'无法分析此 DEM。请确认它是完整的 CS2 录像，然后重新选择。'});
  }
});
