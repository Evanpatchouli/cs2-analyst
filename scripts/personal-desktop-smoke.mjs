import { checkDeepReviewUx } from './deep-review-ux-checks.mjs';
import { checkReportUx } from './report-ux-checks.mjs';
import { checkWindowShell } from './window-shell-checks.mjs';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const desktop = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const demo = fileURLToPath(new URL('../.demo/demo1.dem', import.meta.url));
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const electron = require('electron');

assert.ok(existsSync(demo), `缺少测试 DEM：${demo}`);
assert.ok(existsSync(join(desktop, 'dist/electron/main.js')), '请先构建桌面应用（electron-vite build）');

/** P5.2.1 product polish: these tokens must never reach the rendered UI. */
const STIFF_ENGLISH = [/\bUtility\b/, /\bFlash\b/, /\bSmoke\b/, /\bHE\b/, /\bIncendiary\b/, /\bMolotov\b/, /\bDecoy\b/, /\bduration\b/i, /\btraded\b/i, /\btradeable\b/i, /可交易/, /被交易/, /\bwin\b/, /\bloss\b/];
function assertNoStiffEnglish(text) {
  for (const pattern of STIFF_ENGLISH) assert.ok(!pattern.test(text), 'UI 出现生硬英文或旧术语：' + pattern);
}

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitFor(probe, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await delay(250);
  }
  throw new Error(`等待 ${label} 超时`);
}

/** Launches the built app with CS2_ANALYST_DEM_PATH so the import skips the native dialog. */
async function scenario({ label, demPath, ready, assertReport, assertDom }) {
  const port = await freePort();
  const env = { ...process.env, CS2_ANALYST_DEM_PATH: demPath };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const profile = mkdtempSync(join(tmpdir(), 'cs2-analyst-report-profile-'));
  const child = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows'], {
    cwd: desktop, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  let socket;
  try {
    let page;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`应用提前退出：${logs}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
        page = (await response.json()).find(target => target.type === 'page');
        if (page?.webSocketDebuggerUrl) break;
      } catch { /* Electron 尚未开放调试端口。 */ }
      await delay(200);
    }
    assert.ok(page?.webSocketDebuggerUrl, `等待窗口超时：${logs}`);
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let id = 0;
    const errors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params);
    });
    const send = (method, params = {}) => {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.removeEventListener('message', onMessage); reject(new Error(`${method} 超时`)); }, 20_000);
        function onMessage(event) {
          const message = JSON.parse(event.data);
          if (message.id !== requestId) return;
          clearTimeout(timer);
          socket.removeEventListener('message', onMessage);
          if (message.error) reject(new Error(JSON.stringify(message.error)));
          else resolve(message.result);
        }
        socket.addEventListener('message', onMessage);
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    };
    const evaluate = async expression => {
      try { return (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value; }
      catch (error) { throw new Error(`CDP evaluate: ${expression.slice(0, 200)}`, { cause: error }); }
    };
    await send('Runtime.enable');
    await send('Page.enable');

    const shell = await waitFor(async () => {
      const state = await evaluate('({ ready: document.readyState, text: document.body.textContent, node: typeof window.require, version: window.cs2Analyst?.version })');
      return state?.ready === 'complete' && state.text?.includes('CS2 Analyst') ? state : null;
    }, 30_000, 'React 页面');
    assert.equal(shell.node, 'undefined', '渲染进程不应暴露 Node.js');
    assert.equal(shell.version, '0.1.0', 'preload 桥接未加载');
    await checkWindowShell(evaluate, send);

    const clicked = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('选择 DEM')); b?.click(); return Boolean(b); })()`);
    assert.equal(clicked, true, '未找到“选择 DEM”按钮');
    const body = await waitFor(async () => {
      const text = await evaluate('document.body.textContent');
      return ready(text) ? text : null;
    }, 120_000, label);
    assertReport(body);
    assertNoStiffEnglish(body);
    await assertDom?.(evaluate, send);
    assert.deepEqual(errors, [], '页面存在未捕获异常');
    console.log(`${label}：通过`);

    void evaluate(`document.querySelector('[data-window-control="close"]').click()`).catch(() => {});
    await waitFor(async () => child.exitCode !== null, 30_000, '应用正常退出');
    assert.equal(child.exitCode, 0, '关闭窗口后应用未正常退出');
  } catch (error) {
    throw new Error(`${label} 失败
${logs}`, { cause: error });
  } finally {
    socket?.close();
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill();
    }
    // Windows helpers may briefly hold profile handles after the parent exits.
    // Keep cleanup from masking the assertion that caused the scenario to fail.
    for (let attempt = 0; attempt < 10; attempt++) {
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); break; }
      catch (error) {
        if (attempt === 9) console.warn(`临时 profile 清理失败：${error.message}`);
        else await delay(500);
      }
    }
  }
}


