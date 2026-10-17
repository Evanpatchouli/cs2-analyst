import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks, createRequire } from 'node:module';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';

// Transform the real TSX components in memory, exactly like report-ux.test.mjs does.
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
  if (url.endsWith('.svg')) return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(new URL(url).pathname) + ';' };
  if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true,
    source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'tsx', jsx: 'automatic', format: 'esm' }).code };
  return nextLoad(url, context);
} });
const { Home } = await import('../renderer/src/home.tsx');
const { Sidebar } = await import('../renderer/src/sidebar.tsx');
const render = element => renderToStaticMarkup(createElement(SSRProvider, null, element));
const noop = () => {};

test('sidebar lists the six report views in order and disables them before a match is loaded', () => {
  const html = render(createElement(Sidebar, { reportReady: false, busy: false, collapsed: false, activeView: 'report',
    importLabel: '选择 DEM', onSelectView: noop, onToggleCollapsed: noop, onImport: noop }));
  assert.ok(html.includes('data-app-sidebar'), '侧边栏缺少桌面导航容器');
  assert.ok(html.includes('data-collapsed="false"'), '展开态标记缺失');
  assert.deepEqual([...html.matchAll(/id="([a-z-]+-tab)"/g)].map(match => match[1]),
    ['report-tab', 'deep-review-tab', 'timeline-tab', 'analysis-tab', 'replay-tab', 'heatmap-tab']);
  const labels = ['比赛报告', '深度复盘', '回合时间线', '分析', '比赛回放', '热力图'];
  for (const label of labels) assert.ok(html.includes(label), '导航缺少 ' + label);
  assert.equal(html.includes('地图回放'), false, '导航必须统一使用“比赛回放”');
  assert.equal([...html.matchAll(/role="tab"/g)].length, 6);
  assert.equal([...html.matchAll(/aria-controls="/g)].length, 6, '每个导航项都要指向自己的面板');
  assert.equal([...html.matchAll(/disabled/g)].length >= 6, true, '未导入时导航项应不可用');
  assert.ok(html.includes('data-sidebar-toggle'), '缺少展开/折叠按钮');
  assert.ok(html.includes('aria-label="收起导航"'), '展开态按钮应提示收起');
  assert.ok(html.includes('data-sidebar-import'), '侧边栏缺少导入入口');
});

test('collapsed sidebar keeps every icon and hides the text labels from assistive tech', () => {
  const html = render(createElement(Sidebar, { reportReady: true, busy: false, collapsed: true, activeView: 'replay',
    importLabel: '重新选择 DEM', onSelectView: noop, onToggleCollapsed: noop, onImport: noop }));
  assert.ok(html.includes('data-collapsed="true"'), '折叠态标记缺失');
  assert.equal([...html.matchAll(/role="tab"/g)].length, 6, '折叠态仍要保留 6 个导航项');
  assert.equal([...html.matchAll(/disabled/g)].length, 0, '已导入后导航项必须可用');
  assert.ok(html.includes('aria-label="展开导航"'), '折叠态按钮应提示展开');
  assert.equal(html.includes('>收起导航<'), false, '折叠态不应再渲染文字标签');
  assert.equal(html.includes('>重新选择 DEM<'), false, '折叠态不应再渲染导入文字标签');
});

test('home exposes one central import card with both click and drag entry points', () => {
  const html = render(createElement(Home, { busy: false, onImport: noop, onImportFile: noop }));
  assert.ok(html.includes('data-import-card'), '缺少导入卡片');
  assert.ok(html.includes('data-drag-over="false"'), '拖拽状态标记缺失');
  assert.ok(html.includes('从一场比赛开始'), '缺少主标题');
  assert.ok(html.includes('选择 DEM 文件'), '缺少点击导入按钮');
  assert.ok(html.includes('也可以把 .dem 文件直接拖放到这张卡片上'), '缺少拖拽提示');
  const busy = render(createElement(Home, { busy: true, onImport: noop, onImportFile: noop }));
  assert.ok(/disabled/.test(busy), '导入进行中必须禁用再次点击');
});

test('sidebar import keeps its current accessible name and native disabled semantics in both states', () => {
  for (const collapsed of [false, true]) for (const busy of [false, true]) for (const importLabel of ['选择 DEM', '重新选择 DEM']) {
    const html = render(createElement(Sidebar, { reportReady: true, busy, collapsed, activeView: 'report',
      importLabel, onSelectView: noop, onToggleCollapsed: noop, onImport: noop }));
    const button = html.match(/<button[^>]*data-sidebar-import[^>]*>/)?.[0];
    assert.ok(button);
    assert.ok(button.includes(`aria-label="${importLabel}"`));
    assert.equal(button.includes('disabled'), busy);
    assert.ok(button.includes('type="button"'));
  }
});
