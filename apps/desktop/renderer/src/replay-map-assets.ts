// Vite packages the checked-in, hash-verified radars. Missing assets still support event-only display.
const imports = import.meta.glob<string>('./assets/replay-maps/*.png', { eager: true, import: 'default', query: '?url' });
export const replayMapAssets = Object.fromEntries(Object.entries(imports).map(([path, url]) => [path.split('/').at(-1)!, url]));