const qaDir=fileURLToPath(new URL('../.tmp/personal-qa/',import.meta.url));
const {mkdir}=await import('node:fs/promises');await mkdir(qaDir,{recursive:true});
const acceptance=JSON.parse((await import('node:fs')).readFileSync(new URL('../docs/deep-review-personal-acceptance.json',import.meta.url),'utf8'));
for(const fixture of acceptance.fixtures) {
 const filename=fixture.identity.filename.split('/').at(-1),nickname=fixture.target.player?.nickname??null;
 await scenario({label:filename+' personal Desktop',demPath:fileURLToPath(new URL('../.demo/'+filename,import.meta.url)),
 ready:text=>text.includes('重新选择 DEM'),
 assertReport:text=>{for(const x of ['比赛报告','深度复盘','回合时间线','分析'])assert.ok(text.includes(x));},
 assertDom:async(evaluate,send)=>{
  assert.equal(await evaluate(`document.getElementById('report-panel').hidden`),false);
  const select=async name=>{await evaluate(`document.querySelector('[aria-label="目标玩家"]').click()`);await delay(100);assert.ok(await evaluate(`(()=>{const o=[...document.querySelectorAll('[role="option"]')].find(o=>o.textContent.trim()===${JSON.stringify(name.trim())});o?.click();return !!o;})()`));await delay(150);};
  if(nickname)await select(nickname);
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1800,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await evaluate(`document.getElementById('deep-review-tab').click()`);await delay(200);
  assert.equal(await evaluate(`document.getElementById('deep-review-panel').hidden`),false);
  if(nickname)assert.equal(await evaluate(`document.querySelector('[data-deep-player]').dataset.deepPlayer`),fixture.target.player.id);
  if(!nickname){console.log(filename+': target absent; no substitute-player screenshot');return;}
  const text=await evaluate(`document.getElementById('deep-review-panel').textContent`);
  for(const x of ['优先复盘','亮点','补充观察'])assert.ok(text.includes(x));
  for(const x of ['Engagement','direct contact','eventIndex','coverage','fireEvidence','received-first','same-tick','denominator','linkage'])assert.ok(!text.includes(x));
  await evaluate(`document.querySelector('[data-app-content]').scrollTo(0,0)`);await delay(300);
  const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(qaDir,filename.replace('.dem','')+'-deep-review.png'),Buffer.from(shot.data,'base64'));
  const details=await evaluate(`(()=>{const d=document.querySelector('#deep-review-panel details');if(!d)return null;const before=d.open;d.querySelector('summary').click();return {before,after:d.open,text:d.textContent};})()`);
  if(details){assert.equal(details.before,false);assert.equal(details.after,true);assert.ok(details.text.includes('说明与限制'));}
  const rounds=await evaluate(`(()=>{const b=document.querySelector('#deep-review-panel [data-deep-rounds]');if(!b)return [];const r=b.dataset.deepRounds.split(',').map(Number);b.click();return r;})()`);
  if(rounds.length){await delay(200);assert.equal(await evaluate(`document.getElementById('timeline-panel').hidden`),false);
   for(const r of rounds){assert.equal(await evaluate(`document.querySelector('[data-round-summary="${r}"]').getAttribute('aria-expanded')`),'true');assert.ok((await evaluate(`document.querySelector('[data-round-detail="${r}"]').textContent`)).length>0);}
   const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(qaDir,filename.replace('.dem','')+'-timeline.png'),Buffer.from(shot.data,'base64'));
  }
  await evaluate(`document.getElementById('deep-review-tab').click()`);await delay(100);
  await evaluate(`document.querySelector('[aria-label="目标玩家"]').click()`);await delay(100);
  assert.ok(await evaluate(`(()=>{const o=[...document.querySelectorAll('[role="option"]')].find(o=>o.textContent.trim()!==${JSON.stringify(nickname.trim())});o?.click();return !!o;})()`));await delay(150);
  assert.notEqual(await evaluate(`document.querySelector('[data-deep-player]').dataset.deepPlayer`),fixture.target.player.id);
  if(nickname)await select(nickname);assert.equal(await evaluate(`document.querySelector('[data-deep-player]').dataset.deepPlayer`),fixture.target.player.id);
 }});
}
