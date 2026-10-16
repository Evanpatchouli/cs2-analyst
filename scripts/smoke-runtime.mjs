import { setTimeout as delay } from 'node:timers/promises';

/** Every caller supplies a bounded probe (CDP/fetch/process commands have their own deadlines). */
export async function waitFor(probe, timeoutMs, label, { intervalMs = 100, diagnostics = () => undefined } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await probe();
    if (last) return last;
    await delay(Math.min(intervalMs, Math.max(0, timeoutMs - (Date.now() - start))));
  }
  let detail;
  try { detail = await diagnostics(); } catch (error) { detail = { diagnosticError: error.message }; }
  throw new Error(`等待 ${label} 超时 (${timeoutMs}ms); last=${JSON.stringify(last)}; diagnostics=${JSON.stringify(detail)}`);
}

/** Attempt every cleanup; preserve the primary error and attach secondary failures for evidence. */
export async function withCleanup(body, cleanups) {
  let primary, value, failed = false;
  try { value = await body(); } catch (error) { primary = error; failed = true; }
  const failures = [];
  for (const cleanup of cleanups) {
    try { await cleanup(); } catch (error) { failures.push(error); }
  }
  if (failed) {
    if (failures.length) {
      if (primary && (typeof primary === 'object' || typeof primary === 'function')) primary.cleanupErrors = failures;
      console.error('Cleanup also failed:', failures);
    }
    throw primary;
  }
  if (failures.length) throw new AggregateError(failures, 'Smoke cleanup failed');
  return value;
}

export async function connectCdp(url, timeoutMs = 20_000) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error(`CDP websocket open timeout: ${url}`)); }, timeoutMs);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`CDP websocket failed: ${url}`)); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(`${request.label}: ${JSON.stringify(message.error)}`));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(`CDP connection closed while waiting for ${request.label}`)); }
    pending.clear();
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, label = `${method} ${JSON.stringify(params).slice(0, 500)}`;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout (${timeoutMs}ms): ${label}; readyState=${socket.readyState}`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer, label });
    try { socket.send(JSON.stringify({ id, method, params })); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`CDP evaluate failed: ${expression.slice(0, 500)}; ${JSON.stringify(result.exceptionDetails)}`);
    return result.result?.value;
  };
  return { socket, send, evaluate };
}

export async function closeApp(session, timeoutMs = 15_000) {
  let closeError;
  const command = session.evaluate(`document.querySelector('[data-window-control="close"]').click()`).catch(error => { closeError = error; });
  await waitFor(() => session.child.exitCode !== null, timeoutMs, 'window close / process exit', {
    diagnostics: () => ({ pid: session.child.pid, exitCode: session.child.exitCode, closeError: closeError?.message }),
  });
  await command;
  // A disconnected CDP response is acceptable only with actual successful process exit.
  if (session.child.exitCode !== 0) throw new Error(`Application exit failed: ${session.child.exitCode}; ${closeError?.message ?? ''}`);
  session.socket?.close();
  return session.child.exitCode;
}

/** Chromium disk File -> actual Home drop -> preload/IPC. This does not claim Explorer input. */
export async function dropDiskFile({ send, evaluate }, filePath) {
  return withCleanup(async () => {
    await evaluate(`(() => { const input=document.createElement('input'); input.type='file'; input.id='qa-disk-file'; input.hidden=true; document.body.append(input); })()`);
    const { root } = await send('DOM.getDocument');
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#qa-disk-file' });
    await send('DOM.setFileInputFiles', { nodeId, files: [filePath] });
    await evaluate(`(() => { const target=document.querySelector('[data-import-card]'); if(!target)throw new Error('Home drop target unavailable');
      const transfer=new DataTransfer();transfer.items.add(document.getElementById('qa-disk-file').files[0]);target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer})); })()`);
  }, [() => evaluate(`document.getElementById('qa-disk-file')?.remove()`)]);
}
