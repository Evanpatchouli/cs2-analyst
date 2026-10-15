import { useEffect, useRef, useState } from 'react';
import { Badge, Body1, Button, Caption1, Card, Dropdown, Option, Slider, Spinner, Title2, makeStyles, tokens } from '@fluentui/react-components';
import type { DesktopReplayChunk, DesktopReplayFrame, DesktopReplayMetadata, DesktopReplayRoundInfo } from '@cs2-analyst/report-contract';
import { mapResourceState, radarHeading, resolveMapLayer, worldToRadar } from './replay-map';
import { replayMapAssets } from './replay-map-assets';
import { ReplayChunkCache, ReplayClock, replayBlockAt, replayDisplayFrame } from './replay-state';
import { palette } from './theme';

const useStyles = makeStyles({
  root: { display:'flex',flexDirection:'column',gap:'14px' },
  toolbar: { display:'flex',alignItems:'center',flexWrap:'wrap',gap:'10px' },
  dropdown: { minWidth:'110px',maxWidth:'180px' },
  panel: { backgroundColor:palette.card,padding:'18px',display:'flex',flexDirection:'column',gap:'14px' },
  layout: { display:'grid',gridTemplateColumns:'minmax(0,1fr) 240px',gap:'20px','@media (max-width: 900px)':{gridTemplateColumns:'minmax(0,1fr)'} },
  map: { position:'relative',width:'100%',aspectRatio:'1',maxWidth:'640px',backgroundColor:palette.replay.surface,alignSelf:'start' },
  canvas: { position:'absolute',inset:0,width:'100%',height:'100%',':focus-visible':{outline:`2px solid ${tokens.colorBrandStroke1}`,outlineOffset:'2px'} },
  players: { display:'flex',flexDirection:'column',gap:'2px',minWidth:0 },
  player: { justifyContent:'space-between',minWidth:0,gap:'6px',textAlign:'left' },
  name: { overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0 },
  muted: { color:tokens.colorNeutralForeground3 },
  events: { display:'flex',flexDirection:'column',maxHeight:'280px',overflowY:'auto',gap:'4px' },
  event: { justifyContent:'flex-start',textAlign:'left',whiteSpace:'normal' },
});
export interface ReplayJump { round:number; tick?:number; sequence:number }
const blockAt=replayBlockAt;
const timeText=(tick:number,round:DesktopReplayRoundInfo,rate:number|null)=>rate===null?`原始 tick ${Math.round(tick)}`:`+${((tick-round.startTick)/rate).toFixed(2)} 秒`;

