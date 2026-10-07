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

export async function checkWindowShell(evaluate, send) {
  await checkWindowLayout(evaluate);
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
  await evaluate(`document.querySelector('[data-window-control="maximize"]').click()`);
  await waitLabel('最大化');
  assert.equal(await evaluate('window.cs2Analyst.window.isMaximized()'), false);
  console.log('Custom window shell: real Main maximize/restore, drag/no-drag and layout PASS');
}
