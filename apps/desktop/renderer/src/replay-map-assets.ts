// Vite packages only locally prepared, hash-verified files. An empty source checkout is supported.
const imports = import.meta.glob<string>('./assets/replay-maps/*.png', { eager: true, import: 'default', query: '?url' });
export const replayMapAssets = Object.fromEntries(Object.entries(imports).map(([path, url]) => [path.split('/').at(-1)!, url]));
