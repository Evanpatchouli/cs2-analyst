import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyzeDemoFile } from '../electron/report.ts';

const demo = process.env.DEM_TEST_FILE ?? fileURLToPath(new URL('../../../.demo/demo1.dem', import.meta.url));
const hasDemo = existsSync(demo);

test('real demo flows through parser -> analytics -> findings into a serializable DTO', { skip: hasDemo ? false : 'demo1.dem not present' }, async () => {
  const result = await analyzeDemoFile(demo);
  assert.equal(result.kind, 'success');
  const report = result.report;

  // Renderer-facing shape: JSON only, no domain events or native objects.
  assert.deepEqual(Object.keys(report), ['schemaVersion', 'match', 'selectedPlayer', 'players', 'analytics', 'findings']);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);

  assert.equal(report.match.map, 'de_dust2');
  assert.equal(report.match.fileName, 'demo1.dem');
  assert.equal(report.match.rounds, 24);
  assert.deepEqual(report.match.score, { initialCT: 13, initialT: 11 });
  assert.equal(report.players.length, 10);

  const twinkle = report.players.find(p => p.nickname === 'twinkle');
  assert.ok(twinkle, 'twinkle should be in the roster');
  assert.equal(report.selectedPlayer, twinkle.id, 'twinkle is the default selected player');

  const p = report.analytics.find(a => a.playerId === twinkle.id);
  assert.equal(p.kills, 25);
  assert.equal(p.deaths, 20);
  assert.equal(p.assists, 4);
  assert.equal(p.roundsPlayed, 24);
  assert.equal(p.adr, 91.375);
  assert.equal(p.kast.percentage, 75);
  assert.equal(p.kast.complete, true);
  assert.ok(Math.abs(p.trade.rate - (4 / 18) * 100) < 1e-9);
  assert.equal(p.trade.complete, true);
  assert.deepEqual(p.opening, { kills: 4, deaths: 0, winRate: 1 });
  assert.deepEqual(p.clutch.list.find(c => c.round === 24), { round: 24, opponents: 3, won: true });

  // Findings for the selected player: three capped issues, then two highlights.
  const mine = report.findings.filter(f => f.playerId === twinkle.id).map(f => f.ruleId);
  assert.deepEqual(mine, [
    'side-impact.ct-gap', 'trade.low-rate', 'team-flash.frequent-effects',
    'clutch.win.r24', 'opening.positive',
  ]);
  for (const finding of report.findings.filter(f => f.playerId === twinkle.id)) {
    assert.ok(finding.title && finding.summary, 'findings carry a title and summary');
    assert.ok(finding.evidence.length > 0, 'findings carry evidence');
  }
});

test('an unreadable DEM returns an error result instead of throwing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cs2-coach-'));
  try {
    const bad = join(dir, 'broken.dem');
    writeFileSync(bad, 'not a demo');
    const result = await analyzeDemoFile(bad);
    assert.equal(result.kind, 'error');
    assert.match(result.message, /无法分析此 DEM/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing DEM path returns an error result instead of throwing', async () => {
  const result = await analyzeDemoFile(join(tmpdir(), 'cs2-coach-missing', 'gone.dem'));
  assert.equal(result.kind, 'error');
  assert.match(result.message, /无法分析此 DEM/);
});
