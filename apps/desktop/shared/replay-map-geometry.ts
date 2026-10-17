/** Numeric overview metadata, pinned to the locally verified Steam manifest. No game/filesystem API. */
import { replayResourceId } from './replay-resource.ts';
export { replayResourceId };
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
  { id: 'de_ancient', posX: -2953, posY: 2164, scale: 5, layers: [layer('de_ancient')] },
  { id: 'de_overpass', posX: -4831, posY: 1781, scale: 5.2, layers: [layer('de_overpass')] },
  { id: 'de_vertigo', posX: -3168, posY: 1762, scale: 4, layers: [layer('de_vertigo', 'default', 11700, 20000), layer('de_vertigo', 'lower', -10000, 11700)] },
  { id: 'de_anubis', posX: -2796, posY: 3328, scale: 5.22, layers: [layer('de_anubis')] },
  { id: 'de_train', posX: -2308, posY: 2078, scale: 4.082077, layers: [layer('de_train', 'default', -50, 20000), layer('de_train', 'lower', -5000, -50)] },
  { id: 'de_cache', posX: -2000, posY: 3250, scale: 5.5, layers: [layer('de_cache')] },
].map(map => ({ ...map, width: 1024, height: 1024, resourceId: replayResourceId, versionMatch: 'unconfirmed' }));

export function worldToRadar(map: ReplayMapDefinition, position: { x: number; y: number }): { x: number; y: number } | null {
  if (![position.x, position.y, map.posX, map.posY, map.scale, map.width, map.height].every(Number.isFinite) || map.scale <= 0 || map.width <= 0 || map.height <= 0) return null;
  // Source overview scale is world units per pixel on its 1024 reference plane.
  // HUD rotate/zoom/insets are deliberately not applied to the original unrotated texture.
  return { x: (position.x - map.posX) / map.scale * map.width / 1024,
    y: (map.posY - position.y) / map.scale * map.height / 1024 };
}
export function resolveMapLayer(map: ReplayMapDefinition, z: number | null): string | null {
  if (map.layers.length === 1 && map.layers[0].minZ === null) return map.layers[0].id;
  if (z === null || !Number.isFinite(z)) return null;
  // Inclusive metadata ranges overlap at a shared boundary: preserve that ambiguity.
  const matches = map.layers.filter(layer => layer.minZ !== null && layer.maxZ !== null && z >= layer.minZ && z <= layer.maxZ);
  return matches.length === 1 ? matches[0].id : null;
}