export function ReplayPlayer({ metadata, playerId, onSelectPlayer, active, jump }: {
  metadata:DesktopReplayMetadata;playerId:string;onSelectPlayer:(id:string)=>void;active:boolean;jump:ReplayJump|null;
}) {
  const s=useStyles(),first=metadata.rounds[0];
  const [roundNumber,setRoundNumber]=useState(first?.round??0),[tick,setTick]=useState(first?.startTick??0);
  const [playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[floor,setFloor]=useState('auto');
  const [loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
  const [imageReady,setImageReady]=useState(false),[imageFailed,setImageFailed]=useState(false);
  const cache=useRef(new ReplayChunkCache()),clock=useRef(new ReplayClock(first?.startTick??0));
  const inFlight=useRef(false),generation=useRef(0),resume=useRef(false),failed=useRef(new Set<string>());
  const baseCanvas=useRef<HTMLCanvasElement>(null),canvas=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null);
  const image=useRef<HTMLImageElement|null>(null),drawTimes=useRef<number[]>([]);
  const info=metadata.rounds.find(r=>r.round===roundNumber);
  const block=info?blockAt(info,tick):undefined,chunk=block?cache.current.get(roundNumber,block.index):undefined;
  const playerIds=metadata.players.map(p=>p.id);
  const frame=chunk?replayDisplayFrame(chunk,tick,metadata.maxInterpolationTicks,playerIds):null;
  const mapState=mapResourceState(metadata.map,replayMapAssets),map=mapState.definition;
  const selectedIndex=metadata.players.findIndex(p=>p.id===playerId),selected=frame?.players.find(p=>p[0]===selectedIndex);
  const layerId=map?(floor==='auto'?resolveMapLayer(map,selected?.[4]??null):floor):null;
  const layer=map?.layers.find(l=>l.id===layerId),url=layer?replayMapAssets[layer.image]:undefined;
  const availableMap=mapState.status!=='unavailable'&&!imageFailed;
  const live=useRef({info,playerId,active,map,layerId,imageReady,onSelectPlayer});
  live.current={info,playerId,active,map,layerId,imageReady,onSelectPlayer};

  function seek(next:number,round=live.current.info) {
    if(!round)return;
    clock.current.pause(performance.now(),metadata.tickRate);resume.current=false;setPlaying(false);
    const bounded=Math.max(round.startTick,Math.min(round.endTick,next));clock.current.seek(bounded,performance.now());setTick(bounded);setError(null);
  }
  function selectRound(number:number,nextTick?:number){
    const round=metadata.rounds.find(r=>r.round===number);if(!round)return;
    live.current.info=round;setRoundNumber(number);seek(nextTick??round.startTick,round);
  }
  function toggle(){
    const round=live.current.info;if(!round||metadata.tickRate===null)return;
    if(clock.current.playing){clock.current.pause(performance.now(),metadata.tickRate);resume.current=false;setPlaying(false);setTick(clock.current.tick);}
    else {if(clock.current.tick>=round.endTick)clock.current.seek(round.startTick,performance.now());clock.current.play(performance.now());setPlaying(true);}
  }
  async function load(round:DesktopReplayRoundInfo,index:number,prefetch=false){
    const key=`${round.round}:${index}`;
    if(inFlight.current||cache.current.get(round.round,index))return;
    if(failed.current.has(key)){if(!prefetch){setError('该回放数据块不可用，请重试。');resume.current=false;setLoading(false);}return;}
    inFlight.current=true;const token=generation.current;
    if(!prefetch)setLoading(true);
    try {
      const result=await window.cs2Analyst.replay.getChunk({sessionId:metadata.sessionId!,round:round.round,block:index});
      if(token!==generation.current)return;
      if(result.kind!=='success')throw new Error(result.message);
      const next=result.chunk;
      if(next.schemaVersion!==1||next.sessionId!==metadata.sessionId||next.matchId!==metadata.matchId||next.round!==round.round||next.block!==index)throw new Error('回放会话已更新。');
      cache.current.put(next);setRevision(n=>n+1);
      const currentRound=live.current.info;
      if(resume.current&&live.current.active&&currentRound?.round===round.round&&blockAt(currentRound,clock.current.tick)?.index===index){
        resume.current=false;clock.current.play(performance.now());setPlaying(true);
      }
    }catch(reason){if(token===generation.current){failed.current.add(key);if(!prefetch){setError(reason instanceof Error?reason.message:'回放数据不可用。');resume.current=false;setPlaying(false);}}}
    finally {if(token===generation.current){inFlight.current=false;if(!prefetch)setLoading(false);}}
  }
  function paint(current:DesktopReplayFrame|null,currentChunk:DesktopReplayChunk|undefined,at:number){
    const target=canvas.current,view=live.current;if(!target)return;
    const ctx=target.getContext('2d');if(!ctx)return;
    const started=performance.now();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,target.width,target.height);
    target.dataset.tick=String(at);target.dataset.playerCount='0';
    if(!view.map||!current||!view.imageReady||!view.layerId)return;
    const map=view.map;ctx.setTransform(target.width/map.width,0,0,target.height/map.height,0,0);
    let drawnPlayers=0;
    for(const p of current.players){
      if(p[7]!==true||p[2]===null||p[3]===null||resolveMapLayer(map,p[4])!==view.layerId)continue;
      const point=worldToRadar(map,{x:p[2],y:p[3]});if(!point||point.x<0||point.y<0||point.x>map.width||point.y>map.height)continue;
      drawnPlayers++;
      const chosen=metadata.players[p[0]]?.id===view.playerId,color=p[8]==='CT'?palette.replay.ct:p[8]==='T'?palette.replay.t:palette.replay.unknown;
      ctx.fillStyle=color;ctx.strokeStyle=chosen?palette.replay.selection:palette.replay.surface;ctx.lineWidth=chosen?3:2;
      ctx.beginPath();if(p[8]==='CT')ctx.rect(point.x-7,point.y-7,14,14);else ctx.arc(point.x,point.y,chosen?9:7,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(p[5]!==null){const heading=radarHeading(p[5]);if(heading){ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(point.x+heading.x*10,point.y+heading.y*10);ctx.lineTo(point.x+heading.x*22,point.y+heading.y*22);ctx.stroke();}}
      ctx.font='bold 12px Segoe UI';ctx.textAlign='center';ctx.fillStyle=palette.replay.surface;ctx.fillText(String(p[0]+1),point.x,point.y+4);
      if(chosen){ctx.fillStyle=palette.replay.selection;ctx.font='14px Segoe UI';ctx.fillText(metadata.players[p[0]]?.nickname.slice(0,22)??'',point.x,point.y-14);}
    }
    const bomb=current.bomb;
    if(bomb.position&&resolveMapLayer(map,bomb.position[2])===view.layerId){const p=worldToRadar(map,{x:bomb.position[0],y:bomb.position[1]});if(p){ctx.strokeStyle=palette.replay.bomb;ctx.lineWidth=3;ctx.strokeRect(p.x-8,p.y-8,16,16);}}
    for(const event of currentChunk?.events??[]){
      if(event.type!=='utility'||!event.position||Math.floor(at)!==event.tick||resolveMapLayer(map,event.position[2])!==view.layerId)continue;
      const p=worldToRadar(map,{x:event.position[0],y:event.position[1]});if(p){ctx.strokeStyle=palette.utility.smoke;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-5,p.y);ctx.lineTo(p.x+5,p.y);ctx.moveTo(p.x,p.y-5);ctx.lineTo(p.x,p.y+5);ctx.stroke();}
    }
    const times=drawTimes.current;times.push(performance.now()-started);if(times.length>120)times.shift();
    target.dataset.playerCount=String(drawnPlayers);
    target.dataset.drawP95=String([...times].sort((a,b)=>a-b)[Math.floor(times.length*.95)]??0);
  }
  useEffect(()=>()=>{generation.current++;cache.current.clear();resume.current=false;},[metadata.sessionId]);
  useEffect(()=>{if(jump)selectRound(jump.round,jump.tick);},[jump?.sequence]);
  useEffect(()=>{
    if(!active||!metadata.available){clock.current.pause(performance.now(),metadata.tickRate);resume.current=false;setPlaying(false);return;}
    let raf=0,lastUi=0;
    const animate=(now:number)=>{
      const round=live.current.info;if(!round)return;
      let at=Math.min(round.endTick,clock.current.read(now,metadata.tickRate));
      if(at>=round.endTick&&clock.current.playing){clock.current.seek(round.endTick,now);clock.current.pause(now,metadata.tickRate);setPlaying(false);}
      const needed=blockAt(round,at),data=needed?cache.current.get(round.round,needed.index):undefined;
      if(!data&&needed){
        if(clock.current.playing){resume.current=true;clock.current.seek(at,now);clock.current.pause(now,metadata.tickRate);setPlaying(false);}
        void load(round,needed.index);
      }
      paint(data?replayDisplayFrame(data,at,metadata.maxInterpolationTicks,playerIds):null,data,at);
      if(now-lastUi>=100){setTick(at);lastUi=now;}
      if(data&&needed&&!inFlight.current){const neighbor=[needed.index+1,needed.index-1].find(index=>round.blocks.some(b=>b.index===index)&&!cache.current.get(round.round,index)&&!failed.current.has(`${round.round}:${index}`));if(neighbor!==undefined)void load(round,neighbor,true);}
      raf=requestAnimationFrame(animate);
    };
    const hidden=()=>{if(document.hidden){clock.current.pause(performance.now(),metadata.tickRate);resume.current=false;setPlaying(false);}};
    raf=requestAnimationFrame(animate);document.addEventListener('visibilitychange',hidden);
    return()=>{cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',hidden);clock.current.pause(performance.now(),metadata.tickRate);resume.current=false;};
  },[active,metadata.sessionId]);
  useEffect(()=>{
    image.current=null;setImageReady(false);setImageFailed(false);
    if(!url||mapState.status==='unavailable')return;
    const img=new Image();let disposed=false;
    img.onload=()=>{if(!disposed){image.current=img;setImageReady(true);drawBackground();}};
    img.onerror=()=>{if(!disposed)setImageFailed(true);};img.src=url;
    function drawBackground(){const base=baseCanvas.current;if(!base)return;const ctx=base.getContext('2d');ctx?.clearRect(0,0,base.width,base.height);if(image.current)ctx?.drawImage(image.current,0,0,base.width,base.height);}
    const observer=new ResizeObserver(()=>{
      const size=box.current?.getBoundingClientRect().width??0;if(size<=0)return;
      const pixels=Math.max(1,Math.round(size*(window.devicePixelRatio||1)));
      for(const c of [baseCanvas.current,canvas.current])if(c&&(c.width!==pixels||c.height!==pixels)){c.width=pixels;c.height=pixels;}
      drawBackground();
    });if(box.current)observer.observe(box.current);
    return()=>{disposed=true;observer.disconnect();img.onload=null;img.onerror=null;};
  },[url,active]);
  if(!metadata.available||!info)return <section className={s.root} aria-label="2D地图回放"><Title2>2D 地图回放</Title2><Body1>{metadata.unavailableReason??'本场缺少可靠回放窗口，比赛报告仍可用。'}</Body1></section>;
  const currentEvents=(chunk?.events??[]).filter(e=>e.type!=='weapon_fire'&&e.type!=='damage'&&e.type!=='flash');
  const sameTick=new Map<number,number>();for(const e of chunk?.events??[])sameTick.set(e.tick,(sameTick.get(e.tick)??0)+1);
  return <section className={s.root} aria-label="2D地图回放" data-replay-session={metadata.sessionId} data-replay-match={metadata.matchId} data-replay-round={roundNumber} data-replay-tick={tick} data-replay-cache={cache.current.size} data-replay-block={block?.index} data-replay-revision={revision} data-replay-map-ready={imageReady}>
    <Title2>2D 地图回放</Title2>
    <Caption1 className={s.muted}>全局比赛观察视角 · 朝向仅为记录方向，不表示看到了敌人。位置插值仅用于显示。</Caption1>
    <Card className={s.panel}>
      <div className={s.toolbar}>
        <Button appearance="primary" aria-label={playing?'暂停回放':'播放回放'} aria-pressed={playing} disabled={metadata.tickRate===null||!active} onClick={toggle}>{playing?'暂停':'播放'}</Button>
        <Dropdown className={s.dropdown} aria-label="回放倍速" value={`${speed}×`} selectedOptions={[String(speed)]} disabled={metadata.tickRate===null} onOptionSelect={(_,d)=>{if(!d.optionValue)return;const value=Number(d.optionValue);clock.current.setSpeed(value,performance.now(),metadata.tickRate);setSpeed(value);}}>{[.25,.5,1,2,4].map(v=><Option key={v} value={String(v)}>{`${v}×`}</Option>)}</Dropdown>
        <Dropdown className={s.dropdown} aria-label="回放回合" value={`R${roundNumber}`} selectedOptions={[String(roundNumber)]} onOptionSelect={(_,d)=>d.optionValue&&selectRound(Number(d.optionValue))}>{metadata.rounds.map(r=><Option key={r.round} value={String(r.round)}>{`R${r.round}`}</Option>)}</Dropdown>
        {map&&map.layers.length>1?<Dropdown className={s.dropdown} aria-label="回放楼层" value={floor==='auto'?'跟随玩家':map.layers.find(l=>l.id===floor)?.label} selectedOptions={[floor]} onOptionSelect={(_,d)=>d.optionValue&&setFloor(d.optionValue)}><Option value="auto">跟随玩家</Option>{map.layers.map(l=><Option key={l.id} value={l.id}>{l.label}</Option>)}</Dropdown>:null}
        <Badge appearance="tint" color="warning">地图版本未确认 · 仅示意</Badge>
      </div>
      <Slider aria-label="回放进度" style={{width:'100%'}}
        rail={{style:{width:'100%',height:4,background:`linear-gradient(90deg, ${palette.currentPlayer} ${(tick-info.startTick)/(info.endTick-info.startTick||1)*100}%, ${palette.borderStrong} ${(tick-info.startTick)/(info.endTick-info.startTick||1)*100}%)`}}}
        min={info.startTick} max={info.endTick} step={1} value={Math.round(tick)} aria-valuetext={timeText(tick,info,metadata.tickRate)} onChange={(_,d)=>seek(d.value)} />
      <div className={s.toolbar}><Body1 data-replay-time>{timeText(tick,info,metadata.tickRate)} / {timeText(info.endTick,info,metadata.tickRate)}</Body1>{info.freezeEndTick!==null&&tick<info.freezeEndTick?<Badge appearance="outline">冻结阶段</Badge>:null}{loading?<Spinner size="tiny" label="加载回放数据…"/>:null}</div>
      {metadata.tickRate===null?<Caption1>时钟不可靠，仅支持原始 tick 与事件定位，不能正常倍速播放。</Caption1>:null}
      {error?<div role="alert"><Body1>{error}</Body1><Button size="small" onClick={()=>{failed.current.clear();setError(null);}}>重试</Button></div>:null}
      <div className={s.layout}>
        {availableMap?<div ref={box} className={s.map}>
          <canvas ref={baseCanvas} className={s.canvas} aria-hidden="true" />
          <canvas ref={canvas} className={s.canvas} tabIndex={0} role="img" aria-label={`R${roundNumber} 全局地图；空格播放或暂停，左右方向键定位，Home/End跳至回合起止。`} onKeyDown={e=>{if(e.key===' '){e.preventDefault();toggle();}else if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const at=clock.current.read(performance.now(),metadata.tickRate);seek(e.key==='Home'?info.startTick:e.key==='End'?info.endTick:at+(e.key==='ArrowLeft'?-1:1)*(metadata.tickRate??1));}}} />
        </div>:<Body1>本机没有配套雷达资源或图片无法装载；仍可浏览事件与玩家状态。</Body1>}
        <div className={s.players} aria-label="回放玩家状态">
          {metadata.players.map((player,index)=>{const p=frame?.players.find(p=>p[0]===index);return <Button key={player.id} className={s.player} appearance={player.id===playerId?'secondary':'subtle'} aria-pressed={player.id===playerId} onClick={()=>onSelectPlayer(player.id)} title={player.nickname}><span className={s.name}>{index+1}. {player.nickname}</span><Caption1>{p?.[8]??'Unknown'} · {p?.[7]===false?'阵亡':p?.[7]===true?`${p[6]??'—'} HP`:'未知'}</Caption1></Button>;})}
          <Caption1 className={s.muted}>CT 蓝方块 / T 橙圆点；白框为选中玩家。</Caption1>
          {map&&map.layers.length>1?<Caption1>{layer?`当前${layer.label}；其他层点位隐藏。`:'选中玩家楼层未知，请手动选层。'}未知 Z 与共享高度边界不自动归层。</Caption1>:null}
          <Caption1 className={s.muted}>炸弹标记为事件关联位置；道具十字仅标示已记录生效点，不表示飞行轨迹或烟火范围。</Caption1>
          {info.coverage==='partial'?<Caption1>该回合存在缺失或歧义状态；断点不连接，未知状态不补齐。</Caption1>:null}
        </div>
      </div>
      <Caption1 className={s.muted}>当前数据块关键事件；同 tick 不推断先后顺序。{metadata.excludedRounds.length?` ${metadata.excludedRounds.length} 个回合窗口不可靠，未开放回放。`:''}</Caption1>
      <div className={s.events} aria-label="回放事件浏览">{currentEvents.length?currentEvents.map(e=><Button key={e.id} className={s.event} appearance="subtle" size="small" data-replay-event={e.id} onClick={()=>seek(e.tick)}>{timeText(e.tick,info,metadata.tickRate)} · {e.description}{(sameTick.get(e.tick)??0)>1?' · 同 tick，顺序未知':''}</Button>):<Caption1>此数据块没有可展示的关键事件。</Caption1>}</div>
    </Card>
  </section>;
}
