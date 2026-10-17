import { replayMapDefinitions } from '../../shared/replay-map-geometry.ts';
export { replayResourceId, replayMapDefinitions, worldToRadar, resolveMapLayer } from '../../shared/replay-map-geometry.ts';
export type { ReplayMapLayer, ReplayMapDefinition } from '../../shared/replay-map-geometry.ts';

export function radarHeading(yaw: number): { x: number; y: number } | null {
  if (!Number.isFinite(yaw)) return null;
  const radians = yaw * Math.PI / 180;
  return { x: Math.cos(radians), y: -Math.sin(radians) };
}
export function mapResourceState(mapName: string, assets: Record<string, string>) {
  const definition = replayMapDefinitions.find(map => map.id === mapName);
  if (!definition || definition.layers.some(layer => !assets[layer.image])) return { status: 'unavailable' as const, definition: definition ?? null };
  return { status: 'unconfirmed' as const, definition };
}
