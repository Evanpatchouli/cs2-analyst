import type { HeatmapLayer, MapHeatmapProjection } from '@cs2-analyst/report-contract';

export interface HeatmapPaintLayer { layer: HeatmapLayer; projection: MapHeatmapProjection; color: string }
/** Grid coordinates are already normalized radar coordinates. Never reproject them. */
export function paintHeatmap(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number, layers: HeatmapPaintLayer[]) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.drawImage(image, 0, 0, width, height);
  // Fixed source-over order, independent of toggle/request completion order.
  for (const name of ['positions', 'kills', 'deaths'] as const) {
    const entry = layers.find(item => item.layer === name);
    if (!entry) continue;
    const n = entry.projection.grid.resolution, grid = entry.projection[name]?.grid;
    if (!grid || ![16, 32, 64].includes(n)) continue;
    ctx.fillStyle = entry.color;
    for (const cell of grid.cells) {
      if (!Number.isInteger(cell.index) || cell.index < 0 || cell.index >= n * n || cell.cellSampleCount <= 0
        || cell.intensity === null || !Number.isFinite(cell.intensity) || cell.intensity <= 0 || cell.intensity > 1) continue;
      const x = cell.index % n, y = Math.floor(cell.index / n);
      ctx.globalAlpha = cell.intensity * 0.8;
      ctx.fillRect(x * width / n, y * height / n, width / n, height / n);
    }
  }
  ctx.globalAlpha = 1;
}

/** A single image, observer, resolution listener and coalesced animation frame per mounted map. */
export function mountHeatmapCanvas(host: HTMLElement, canvas: HTMLCanvasElement, url: string,
  layers: () => HeatmapPaintLayer[], onImage: (state: 'loading' | 'ready' | 'error') => void,
  platform = { window, ResizeObserver, Image,
    requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window) }) {
  let disposed = false, ready = false, raf = 0;
  let media: MediaQueryList;
  let observedDpr = platform.window.devicePixelRatio;
  const image = new platform.Image();
  onImage('loading');
  const schedule = () => { if (!disposed && !raf) raf = platform.requestAnimationFrame(draw); };
  function draw() {
    raf = 0;
    if (disposed) return;
    const rect = host.getBoundingClientRect(), side = Math.floor(Math.min(rect.width, rect.height));
    if (side <= 0) { canvas.width = canvas.height = 1; return; }
    canvas.style.width = canvas.style.height = `${side}px`;
    const pixels = Math.max(1, Math.round(side * platform.window.devicePixelRatio));
    if (canvas.width !== pixels || canvas.height !== pixels) canvas.width = canvas.height = pixels;
    const ctx = canvas.getContext('2d');
    if (!ctx) { onImage('error'); return; }
    if (ready) paintHeatmap(ctx, image, pixels, pixels, layers());
    else ctx.clearRect(0, 0, pixels, pixels);
  }
  function watchDpr() {
    media?.removeEventListener('change', changeDpr);
    observedDpr = platform.window.devicePixelRatio;
    media = platform.window.matchMedia(`(resolution: ${observedDpr}dppx)`);
    media.addEventListener('change', changeDpr);
  }
  function changeDpr() { watchDpr(); schedule(); }
  image.onload = () => { if (!disposed) { ready = true; onImage('ready'); schedule(); } };
  image.onerror = () => { if (!disposed) { ready = false; onImage('error'); schedule(); } };
  image.src = url;
  const observer = new platform.ResizeObserver(schedule);
  observer.observe(host); watchDpr();
  // Some Chromium DPR transitions (including CDP emulation) emit neither media nor resize events.
  // Read one scalar at low frequency; only a changed DPR schedules a paint, never an IPC request.
  const dprTimer = platform.setInterval(() => { if (platform.window.devicePixelRatio !== observedDpr) changeDpr(); }, 750);
  platform.window.addEventListener('resize', schedule);
  schedule();
  return { schedule, dispose() {
    disposed = true; observer.disconnect(); media.removeEventListener('change', changeDpr);
    platform.window.removeEventListener('resize', schedule); platform.cancelAnimationFrame(raf);
    platform.clearInterval(dprTimer);
    image.onload = image.onerror = null; image.src = ''; canvas.width = canvas.height = 1;
  } };
}
