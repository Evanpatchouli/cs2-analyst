import type { DesktopReplayChunk, DesktopReplayFrame, DesktopReplayPlayer, DesktopReplayRoundInfo } from '@cs2-analyst/report-contract';
export const replayBlockAt=(round:DesktopReplayRoundInfo,tick:number)=>round.blocks.find(b=>Math.floor(tick)>=b.startTick&&Math.floor(tick)<=b.endTick);

export class ReplayClock {
  tick: number; anchorMs = 0; speed = 1; playing = false;
  constructor(tick: number) { this.tick = tick; }
  read(now: number, tickRate: number | null) { return this.tick + (this.playing && tickRate !== null ? Math.max(0, now-this.anchorMs)/1000*tickRate*this.speed : 0); }
  seek(tick:number,now:number){this.tick=tick;this.anchorMs=now;}
  pause(now:number,rate:number|null){this.seek(this.read(now,rate),now);this.playing=false;}
  play(now:number){this.anchorMs=now;this.playing=true;}
  setSpeed(speed:number,now:number,rate:number|null){this.seek(this.read(now,rate),now);this.speed=speed;}
}
/** Pure presentation interpolation. No value from here returns to parser/analytics/findings. */
export function replayDisplayFrame(chunk:DesktopReplayChunk,tick:number,maxGap:number|null,playerIds:readonly string[]=[],floorAt?:(z:number|null)=>string|null):DesktopReplayFrame|null {
  if(tick<chunk.startTick||Math.floor(tick)>chunk.endTick||tick>(chunk.frames.at(-1)?.tick??-1)||!Number.isFinite(tick))return null;
  let low=0,high=chunk.frames.length;
  while(low<high){const mid=(low+high)>>>1;if(chunk.frames[mid].tick<=tick)low=mid+1;else high=mid;}
  const left=chunk.frames[low-1],right=chunk.frames[low];if(!left)return null;
  if(left.tick===tick)return left;
  const gap=right?right.tick-left.tick:Infinity;
  const players:DesktopReplayPlayer[]=left.players.map(a=>{
    const b=right?.players.find(p=>p[0]===a[0]);
    const interval=!!b&&maxGap!==null&&gap>0&&gap<=maxGap&&a[1]===left.tick&&b[1]===right.tick&&!a[10]&&!b[10]&&a[8]===b[8];
    if(!interval)return [a[0],null,null,null,null,null,null,null,'Unknown',null,a[10]||!!b?.[10]];
    const value:DesktopReplayPlayer=[...a];
    value[2]=value[3]=value[4]=value[5]=null;
    const sameFloor=!floorAt||(floorAt(a[4])!==null&&floorAt(a[4])===floorAt(b[4]));
    if(sameFloor&&a[9]!==null&&a[9]===b[9]&&a[7]===true&&b[7]===true&&a[2]!==null&&a[3]!==null&&a[4]!==null&&b[2]!==null&&b[3]!==null&&b[4]!==null){
      const f=(tick-left.tick)/gap;
      value[2]=a[2]+(b[2]-a[2])*f;value[3]=a[3]+(b[3]-a[3])*f;value[4]=a[4]+(b[4]-a[4])*f;
      if(a[5]!==null&&b[5]!==null){const delta=((b[5]-a[5]+540)%360+360)%360-180;value[5]=a[5]+delta*f;}
    }
    return value;
  });
  let bomb={...left.bomb};
  if(bomb.carrierId){
    const carrierIndex=playerIds.indexOf(bomb.carrierId),carrier=players.find(p=>p[0]===carrierIndex);
    // Reuse the carrier's presentation position only in the same valid observation run.
    bomb={...bomb,position:carrier?.[7]===true&&carrier[2]!==null&&carrier[3]!==null&&carrier[4]!==null?[carrier[2],carrier[3],carrier[4]]:null};
  }
  return {tick,players,bomb};
}
export class ReplayChunkCache {
  private readonly entries = new Map<string,DesktopReplayChunk>();
  get(round:number,block:number){const key=`${round}:${block}`,value=this.entries.get(key);if(value){this.entries.delete(key);this.entries.set(key,value);}return value;}
  put(chunk:DesktopReplayChunk){const key=`${chunk.round}:${chunk.block}`;this.entries.delete(key);this.entries.set(key,chunk);while(this.entries.size>3)this.entries.delete(this.entries.keys().next().value!);}
  clear(){this.entries.clear();}
  get size(){return this.entries.size;}
}
