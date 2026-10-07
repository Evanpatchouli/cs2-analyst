import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Shared CDP assertions for built and installed renderers, after demo1 import. */
export async function checkReportUx(evaluate, send, qaDir) {
  // Wait in Node: occluded Electron windows can pause renderer animation frames.
  const settle = () => delay(100);
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await evaluate(`document.getElementById('report-tab').click()`);
  await settle();
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[role="tab"]')].map(t => t.querySelector('.fui-Tab__content').textContent)`), ['比赛报告', '回合时间线', '分析']);
  assert.equal(await evaluate(`document.querySelectorAll('[role="tabpanel"]').length`), 3);
  assert.equal(await evaluate(`document.getElementById('report-panel').hidden`), false);
  // Native summary retains keyboard activation and clear focus feedback.
  const summary = await evaluate(`(() => { const s = document.querySelector('summary'); s.focus(); return { cursor: getComputedStyle(s).cursor, focused: document.activeElement === s }; })()`);
  assert.equal(summary.cursor, 'pointer');
  assert.equal(summary.focused, true);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  assert.equal(await evaluate(`document.querySelector('details').open`), true);
  assert.equal(await evaluate(`document.querySelector('summary').matches(':focus-visible')`), true);
  assert.ok(await evaluate(`parseFloat(getComputedStyle(document.querySelector('summary')).outlineWidth) >= 2`));
  await evaluate(`document.querySelector('details').open = false; document.activeElement.blur()`);
  const hover = await evaluate(`(() => { const s = document.querySelector('summary'); s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...hover });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('summary')).backgroundColor`), 'rgb(34, 43, 54)');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
  // Observe scrolling itself: the destination must be visible and expanded at call time.
  await evaluate(`(() => { const original = Element.prototype.scrollIntoView; window.__roundScroll = null;
    window.__restoreRoundScroll = () => { Element.prototype.scrollIntoView = original; };
    Element.prototype.scrollIntoView = function(options) {
      if (this.id === 'round-r24') window.__roundScroll = { visible: !document.getElementById('timeline-panel').hidden, expanded: this.querySelector('button').getAttribute('aria-expanded') };
      return original.call(this, options);
    };
    [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '查看 R24').click();
  })()`);
  await settle();
  assert.deepEqual(await evaluate('window.__roundScroll'), { visible: true, expanded: 'true' });
  await evaluate('window.__restoreRoundScroll(); delete window.__restoreRoundScroll; delete window.__roundScroll');
  assert.equal(await evaluate(`document.querySelector('[data-timeline-round="24"]').dataset.highlighted`), 'true');
  const kills = await evaluate(`([...document.querySelectorAll('[data-round-detail="24"] [data-killfeed-event="kill"]')].map(r => ({ attacker: r.querySelector('[data-killfeed-attacker]').textContent, victim: r.querySelector('[data-killfeed-victim]').textContent, weapon: r.querySelector('[data-killfeed-weapon]').dataset.killfeedWeapon, label: r.getAttribute('aria-label'), icons: r.querySelectorAll('img').length })))`);
  assert.equal(kills.length, 4);
  assert.ok(kills.every(k => k.attacker === 'twinkle' && k.icons >= 1));
  assert.ok(kills.some(k => k.weapon === 'ak47' && k.victim === 'tarkz' && k.label.includes('122.20 秒')));
  assert.ok(kills.some(k => k.victim === '8888888888888888888888'));
  assert.equal(await evaluate(`document.querySelector('[data-round-detail="24"]').textContent.includes('→')`), false);
  await evaluate(`(() => { const b = document.querySelector('[data-round-summary="22"]'); if (b.getAttribute('aria-expanded') === 'false') b.click(); })()`);
  await settle();
  const posthumous = await evaluate(`([...document.querySelectorAll('[data-round-detail="22"] [data-killfeed-event="death"]')].map(r => ({ attacker: r.querySelector('[data-killfeed-attacker]').textContent, victim: r.querySelector('[data-killfeed-victim]').textContent, weapon: r.querySelector('[data-killfeed-weapon]').dataset.killfeedWeapon, label: r.getAttribute('aria-label') })))`);
  assert.ok(posthumous.some(k => k.attacker === 'tarkz' && k.victim === 'twinkle' && k.weapon === 'hegrenade' && k.label.includes('32.78 秒')));
  // R24 has no headshot flag; R23 contains a real headshot death for twinkle.
  await evaluate(`(() => { const b = document.querySelector('[data-round-summary="23"]'); if (b.getAttribute('aria-expanded') === 'false') b.click(); })()`);
  await settle();
  const images = await evaluate(`Promise.all([...document.querySelectorAll('[data-round-detail="24"] img, [data-round-detail="22"] img, [data-round-detail="23"] img')].map(async i => { await i.decode(); const r = i.getBoundingClientRect(); return { round: i.closest('[data-round-detail]').dataset.roundDetail, icon: i.dataset.killfeedIcon, src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0, fit: getComputedStyle(i).objectFit, height: r.height, width: r.width, alt: i.alt }; }))`);
  for (const [icon, file] of [['ak47', 'ak47'], ['inferno', 'inferno'], ['hegrenade', 'hegrenade'], ['headshot', 'icon_headshot'], ['flash', 'flashbang_assist']]) {
    assert.ok(images.some(i => i.icon === icon && i.src.includes(file + '-') && i.loaded), icon + ' official asset must load');
  }
  assert.ok(images.some(i => i.round === '23' && i.icon === 'headshot' && i.loaded), 'R23 official headshot');
  assert.ok(images.some(i => i.round === '22' && i.icon === 'flash' && i.loaded), 'R22 official flash assist');
  assert.ok(images.every(i => i.loaded && i.fit === 'contain' && i.height === 22 && i.width <= 96 && i.alt === ''));
  await evaluate(`document.getElementById('analysis-tab').click()`);
  await settle();
  const colors = await evaluate(`([...document.querySelectorAll('[data-comparison-player]')].map(r => ({ current: r.textContent.includes('· 当前'), name: getComputedStyle(r.firstElementChild).color, bar: r.children[1].firstElementChild ? getComputedStyle(r.children[1].firstElementChild).backgroundColor : null })))`);
  assert.ok(colors.some(c => c.current && c.name === 'rgb(98, 171, 245)' && c.bar === c.name));
  assert.ok(colors.filter(c => !c.current).every(c => c.name !== 'rgb(98, 171, 245)' && c.bar !== 'rgb(98, 171, 245)'));
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-multi-kill]')].map(e => e.textContent)`), ['双杀 6', '三杀 1', '四杀 1']);
  assert.equal(await evaluate(`document.getElementById('analysis-panel').textContent.includes('最大柱')`), false);
  // Select a non-default metric and confirm every mounted panel keeps its local state.
  await evaluate(`document.querySelector('[aria-label="对比指标"]').click()`);
  await settle();
  await evaluate(`[...document.querySelectorAll('[role="option"]')].find(o => o.textContent.trim() === 'K/D').click()`);
  await settle();
  const player = await evaluate(`document.querySelector('[aria-label="目标玩家"]').textContent`);
  await evaluate(`document.getElementById('timeline-tab').click()`);
  await settle();
  assert.equal(await evaluate(`document.querySelector('[data-round-summary="24"]').getAttribute('aria-expanded')`), 'true');
  await evaluate(`document.getElementById('analysis-tab').click()`);
  await settle();
  assert.equal(await evaluate(`document.querySelector('[aria-label="对比指标"]').textContent`), 'K/D');
  assert.equal(await evaluate(`document.querySelector('[aria-label="目标玩家"]').textContent`), player);
  const screenshot = async name => {
    if (!qaDir) return;
    await delay(350);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(qaDir, name + '.png'), Buffer.from(shot.data, 'base64'));
  };
  for (const [width, height] of [[1280, 900], [900, 760], [800, 600], [650, 760]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await settle();
    const divider = await evaluate(`(() => { const s = getComputedStyle(document.querySelector('[data-side-divider]')); return { display: s.display, top: s.marginTop, bottom: s.marginBottom, width: s.width }; })()`);
    if (width <= 650) assert.equal(divider.display, 'none');
    else { assert.notEqual(divider.display, 'none'); assert.equal(divider.top, '16px'); assert.equal(divider.bottom, '16px'); assert.equal(divider.width, '1px'); }
    await evaluate('window.scrollTo(0, 0)');
    await screenshot(`comparison-${width}`);
    await evaluate(`document.querySelector('[aria-label="回合表现趋势"]').scrollIntoView({ block: 'start' })`);
    await screenshot(`trend-sides-${width}`);
    await evaluate(`document.getElementById('timeline-tab').click()`);
    await settle();
    await evaluate(`document.getElementById('round-r24').scrollIntoView({ block: 'center' })`);
    await screenshot(`killfeed-r24-${width}`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true, 'Timeline 整页不得溢出');
    const layout = await evaluate(`([...document.querySelectorAll('[data-round-detail="24"] [data-killfeed-event]')].map(r => { const i=r.querySelector('[data-killfeed-weapon]'); const n=r.querySelector('[data-killfeed-victim]'); return { icon: i.getBoundingClientRect().width, name: getComputedStyle(n).textOverflow }; }))`);
    assert.ok(layout.every(r => r.icon >= 22 && r.name === 'ellipsis'));
    await evaluate(`document.getElementById('round-r22').scrollIntoView({ block: 'center' })`);
    await screenshot(`killfeed-r22-${width}`);
    await evaluate(`document.getElementById('round-r23').scrollIntoView({ block: 'center' })`);
    await screenshot(`killfeed-headshot-r23-${width}`);
    await evaluate(`document.getElementById('report-tab').click(); window.scrollTo(0, 0)`);
    await settle();
    await screenshot(`report-tabs-${width}`);
    await evaluate(`document.querySelector('summary').scrollIntoView({ block: 'center' }); document.querySelector('summary').focus()`);
    await screenshot(`finding-evidence-${width}`);
    await evaluate(`document.getElementById('analysis-tab').click()`);
    await settle();
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'Analysis 整页不得溢出');
  }
  await send('Emulation.clearDeviceMetricsOverride');
  await evaluate(`document.getElementById('report-tab').click()`);
  await settle();
}
