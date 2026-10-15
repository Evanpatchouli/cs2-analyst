/** Numeric overview metadata, pinned to the locally verified Steam manifest. No game/filesystem API. */
export const replayResourceId = 'valve-730-2347770-2312433566686574487-vrf20.1';
export interface ReplayMapLayer { id: string; label: string; minZ: number | null; maxZ: number | null; image: string }
export interface ReplayMapDefinition {
  id: string; width: number; height: number; posX: number; posY: number; scale: number;
  resourceId: string; versionMatch: 'unconfirmed'; layers: ReplayMapLayer[];
}
const layer = (map: string, id = 'default', minZ: number | null = null, maxZ: number | null = null): ReplayMapLayer => ({
  id, label: id === 'lower' ? '下层' : '主层', minZ, maxZ, image: `${map}${id === 'default' ? '' : '_' + id}.png`,
});
export const replayMapDefinitions: ReplayMapDefinition[] = [
  { id: 'de_dust2', posX: -2476, posY: 3239, scale: 4.4, layers: [layer('de_dust2')] },
  { id: 'de_nuke', posX: -3453, posY: 2887, scale: 7, layers: [layer('de_nuke', 'default', -495, 10000), layer('de_nuke', 'lower', -10000, -495)] },
  { id: 'de_inferno', posX: -2087, posY: 3870, scale: 4.9, layers: [layer('de_inferno')] },
  { id: 'de_mirage', posX: -3230, posY: 1713, scale: 5, layers: [layer('de_mirage')] },
].map(map => ({ ...map, width: 1024, height: 1024, resourceId: replayResourceId, versionMatch: 'unconfirmed' }));

export function worldToRadar(map: ReplayMapDefinition, position: { x: number; y: number }): { x: number; y: number } | null {
  if (![position.x, position.y, map.posX, map.posY, map.scale, map.width, map.height].every(Number.isFinite) || map.scale <= 0 || map.width <= 0 || map.height <= 0) return null;
  // Source overview scale is world units per pixel on its 1024 reference plane.
  // HUD rotate/zoom/insets are deliberately not applied to the original unrotated texture.
  return { x: (position.x - map.posX) / map.scale * map.width / 1024,
    y: (map.posY - position.y) / map.scale * map.height / 1024 };
}
export function radarHeading(yaw: number): { x: number; y: number } | null {
  if (!Number.isFinite(yaw)) return null;
  const radians = yaw * Math.PI / 180;
  return { x: Math.cos(radians), y: -Math.sin(radians) };
}
export function resolveMapLayer(map: ReplayMapDefinition, z: number | null): string | null {
  if (map.layers.length === 1 && map.layers[0].minZ === null) return map.layers[0].id;
  if (z === null || !Number.isFinite(z)) return null;
  // Inclusive metadata ranges overlap at a shared boundary: preserve that ambiguity.
  const matches = map.layers.filter(layer => layer.minZ !== null && layer.maxZ !== null && z >= layer.minZ && z <= layer.maxZ);
  return matches.length === 1 ? matches[0].id : null;
}
export function mapResourceState(mapName: string, assets: Record<string, string>) {
  const definition = replayMapDefinitions.find(map => map.id === mapName);
  if (!definition || definition.layers.some(layer => !assets[layer.image])) return { status: 'unavailable' as const, definition: definition ?? null };
  return { status: 'unconfirmed' as const, definition };
}
