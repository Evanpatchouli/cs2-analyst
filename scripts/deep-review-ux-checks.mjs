import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Runtime-only fixtures through React's existing report props; no shipped test seam. */
export async function checkDeepReviewUx(evaluate, send, qaDir) {
  const settle = () => delay(150);
  const screenshot = async name => {
    if (!qaDir) return;
    await delay(350);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(qaDir, name + '.png'), Buffer.from(shot.data, 'base64'));
  };
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[role="tab"]')].map(t => t.querySelector('.fui-Tab__content').textContent)`), ['深度复盘', '比赛报告', '回合时间线', '分析']);
  assert.equal(await evaluate(`document.querySelectorAll('[role="tabpanel"]').length`), 4);
  // Find the actual report consumed by this Renderer. Fixtures mutate only this QA process.
  assert.equal(await evaluate(`(() => {
    const node = document.getElementById('deep-review-panel');
    let fiber = node[Object.keys(node).find(k => k.startsWith('__reactFiber$'))];
    while (fiber && !fiber.memoizedProps?.report?.deepReview) fiber = fiber.return;
    if (!fiber) return false;
    window.__qaReport = fiber.memoizedProps.report;
    window.__qaDeepOriginal = window.__qaReport.deepReview;
    return true;
  })()`), true);
  const refresh = async () => {
    await evaluate(`document.getElementById('report-tab').click()`); await settle();
    await evaluate(`document.getElementById('deep-review-tab').click()`); await settle();
  };
  const select = async name => {
    await evaluate(`document.querySelector('[aria-label="目标玩家"]').click()`); await settle();
    assert.equal(await evaluate(`(() => { const o = [...document.querySelectorAll('[role="option"]')].find(o => o.textContent === ${JSON.stringify(name)}); o?.click(); return Boolean(o); })()`), true);
    await settle();
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
  // Prefer a real player with all three kinds for the default screenshot.
  const real = await evaluate(`(() => { const p = window.__qaReport.deepReview.players.find(p => p.reviews.length && p.highlights.length && p.contexts.length); return p ? window.__qaReport.players.find(x => x.id === p.playerId).nickname : null; })()`);
  if (real) await select(real);
  await evaluate(`document.querySelector('[data-app-content]').scrollTo(0, 0)`);
  await screenshot('deep-review-real-default');
  if (real) assert.deepEqual(await evaluate(`[...document.querySelectorAll('#deep-review-panel [data-deep-kind]')].map(c => c.dataset.deepKind).filter((kind, index, all) => all.indexOf(kind) === index)`), ['review', 'highlight', 'context']);
  const partial = await evaluate(`Boolean(document.querySelector('#deep-review-panel [data-deep-kind] details'))`);
  if (partial) {
    await evaluate(`const d = document.querySelector('#deep-review-panel [data-deep-kind] details'); d.open = true; d.scrollIntoView({ block: 'center' })`);
    await screenshot('deep-review-real-caveat');
  }
  await evaluate(`document.querySelector('#deep-review-panel [data-deep-rounds]')?.click()`);
  await settle();
  await screenshot('deep-review-real-timeline');
  await evaluate(`document.getElementById('deep-review-tab').click()`);
  await settle();
  await select('twinkle');
  const id = await evaluate(`document.querySelector('[data-deep-player]').dataset.deepPlayer`);
  // Synthetic A+B+D, with technical decoys to catch accidental visible ref rendering.
  await evaluate(`(() => {
    const f = kind => ({ id: kind, ruleId: 'deep.synthetic.' + kind, category: kind === 'review' ? 'execution' : kind === 'highlight' ? 'impact' : 'teamplay', kind,
      title: ({ review: '未观察到确认反向接触', highlight: '多杀人数变化', context: '同一交火中的团队接触上下文' })[kind],
      summary: '合成 UX 场景：仅验证展示与回合定位，不构成真实比赛结论。', occurrences: 6, eligibleOccurrences: 10,
      relatedRounds: [7, 24], evidenceQuality: kind === 'review' ? 'partial' : 'complete', caveats: ['这不证明枪法评分、错误站位或正式补枪机会。'],
      evidenceRefs: [{ engagementId: 'SECRET-ENGAGEMENT', eventIndex: 987654, tick: 876543, playerId: '76561198099999999' }] });
    window.__qaReport.deepReview = { available: true, players: window.__qaDeepOriginal.players.map(p => p.playerId === ${JSON.stringify(id)}
      ? { playerId: p.playerId, coverage: { status: 'partial' }, reviews: [f('review')], highlights: [f('highlight')], contexts: [f('context')] } : p) };
  })()`);
  await refresh();
  await evaluate(`document.querySelector('[data-app-content]').scrollTo(0, 0)`);
  const text = await evaluate(`document.getElementById('deep-review-panel').textContent`);
  for (const expected of ['复盘重点', '亮点', '上下文', '部分证据', '证据边界', '6 / 10']) assert.ok(text.includes(expected), expected);
  for (const raw of ['SECRET-ENGAGEMENT', '987654', '876543', '76561198099999999', 'eventIndex']) assert.ok(!text.includes(raw), raw);
  const colors = await evaluate(`[...document.querySelectorAll('[data-deep-label]')].map(b => ({ kind: b.dataset.deepLabel, color: getComputedStyle(b).color }))`);
  assert.equal(new Set(colors.map(b => b.color)).size, 3);
  assert.equal(colors.find(b => b.kind === 'context').color, 'rgb(143, 157, 176)', 'context uses neutral foreground');
  assert.ok(await evaluate(`![...document.querySelectorAll('#deep-review-panel details')].some(d => d.open)`));
  await screenshot('deep-review-synthetic-three-kinds');
  await evaluate(`document.querySelector('#deep-review-panel details').open = true`);
  await screenshot('deep-review-synthetic-partial-caveat');
  await evaluate(`(() => {
    const original = Element.prototype.scrollIntoView;
    window.__qaScroll = null; window.__qaRestoreScroll = () => { Element.prototype.scrollIntoView = original; };
    Element.prototype.scrollIntoView = function(options) {
      if (this.id.startsWith('round-r')) window.__qaScroll = { id: this.id, visible: !document.getElementById('timeline-panel').hidden,
        expanded: [7, 24].map(r => document.querySelector('[data-round-summary="' + r + '"]').getAttribute('aria-expanded')) };
      return original.call(this, options);
    };
    document.querySelector('[data-deep-rounds]').click();
  })()`);
  await settle();
  assert.deepEqual(await evaluate('window.__qaScroll'), { id: 'round-r7', visible: true, expanded: ['true', 'true'] });
  assert.equal(await evaluate(`document.getElementById('round-r7').dataset.highlighted`), 'true');
  await screenshot('deep-review-synthetic-timeline-occurrences');
  await evaluate(`window.__qaRestoreScroll(); delete window.__qaRestoreScroll; delete window.__qaScroll`);
  await select('tarkz');
  assert.notEqual(await evaluate(`document.querySelector('[data-deep-player]').dataset.deepPlayer`), id);
  assert.ok(await evaluate(`!document.getElementById('deep-review-panel').textContent.includes('合成 UX 场景')`));
  await select('twinkle');
  await evaluate(`(() => { const p = window.__qaReport.deepReview.players.find(p => p.playerId === ${JSON.stringify(id)}); p.reviews = []; p.highlights = []; p.contexts = []; p.coverage.status = 'complete'; })()`);
  await refresh();
  assert.ok(await evaluate(`document.getElementById('deep-review-panel').textContent.includes('本场没有达到 Deep Review 规则阈值且证据充分的结论。')`));
  assert.equal(await evaluate(`document.querySelectorAll('#deep-review-panel [data-deep-kind]').length`), 0);
  // Restore real data and collapsed rounds for the historical checks following this test.
  await evaluate(`window.__qaReport.deepReview = window.__qaDeepOriginal; delete window.__qaDeepOriginal; delete window.__qaReport`);
  await refresh();
  for (const [width, height] of [[900, 760], [800, 600], [650, 760]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await settle();
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`), true);
    assert.equal(await evaluate(`document.getElementById('deep-review-panel').scrollWidth <= document.getElementById('deep-review-panel').clientWidth`), true);
    await evaluate(`document.querySelector('[data-app-content]').scrollTo(0, 0)`);
    await screenshot('deep-review-real-' + width);
  }
  await evaluate(`[...document.querySelectorAll('[data-round-summary][aria-expanded="true"]')].forEach(b => b.click())`);
  await send('Emulation.clearDeviceMetricsOverride');
}
