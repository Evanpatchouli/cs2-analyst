import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

/** Shared real-Electron assertions, including production installed apps. */
export async function checkWindowLayout(evaluate) {
  const shell = await evaluate(`(() => {
    const bar = document.querySelector('[data-app-titlebar]');
    const buttons = [...bar.querySelectorAll('[data-window-control]')];
    const rect = bar.getBoundingClientRect();
    const logo = bar.querySelector('[data-app-logo]');
    return { title: document.title, logo: !!logo, text: bar.textContent,
      mark: { tag: logo.tagName, loaded: logo.complete && logo.naturalWidth > 0,
        width: logo.getBoundingClientRect().width, height: logo.getBoundingClientRect().height,
        fit: getComputedStyle(logo).objectFit, draggable: logo.draggable },
      height: rect.height, top: rect.top, left: rect.left, right: rect.right, width: innerWidth,
      drag: getComputedStyle(bar).getPropertyValue('-webkit-app-region'),
      logoDrag: getComputedStyle(bar.querySelector('[data-app-logo]').parentElement).getPropertyValue('-webkit-app-region'),
      buttons: buttons.map(b => ({ name: b.dataset.windowControl, label: b.getAttribute('aria-label'),
        width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height,
        drag: getComputedStyle(b).getPropertyValue('-webkit-app-region'), svg: !!b.querySelector('svg') })),
      contentTop: document.querySelector('main').getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth > innerWidth,
      contentOverflow: document.querySelector('[data-app-content]').scrollWidth > document.querySelector('[data-app-content]').clientWidth,
      contentDrag: getComputedStyle(document.querySelector('main')).getPropertyValue('-webkit-app-region') };
  })()`);
  assert.equal(shell.title, 'CS2 Analyst'); assert.equal(shell.logo, true); assert.equal(shell.text, 'CS2 Analyst');
  assert.deepEqual(shell.mark, { tag: 'IMG', loaded: true, width: 20, height: 20, fit: 'contain', draggable: false });
  assert.equal(shell.height, 40); assert.equal(shell.top, 0); assert.equal(shell.left, 0); assert.equal(shell.right, shell.width);
  assert.equal(shell.drag, 'drag'); assert.equal(shell.logoDrag, 'no-drag');
  assert.equal(shell.contentTop, 40); assert.equal(shell.overflow, false);
  assert.equal(shell.contentOverflow, false); assert.notEqual(shell.contentDrag, 'drag');
  assert.deepEqual(shell.buttons.map(b => b.name), ['minimize', 'maximize', 'close']);
  for (const b of shell.buttons) { assert.equal(b.width, 46); assert.equal(b.height, 40); assert.equal(b.drag, 'no-drag'); assert.equal(b.svg, true); }
}

/**
 * Page-level scroll must never be the way content becomes reachable: the document, the body
 * and the main column stay locked to the viewport, and every long view scrolls inside its own panel.
 */
export async function assertNoPageScroll(evaluate, label) {
  const scroll = await evaluate(`(() => {
    const content = document.querySelector('[data-app-content]');
    const panel = [...document.querySelectorAll('[role="tabpanel"]')].find(p => !p.hidden);
    return { document: document.documentElement.scrollHeight - window.innerHeight,
      body: document.body.scrollHeight - window.innerHeight,
      content: content.scrollHeight - content.clientHeight,
      panelScrollsLocally: panel ? panel.scrollHeight - panel.clientHeight >= 0 : null,
      panelOverflow: panel ? getComputedStyle(panel).overflowY : null };
  })()`);
  assert.ok(scroll.document <= 0, `${label}：出现了页面级纵向滚动（document 溢出 ${scroll.document}px）`);
  assert.ok(scroll.body <= 0, `${label}：body 出现了纵向滚动（溢出 ${scroll.body}px）`);
  assert.ok(scroll.content <= 0, `${label}：主内容区出现了纵向滚动（溢出 ${scroll.content}px）`);
  if (scroll.panelOverflow !== null) assert.notEqual(scroll.panelOverflow, 'visible', `${label}：当前 Tab 面板未接管自己的滚动`);
}

