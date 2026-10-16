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

test('sidebar lists the five report views in order and disables them before a match is loaded', () => {
  const html = render(createElement(Sidebar, { reportReady: false, busy: false, collapsed: false, activeView: 'report',
    importLabel: '选择 DEM', onSelectView: noop, onToggleCollapsed: noop, onImport: noop }));
  assert.ok(html.includes('data-app-sidebar'), '侧边栏缺少桌面导航容器');
  assert.ok(html.includes('data-collapsed="false"'), '展开态标记缺失');
  assert.deepEqual([...html.matchAll(/id="([a-z-]+-tab)"/g)].map(match => match[1]),
    ['report-tab', 'deep-review-tab', 'timeline-tab', 'analysis-tab', 'replay-tab']);
  const labels = ['比赛报告', '深度复盘', '回合时间线', '分析', '地图回放'];
  for (const label of labels) assert.ok(html.includes(label), '导航缺少 ' + label);
  assert.equal([...html.matchAll(/role="tab"/g)].length, 5);
  assert.equal([...html.matchAll(/aria-controls="/g)].length, 5, '每个导航项都要指向自己的面板');
  assert.equal([...html.matchAll(/disabled/g)].length >= 5, true, '未导入时导航项应不可用');
  assert.ok(html.includes('data-sidebar-toggle'), '缺少展开/折叠按钮');
  assert.ok(html.includes('aria-label="收起导航"'), '展开态按钮应提示收起');
  assert.ok(html.includes('data-sidebar-import'), '侧边栏缺少导入入口');
});

test('collapsed sidebar keeps every icon and hides the text labels from assistive tech', () => {
  const html = render(createElement(Sidebar, { reportReady: true, busy: false, collapsed: true, activeView: 'replay',
    importLabel: '重新选择 DEM', onSelectView: noop, onToggleCollapsed: noop, onImport: noop }));
  assert.ok(html.includes('data-collapsed="true"'), '折叠态标记缺失');
  assert.equal([...html.matchAll(/role="tab"/g)].length, 5, '折叠态仍要保留 5 个导航项');
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

test('the shell locks page scrolling and keeps every long view inside its own panel', () => {
  const source = readFileSync(new URL('../renderer/src/main.tsx', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('../renderer/src/theme.ts', import.meta.url), 'utf8');
  // The document itself must never scroll; each tab panel owns its overflow instead.
  assert.ok(/useAppShellStyles/.test(theme), '缺少应用外壳的静态样式');
  assert.ok(/overflow: 'hidden', overscrollBehavior: 'none'/.test(theme), 'html/body 必须禁用页面滚动');
  assert.ok(/useAppShellStyles\(\)/.test(source), '外壳样式未接入根组件');
  const panels = [...source.matchAll(/id="([a-z-]+-panel)"[^>]*className=\{s\.(tabPanel|replayPanel)\}/g)].map(match => match[2]);
  assert.deepEqual(panels, ['tabPanel', 'tabPanel', 'tabPanel', 'tabPanel', 'replayPanel'], '每个面板都必须接管自己的滚动');
  assert.ok(/tabPanel: \{[^}]*overflowY: 'auto'/.test(source), 'Tab 面板需要内部滚动');
  assert.ok(/replayPanel: \{[^}]*overflow: 'hidden'/.test(source), '地图回放面板由内部区块滚动');
  assert.equal(/<TabList(?! vertical)/.test(source), false, '导航不应再使用横向 TabList');
});
