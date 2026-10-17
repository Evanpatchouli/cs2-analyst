// P7 manual UI acceptance: real built Electron, real dust2 DEM, no product test hooks.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { closeApp, connectCdp, waitFor, withCleanup } from './smoke-runtime.mjs';
import { ProcessScope } from './installed-smoke-lifecycle.mjs';
import { settleUi, waitForUi } from './window-shell-checks.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), desktop = join(root, 'apps/desktop');
const demo = join(root, '.demo/dust2.dem'), qa = join(root, '.tmp/p7-ui-qa');
mkdirSync(qa, { recursive: true });
assert.ok(existsSync(demo), 'BLOCKED: local .demo/dust2.dem missing; no download/substitute');
assert.equal(statSync(demo).size, 557650967);
const digest = createHash('sha256');
for await (const chunk of createReadStream(demo)) digest.update(chunk);
assert.equal(digest.digest('hex'), 'db90fe85aab023a1d2c8a5996182e6120d98ef494f02a070b17982b235e4958c', 'wrong local Dust2 bytes');
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const server = createServer();
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;
await new Promise(ok => server.close(ok));
const profilePrefix = join(tmpdir(), 'cs2-analyst-p7-ui-profile-'), profile = mkdtempSync(profilePrefix);
const env = { ...process.env, CS2_ANALYST_DEM_PATH: demo };
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
const child = spawn(require('electron'), ['.', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows'], {
  cwd: desktop, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
const scope = new ProcessScope(), tracked = scope.track(child, 'P7 UI acceptance', Date.now());
let logs = '', page, failure;
child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
const metrics = { fixture: '.demo/dust2.dem', screenshots: [], checks: [] };
const wait = (probe, label, timeout = 30000) => waitFor(probe, timeout, label, { intervalMs: 50, diagnostics: () => ({ logs: logs.slice(-3000) }) });
try {
  await scope.live();
  const target = await wait(async () => {
    try { return (await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(1000) })).json()).find(t => t.type === 'page'); }
    catch { return null; }
  }, 'CDP page');
  page = await connectCdp(target.webSocketDebuggerUrl);
  const evaluate = page.evaluate;
  const exceptions = [];
  page.socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params); });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  const shot = async name => {
    const result = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const path = join(qa, name + '.png'); writeFileSync(path, Buffer.from(result.data, 'base64')); metrics.screenshots.push(path); return path;
  };
  await wait(() => evaluate('Boolean(window.cs2Analyst && document.querySelector("main"))'), 'preload/React');
  assert.equal(await evaluate('typeof window.require'), 'undefined');
  await evaluate('document.querySelector("[data-sidebar-import]").click()');
  await wait(() => evaluate('document.querySelector("main").dataset.status === "success"'), 'real import', 120000);
  const report = await evaluate('(() => {const node=document.getElementById("replay-panel");let f=node[Object.keys(node).find(k=>k.startsWith("__reactFiber$"))];while(f&&!f.memoizedProps?.report)f=f.return;return f.memoizedProps.report;})()');
  const meta = report.replay;
  assert.equal(meta.available, true, meta.unavailableReason || 'replay available');
  metrics.session = meta.sessionId; metrics.rounds = meta.rounds.length;
  await evaluate('document.getElementById("replay-tab").click()');
  await wait(() => evaluate('document.querySelector("[data-replay-session]")?.dataset.replayMapReady==="true" && Number(document.querySelector("[data-replay-session]")?.dataset.replayRevision)>0'), 'replay first frame');
  await settleUi(evaluate, 'replay initial');

  const labels = await evaluate('document.getElementById("replay-panel").innerText');
  assert.ok(labels.includes('比赛回放')); assert.equal(labels.includes('地图回放'), false);
  assert.ok(labels.includes('地图版本未确认')); assert.equal(labels.includes('仅示意'), false);
  assert.equal(await evaluate('document.querySelector("[aria-label=地图说明]") !== null'), true);
  await evaluate('document.querySelector("[aria-label=地图说明]").focus()');
  assert.equal(await evaluate('document.activeElement?.getAttribute("aria-label")==="地图说明"'), true, 'keyboard focus reaches the map info icon');
  await wait(() => evaluate('[...document.querySelectorAll("[role=tooltip]")].some(t=>t.textContent.includes("全局比赛观察视角"))'), 'map info focus tooltip', 10000);
  assert.ok(await evaluate('[...document.querySelectorAll("[role=tooltip]")].some(t=>t.textContent.includes("白框为选中玩家"))'));
  await evaluate('document.activeElement.blur()');
  const infoRect = await evaluate('(() => {const r=document.querySelector("[aria-label=地图说明]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: infoRect.x, y: infoRect.y });
  await wait(() => evaluate('[...document.querySelectorAll("[role=tooltip]")].some(t=>t.textContent.includes("全局比赛观察视角"))'), 'map info hover tooltip', 10000);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });
  await wait(() => evaluate('![...document.querySelectorAll("[role=tooltip]")].some(t=>t.checkVisibility()&&t.textContent.includes("全局比赛观察视角"))'), 'map info hover closes', 5000);
  metrics.checks.push('naming + map label + map info tooltip');

  const switchState = await evaluate('(() => {const s=document.querySelector("[role=switch]");return {checked:s.checked, label:s.parentElement.innerText};})()');
  assert.equal(switchState.checked, true); assert.ok(switchState.label.includes('连续播放'));

  await evaluate('document.querySelector("[aria-label=回放回合]").click()');
  await waitForUi(evaluate, 'Boolean([...document.querySelectorAll("[role=listbox]")].at(-1)?.querySelector("[role=option]"))', 'round menu open');
  const menu = await evaluate('(() => {const box=[...document.querySelectorAll("[role=listbox]")].at(-1),r=box.getBoundingClientRect(),selected=box.querySelector("[aria-selected=true]"),sr=selected?.getBoundingClientRect();return {height:r.height,top:r.top,bottom:r.bottom,viewport:innerHeight,scrollHeight:box.scrollHeight,clientHeight:box.clientHeight,overflow:getComputedStyle(box).overflowY,maxHeight:getComputedStyle(box).maxHeight,inline:box.getAttribute("style"),options:box.querySelectorAll("[role=option]").length,selectedVisible:Boolean(sr&&sr.top>=r.top-1&&sr.bottom<=r.bottom+1)};})()');
  assert.equal(menu.options, meta.rounds.length); assert.ok(menu.options >= 20, 'dust2 exposes a long round list');
  assert.ok(menu.height <= 320.5); assert.ok(menu.top >= -1 && menu.bottom <= menu.viewport + 1);
  assert.equal(menu.overflow, 'auto'); assert.ok(menu.scrollHeight > menu.clientHeight); assert.equal(menu.selectedVisible, true);
  await shot('p7-round-menu-320');
  await evaluate('document.querySelector("[aria-label=回放回合]").focus()');
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitForUi(evaluate, '(() => {const b=document.querySelector("[role=listbox]");return !b || !b.checkVisibility();})()', 'round menu escape');
  metrics.checks.push('round menu height/scroll/selected/escape');

  const targetBefore = (await evaluate('document.querySelector("[aria-label=目标玩家]").textContent')).trim();
  await evaluate('document.querySelector("[aria-label=回放玩家状态] button:nth-child(3)").click()');
  assert.equal(await evaluate('document.querySelector("[aria-label=回放玩家状态] button:nth-child(3)").getAttribute("aria-pressed")'), 'true');
  assert.equal((await evaluate('document.querySelector("[aria-label=目标玩家]").textContent')).trim(), targetBefore);
  await evaluate('document.getElementById("report-tab").click();document.getElementById("replay-tab").click()');
  await waitForUi(evaluate, 'document.getElementById("replay-panel").checkVisibility()', 'replay tab return');
  assert.equal(await evaluate('document.querySelector("[aria-label=回放玩家状态] button:nth-child(3)").getAttribute("aria-pressed")'), 'true');
  await evaluate('document.querySelector("[aria-label=目标玩家]").click()');
  await waitForUi(evaluate, 'document.querySelectorAll("[role=option]").length>0', 'target options');
  const changed = await evaluate('(() => {const box=[...document.querySelectorAll("[role=listbox]")].filter(b=>b.checkVisibility()).at(-1);const option=[...box.querySelectorAll("[role=option]")].find(o=>o.textContent.trim()!==' + JSON.stringify(targetBefore) + ');if(!option)return null;option.click();return option.textContent.trim();})()');
  assert.ok(changed);
  await waitForUi(evaluate, 'document.querySelector("[aria-label=目标玩家]").textContent.trim()===' + JSON.stringify(changed), 'target changed');
  await evaluate('document.getElementById("replay-tab").click()');
  await waitForUi(evaluate, 'document.getElementById("replay-panel").checkVisibility()', 'replay after external target');
  assert.equal(await evaluate('document.querySelector("[aria-label=回放玩家状态] button:nth-child(3)").getAttribute("aria-pressed")'), 'true');
  metrics.checks.push('replay player selection independent');

  const play = 'document.querySelector("[aria-label=播放回放]")', pause = 'document.querySelector("[aria-label=暂停回放]")';
  const playWidth = await evaluate(play + '.getBoundingClientRect().width');
  assert.ok(await evaluate(play + '.querySelector("svg") !== null'));
  assert.ok((await evaluate(play + '.textContent')).includes('播放'));
  await evaluate(play + '.click()');
  await waitForUi(evaluate, 'document.querySelector("[aria-label=暂停回放]") !== null', 'pause label');
  const pauseWidth = await evaluate(pause + '.getBoundingClientRect().width');
  assert.ok(Math.abs(playWidth - pauseWidth) <= 1, 'play/pause button width is stable');
  assert.ok(await evaluate(pause + '.querySelector("svg") !== null'));
  assert.ok((await evaluate(pause + '.textContent')).includes('暂停'));
  await evaluate(pause + '.click()');
  await waitForUi(evaluate, 'document.querySelector("[aria-label=播放回放]") !== null', 'play label after pause');
  assert.ok(Math.abs(await evaluate(play + '.getBoundingClientRect().width') - playWidth) <= 1);
  metrics.checks.push('play/pause icon, text and stable width');

  const seek = async value => {
    await evaluate('(()=>{const s=document.querySelector("[aria-label=回放进度]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(s,' + value + ');s.dispatchEvent(new Event("input",{bubbles:true}));})()');
    await wait(() => evaluate('Math.abs(Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)-' + value + ')<.01'), 'seek ' + value);
  };
  const chooseRound = async round => {
    await evaluate('document.querySelector("[aria-label=回放回合]").click()');
    await waitForUi(evaluate, 'Boolean([...document.querySelectorAll("[role=option]")].find(o=>o.textContent.trim()==="R' + round + '"))', 'round option R' + round);
    await evaluate('[...document.querySelectorAll("[role=option]")].find(o=>o.textContent.trim()==="R' + round + '").click()');
    await wait(() => evaluate('document.querySelector("[data-replay-session]").dataset.replayRound==="' + round + '"'), 'round R' + round + ' selected');
  };
  const setContinuous = async on => {
    const checked = await evaluate('document.querySelector("[role=switch]").checked');
    if (checked !== on) await evaluate('document.querySelector("[role=switch]").click()');
    assert.equal(await evaluate('document.querySelector("[role=switch]").checked'), on);
  };
  const first = meta.rounds[0], second = meta.rounds[1], last = meta.rounds.at(-1);
  await evaluate('document.querySelector("[aria-label=回放倍速]").click()');
  await waitForUi(evaluate, 'Boolean([...document.querySelectorAll("[role=option]")].find(o=>o.textContent.trim()==="2×"))', 'speed option');
  await evaluate('[...document.querySelectorAll("[role=option]")].find(o=>o.textContent.trim()==="2×").click()');
  await waitForUi(evaluate, 'document.querySelector("[aria-label=回放倍速]").textContent.includes("2×")', 'speed 2x');
  await setContinuous(false); await chooseRound(first.round); await seek(first.endTick - 8);
  await evaluate(play + '.click()');
  await waitForUi(evaluate, 'document.querySelector("[aria-label=播放回放]") !== null && document.querySelector("[data-replay-session]").dataset.replayRound==="' + first.round + '"', 'continuous off end');
  assert.ok(Number(await evaluate('document.querySelector("#replay-panel canvas[role=img]").dataset.tick')) >= first.endTick - 1);
  await setContinuous(true); await seek(first.endTick - 8);
  await evaluate(play + '.click()');
  await waitForUi(evaluate, 'document.querySelector("[data-replay-session]").dataset.replayRound==="' + second.round + '" && Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)>=' + second.startTick + ' && document.querySelector("[aria-label=暂停回放]") !== null', 'continuous next round');
  await evaluate(pause + '.click()');
  await waitForUi(evaluate, 'document.querySelector("[aria-label=播放回放]") !== null', 'paused after continuous');
  await seek(second.startTick + 10); await evaluate(play + '.click()');
  await wait(() => evaluate('Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)>' + (second.startTick + 20)), 'manual pause playback');
  await evaluate(pause + '.click()');
  await waitForUi(evaluate, 'document.querySelector("[aria-label=播放回放]") !== null', 'manual pause');
  const pausedTick = await evaluate('Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)');
  await delay(300);
  assert.equal(await evaluate('Number(document.querySelector("#replay-panel canvas[role=img]").dataset.tick)'), pausedTick);
  await chooseRound(last.round); await seek(last.endTick - 8); await evaluate(play + '.click()');
  await waitForUi(evaluate, 'document.querySelector("[aria-label=播放回放]") !== null && document.querySelector("[data-replay-session]").dataset.replayRound==="' + last.round + '"', 'last round stop');
  metrics.checks.push('continuous off/on, manual pause, last-round stop');
  await shot('p7-replay-last-round');

  await chooseRound(first.round); await seek(first.startTick);
  await evaluate(play + '.click()');
  await wait(() => evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayVisibleEvents)>0'), 'events appear while playing', 30000);
  await evaluate(pause + '.click()'); await waitForUi(evaluate, 'document.querySelector("[aria-label=播放回放]") !== null', 'event pause');
  const eventCount = await evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayVisibleEvents)');
  await delay(300);
  assert.equal(await evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayVisibleEvents)'), eventCount, 'pause does not append events');
  await shot('p7-replay-events');
  const middle = Math.floor((first.startTick + first.endTick) / 2);
  await seek(middle);
  await wait(() => evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayVisibleEvents)>=' + eventCount), 'forward seek retains occurred events', 15000);
  const middleCount = await evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayVisibleEvents)');
  await seek(first.startTick);
  const resetCount = await evaluate('Number(document.querySelector("[data-replay-session]").dataset.replayVisibleEvents)');
  assert.ok(resetCount <= middleCount, 'backward seek drops future events');
  const rail = await evaluate('(() => {const side=document.querySelector("[data-replay-rail]"), groups=side.children, player=groups[0], events=groups[1], list=events.querySelector("[aria-label=回放事件浏览]"), s=side.getBoundingClientRect(), p=player.getBoundingClientRect(), e=events.getBoundingClientRect();return {side:[s.top,s.bottom,s.height],player:[p.top,p.bottom,p.height],events:[e.top,e.bottom,e.height],overflow:getComputedStyle(list).overflowY,pageOverflow:document.documentElement.scrollHeight-innerHeight};})()');
  assert.ok(rail.events[2] > 0); assert.ok(rail.events[1] <= rail.side[1] + 1, 'event card fills the remaining rail height');
  assert.equal(rail.overflow, 'auto'); assert.ok(rail.pageOverflow <= 1);
  metrics.checks.push('incremental events, pause/seek reset, rail flex height');

  await evaluate('document.getElementById("heatmap-tab").click()');
  await wait(() => evaluate('document.querySelector("[data-heatmap-session]") && document.querySelector("[data-heatmap-session]").dataset.heatmapEnabled==="positions"'), 'heatmap default position layer', 30000);
  assert.equal(await evaluate('document.querySelector("[aria-label=玩家位置密度]").getAttribute("aria-pressed")'), 'true');
  assert.equal(await evaluate('document.querySelector("[aria-label=击杀位置]").getAttribute("aria-pressed")'), 'false');
  assert.equal(await evaluate('document.querySelector("[aria-label=死亡位置]").getAttribute("aria-pressed")'), 'false');
  await evaluate('document.querySelector("[aria-label=玩家位置密度]").click()');
  await settleUi(evaluate, 'position layer off');
  await evaluate('document.getElementById("report-tab").click();document.getElementById("heatmap-tab").click()');
  await settleUi(evaluate, 'heatmap tab return');
  assert.equal(await evaluate('document.querySelector("[aria-label=玩家位置密度]").getAttribute("aria-pressed")'), 'false', 'tab return does not re-enable a manually closed position layer');
  const heatmapText = await evaluate('document.getElementById("heatmap-panel").innerText');
  assert.ok(heatmapText.includes('地图版本未确认')); assert.equal(heatmapText.includes('仅示意'), false);
  await evaluate('document.querySelector("[aria-label=热力图回合]").click()');
  await waitForUi(evaluate, 'Boolean([...document.querySelectorAll("[role=listbox]")].at(-1)?.querySelector("[role=option]"))', 'heatmap round menu');
  const heatmapMenu = await evaluate('(() => {const box=[...document.querySelectorAll("[role=listbox]")].at(-1),r=box.getBoundingClientRect();return {height:r.height,options:box.querySelectorAll("[role=option]").length,overflow:getComputedStyle(box).overflowY,scrollHeight:box.scrollHeight,clientHeight:box.clientHeight};})()');
  assert.ok(heatmapMenu.height <= 320.5); assert.equal(heatmapMenu.overflow, 'auto'); assert.ok(heatmapMenu.options >= 20);
  await evaluate('document.querySelector("[aria-label=热力图回合]").focus()');
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitForUi(evaluate, '(() => {const b=document.querySelector("[role=listbox]");return !b || !b.checkVisibility();})()', 'heatmap round menu escape');
  await evaluate('document.querySelector("[aria-label=玩家位置密度]").click()');
  await wait(() => evaluate('Boolean(document.querySelector("[data-heatmap-stats=positions]"))'), 'positions stats after re-enable', 30000);
  await shot('p7-heatmap-default-positions');
  metrics.checks.push('heatmap default positions, tab-return persistence, round menu, label');

  for (const [width, height] of [[1024, 640], [1920, 1032]]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitForUi(evaluate, 'innerWidth===' + width + ' && innerHeight===' + height, 'viewport ' + width);
    await settleUi(evaluate, 'layout ' + width);
    assert.equal(await evaluate('document.documentElement.scrollHeight-innerHeight <= 1'), true);
    await evaluate('document.getElementById("replay-tab").click()');
    await settleUi(evaluate, 'replay ' + width);
    const compact = await evaluate('(() => {const side=document.querySelector("[data-replay-rail]"),groups=side.children,list=groups[1].querySelector("[aria-label=回放事件浏览]");return {eventsHeight:groups[1].getBoundingClientRect().height,listHeight:list.clientHeight,playerHeight:groups[0].getBoundingClientRect().height,sideHeight:side.getBoundingClientRect().height,playerMax:getComputedStyle(document.querySelector("[aria-label=回放玩家状态]")).maxHeight,playerBottom:groups[0].getBoundingClientRect().bottom,eventsTop:groups[1].getBoundingClientRect().top};})()');
    assert.ok(compact.eventsHeight >= 90, 'key events card keeps usable height at ' + width + 'x' + height);
    assert.ok(compact.listHeight >= 24, 'key events list keeps a usable scroll viewport at ' + width + 'x' + height);
    assert.ok(compact.playerBottom <= compact.eventsTop + 1);
    await shot('p7-replay-' + width + 'x' + height);
    await evaluate('document.getElementById("heatmap-tab").click()');
    await settleUi(evaluate, 'heatmap ' + width);
    await shot('p7-heatmap-' + width + 'x' + height);
    metrics.checks.push('layout ' + width + 'x' + height);
  }
  await page.send('Emulation.clearDeviceMetricsOverride');
  // A failed next-round load must stop continuous switching and surface a retryable error.
  await evaluate('document.getElementById("replay-tab").click()');
  await settleUi(evaluate, 'replay before failure check');
  await chooseRound(first.round); await setContinuous(true); await seek(first.endTick - 8);
  await evaluate('window.cs2Analyst.replay.release(document.querySelector("[data-replay-session]").dataset.replaySession)');
  await evaluate(play + '.click()');
  await wait(() => evaluate('document.querySelector("[data-replay-session]").dataset.replayRound==="' + second.round + '" && Boolean(document.querySelector("[role=alert]")) && Boolean(document.querySelector("[aria-label=播放回放]"))'), 'auto-switch failure stops', 15000);
  const failureText = await evaluate('document.querySelector("[role=alert]").innerText');
  assert.ok(/无效|结束|不可用/.test(failureText), 'a retryable failure is shown');
  assert.ok(await evaluate('[...document.querySelectorAll("[role=alert] button")].some(b=>b.textContent.includes("重试"))'));
  await shot('p7-continuous-failure');
  metrics.checks.push('failed next-round load stops auto-switch with retry');
  assert.deepEqual(exceptions, []);
  metrics.status = 'PASS';
} catch (error) {
  failure = new Error('P7 UI acceptance failed\n' + logs, { cause: error });
  metrics.status = 'FAIL'; metrics.error = String(error.stack || error);
  if (page) try { await shot('p7-failure'); } catch {}
} finally {
  writeFileSync(join(qa, 'p7-ui-acceptance.json'), JSON.stringify(metrics, null, 2) + '\n');
  await withCleanup(() => { if (failure) throw failure; }, [
    async () => { if (page) await closeApp({ child, evaluate: page.evaluate, socket: page.socket }); },
    () => { page?.socket.close(); },
    () => scope.cleanup(),
    async () => { assert.ok(profile.startsWith(profilePrefix)); await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); },
  ]);
}
console.log(JSON.stringify({ status: metrics.status, checks: metrics.checks, screenshots: metrics.screenshots }));
