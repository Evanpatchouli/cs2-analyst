// Offline P6.0 region calibration against independently selected radar pixels.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseOverview, pngDimensions, sha256 } from './replay-resource-audit.mjs';
const dir = new URL('../.tmp/p6-official/', import.meta.url);
const resources = JSON.parse(await readFile(new URL('../docs/replay-resources.json', import.meta.url), 'utf8'));
const resource = resources.maps.find(m => m.map === 'de_dust2');
const overviewBytes = await readFile(new URL('resource/overviews/de_dust2.txt', dir));
const imageBytes = await readFile(new URL('panorama/images/overheadmaps/de_dust2_radar_psd.png', dir));
assert.equal(sha256(overviewBytes), resource.overview.sha256, 'Calibration overview identity mismatch');
assert.equal(sha256(imageBytes), resource.images[0].sha256, 'Calibration radar identity mismatch');
const overview = parseOverview(overviewBytes.toString('utf8'), 'de_dust2');
const dimensions = pngDimensions(imageBytes);
assert.deepEqual(dimensions, { width: 1024, height: 1024 });
const evidence = JSON.parse(await readFile(new URL('../docs/replay-feasibility.json', import.meta.url), 'utf8'));
// Rectangles selected by visual inspection of the extracted natural-size radar, not inverse projections.
const regions = [
  { name: 'T spawn', bounds: [295,875,490,960], select: p => p.round === 1 && p.kind === 'freeze_end' && p.side === 2 },
  { name: 'CT spawn', bounds: [570,150,685,265], select: p => p.round === 1 && p.kind === 'freeze_end' && p.side === 3 },
  { name: 'east bomb area', bounds: [775,135,855,215], select: p => p.planter && p.x > 0 },
  { name: 'west bomb area', bounds: [165,78,260,180], select: p => p.planter && p.x < 0 },
];
const observations = regions.map(({name,bounds,select}) => {
  const points = evidence.landmarkObservations.filter(select).map(p => {
    const x = (p.x - overview.transform.posX) / overview.transform.scale;
    const y = (overview.transform.posY - p.y) / overview.transform.scale;
    const inside = x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3];
    assert.ok(inside, `${name}: R${p.round} tick ${p.tick} outside independently selected radar region`);
    return { ...p, pixel: { x, y }, inside };
  });
  assert.ok(points.length > 0); return { name, bounds, points };
});
const result = { schemaVersion:1, resourceId:resources.resourceId, imageSha256:sha256(imageBytes), overviewSha256:sha256(overviewBytes), fixtureSha256:evidence.fixture.sha256, dimensions, transform:overview.transform,
  method:'Visual radar region selection compared with exact native freeze-end / planted actor observations; no inverse-transform self-proof',
  status:'four-region-registration-pass', versionMatch:'unconfirmed',
  limits:['Region checks establish axis/sign/scale/edge consistency, not pixel-exact geometry or DEM map build equivalence',
    'Bomb site labels inferred visually from radar topology for calibration only; no native siteIndex to A/B mapping added',
    'No LOS, collision, nav mesh or tactical conclusion; yaw projection cardinal tests pending P6.1'], observations };
await writeFile(new URL('../docs/replay-calibration.json', import.meta.url), JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(observations.map(r=>({name:r.name,count:r.points.length,passed:r.points.every(p=>p.inside)}))));
