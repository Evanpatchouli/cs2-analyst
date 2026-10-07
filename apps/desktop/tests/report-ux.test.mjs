import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks, createRequire } from 'node:module';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';

// Transform the actual TSX components in memory, without adding a test build or UI seam.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve('vite'))('esbuild');
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') && context.parentURL?.includes('/renderer/src/')) {
    for (const extension of ['.tsx', '.ts']) {
      const url = new URL(specifier + extension, context.parentURL);
      if (existsSync(url)) return nextResolve(url.href, context);
    }
  }
  return nextResolve(specifier, context);
}, load(url, context, nextLoad) {
  if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true,
    source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'tsx', jsx: 'automatic', format: 'esm' }).code };
  return nextLoad(url, context);
} });
const { KillFeedEvent } = await import('../renderer/src/killfeed-event.tsx');
const { WeaponIcon, weaponLabels } = await import('../renderer/src/killfeed-icons.tsx');
const { AnalysisViews } = await import('../renderer/src/analysis-views.tsx');
const render = element => renderToStaticMarkup(createElement(SSRProvider, null, element));

test('kill feed renders flags only when true, fallback weapon and complete accessible text', () => {
  const event = { id: 'synthetic', type: 'kill', tick: 100, roundTimeSeconds: 122.2,
    actorId: '1', actorName: ' twinkle ', targetId: '2', targetName: '8'.repeat(40), weapon: 'unrecognized_weapon' };
  for (const headshot of [undefined, false, true]) {
    const html = render(createElement(KillFeedEvent, { event: { ...event, headshot, assistedFlash: headshot }, round: 24 }));
    assert.ok(html.includes('data-killfeed-icon="generic"'));
    assert.ok(html.includes('使用 unrecognized_weapon 击杀'));
    assert.ok(html.includes('R24 回合开始后 122.20 秒'));
    assert.ok(html.includes(' twinkle ') && html.includes(event.targetName));
    assert.equal(html.includes('data-killfeed-icon="headshot"'), headshot === true);
    assert.equal(html.includes('data-killfeed-icon="flash"'), headshot === true);
    assert.ok(!html.includes('→'));
  }
  const world = render(createElement(KillFeedEvent, { event: { ...event, actorId: undefined, actorName: undefined }, round: 1 }));
  assert.ok(world.includes('世界伤害 / 无已知攻击者'));
  assert.ok(world.includes('data-killfeed-icon="world"'));
  assert.ok(world.includes('阵亡'));
});

test('known weapons and common knife variants have monochrome non-generic silhouettes', () => {
  for (const weapon of [...Object.keys(weaponLabels), 'knife_m9_bayonet', 'knife_tactical', 'knife_falchion', 'knife_push', 'knife_survival_bowie', 'knife_ursus', 'knife_stiletto', 'knife_widowmaker', 'knife_skeleton', 'knife_kukri']) {
    const html = renderToStaticMarkup(createElement(WeaponIcon, { weapon }));
    assert.ok(!html.includes('data-killfeed-icon="generic"'), weapon);
    assert.ok(html.includes('fill="currentColor"') && html.includes('aria-hidden="true"'));
  }
});

test('multi-kill summary omits zeros and the whole empty group, retaining five-or-more wording', () => {
  const side = { roundsPlayed: 1, kills: 0, deaths: 0, assists: 0, adr: null };
  const renderSummary = multiKills => render(createElement(AnalysisViews, { playerId: '1', analysis: {
    players: [], perPlayer: [{ playerId: '1', multiKills, roundTrend: [], sideSplit: { CT: side, T: side } }],
  } }));
  const empty = renderSummary({ double: 0, triple: 0, quad: 0, fivePlus: 0 });
  assert.ok(!empty.includes('多杀回合统计'));
  const mixed = renderSummary({ double: 3, triple: 0, quad: 1, fivePlus: 2 });
  assert.ok(mixed.includes('双杀 3') && mixed.includes('四杀 1') && mixed.includes('五杀+ 2'));
  assert.ok(!mixed.includes('data-multi-kill="triple"'));
  assert.ok(!mixed.includes('最大柱'));
});