/** App shell acceptance: home import card, drag-drop wiring, collapsible sidebar and icon alignment. Runs pre-import. */
export async function checkAppShell(evaluate) {
  const shell = await evaluate(`(() => {
    const sidebar = document.querySelector('[data-app-sidebar]');
    const toggle = document.querySelector('[data-sidebar-toggle]');
    const card = document.querySelector('[data-import-card]');
    const pick = [...document.querySelectorAll('button')].find(b => b.textContent.includes('选择 DEM'));
    const tabs = [...document.querySelectorAll('[data-app-sidebar] [role="tab"]')];
    return {
      sidebar: Boolean(sidebar), toggle: Boolean(toggle), card: Boolean(card), pick: Boolean(pick),
      tabCount: tabs.length, tabsDisabled: tabs.every(t => t.disabled),
      width: sidebar.getBoundingClientRect().width,
      collapsedAttr: sidebar.getAttribute('data-collapsed'),
    };
  })()`);
  await assertNoPageScroll(evaluate, '首页');
  assert.equal(shell.sidebar, true, '缺少桌面侧边栏');
  assert.equal(shell.toggle, true, '缺少侧边栏折叠按钮');
  assert.equal(shell.card, true, '首页缺少导入卡片');
  assert.equal(shell.pick, true, '首页缺少“选择 DEM”入口');
  assert.equal(shell.tabCount, 5, '侧边栏应列出 5 个报告视图');
  assert.equal(shell.tabsDisabled, true, '未导入时导航项应不可用');
  assert.equal(shell.collapsedAttr, 'false');
  assert.ok(shell.width > 150, '展开态侧边栏应显示图标与文本');

  // Drag-and-drop wiring: dragover highlights the card, drop runs the file-entry pipeline.
  const drag = await evaluate(`(() => {
    const card = document.querySelector('[data-import-card]');
    const transfer = new DataTransfer();
    transfer.items.add(new File(['synthetic'], 'demo.dem', { type: '' }));
    card.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    const highlighted = card.dataset.dragOver;
    card.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    return { highlighted, afterDrop: card.dataset.dragOver, text: card.textContent };
  })()`);
  await delay(150);
  assert.equal(drag.highlighted, 'true', '拖入 .dem 时导入卡片应高亮');
  assert.equal(drag.afterDrop, 'false', '放下后导入卡片应取消高亮');
  assert.ok(drag.text.includes('无法读取拖入文件的位置'), '拖放应走文件导入通道（合成文件无本机路径，给出可点击兜底）');

  await evaluate(`document.querySelector('[data-sidebar-toggle]').click()`);
  await delay(400);
  const collapsed = await evaluate(`(() => {
    const sidebar = document.querySelector('[data-app-sidebar]');
    const iconCenter = el => { const icon = el.querySelector('svg').getBoundingClientRect(); return icon.x + icon.width / 2; };
    const labels = [...document.querySelectorAll('[data-app-sidebar] .fui-Tab__content')];
    return {
      width: sidebar.getBoundingClientRect().width,
      attr: sidebar.getAttribute('data-collapsed'),
      hiddenLabels: labels.every(n => getComputedStyle(n).display === 'none'),
      navIconX: iconCenter(document.getElementById('report-tab')),
      toggleIconX: iconCenter(document.querySelector('[data-sidebar-toggle]')),
      toggleLabel: document.querySelector('[data-sidebar-toggle]').getAttribute('aria-label'),
    };
  })()`);
  assert.equal(collapsed.attr, 'true');
  assert.ok(collapsed.width < shell.width / 2, '折叠后侧边栏应只保留图标列');
  assert.equal(collapsed.hiddenLabels, true, '折叠态不应显示导航文本');
  assert.ok(Math.abs(collapsed.navIconX - collapsed.toggleIconX) <= 1, '折叠后折叠按钮与导航图标应在同一垂直线');
  assert.equal(collapsed.toggleLabel, '展开导航');

  await evaluate(`document.querySelector('[data-sidebar-toggle]').click()`);
  await delay(400);
  const restored = await evaluate(`(() => {
    const sidebar = document.querySelector('[data-app-sidebar]');
    const labels = [...document.querySelectorAll('[data-app-sidebar] .fui-Tab__content')];
    return { width: sidebar.getBoundingClientRect().width, attr: sidebar.getAttribute('data-collapsed'),
      visibleLabels: labels.every(n => getComputedStyle(n).display !== 'none') };
  })()`);
  assert.equal(restored.attr, 'false');
  assert.equal(restored.width, shell.width, '展开后宽度应恢复');
  assert.equal(restored.visibleLabels, true, '展开态应恢复图标与文本');
  console.log('App shell: 首页导入卡片、点击/拖放入口、侧边栏展开/折叠与图标对齐 PASS');
}

export async function checkWindowShell(evaluate, send) {
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await checkWindowLayout(evaluate);
  await checkAppShell(evaluate);
  assert.equal(await evaluate(`document.querySelector('[data-window-control="maximize"]').getAttribute('aria-label')`), '最大化');
  const waitLabel = async expected => {
    for (let n = 0; n < 80; n++) {
      if (await evaluate(`document.querySelector('[data-window-control="maximize"]').getAttribute('aria-label')`) === expected) return;
      await delay(100);
    }
    assert.fail('window state label did not become ' + expected);
  };
  await evaluate(`document.querySelector('[data-window-control="maximize"]').click()`);
  await waitLabel('还原');
  assert.equal(await evaluate('window.cs2Analyst.window.isMaximized()'), true);
  await checkWindowLayout(evaluate);
  // Windows reports maximize before the native transition animation finishes.
  // Let that transition settle before testing the opposite native operation.
  await delay(1000);
  await evaluate(`document.querySelector('[data-window-control="maximize"]').click()`);
  await waitLabel('最大化');
  assert.equal(await evaluate('window.cs2Analyst.window.isMaximized()'), false);
  console.log('Custom window shell: real Main maximize/restore, drag/no-drag and layout PASS');
}
