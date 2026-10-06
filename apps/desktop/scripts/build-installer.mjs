import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds a Windows x64 NSIS installer.
 *
 *   node scripts/build-installer.mjs production   CS2-Coach-Setup-<version>.exe
 *   node scripts/build-installer.mjs test-seam    test-only build that accepts
 *                                                 CS2_COACH_TEST_DEM_PATH so the
 *                                                 installed-app E2E can import a
 *                                                 DEM without the native dialog.
 *
 * The production build must not expose any path-injection capability, so the
 * test seam is compiled out and asserted absent below.
 */

const variant = process.argv[2] ?? 'production';
if (variant !== 'production' && variant !== 'test-seam') {
  throw new Error(`unknown packaging variant "${variant}"; expected production or test-seam`);
}
const testSeam = variant === 'test-seam';

const desktopDir = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
// Stage outside the workspace: workspace file watchers hold packaged archives open,
// which blocks electron-builder when it resets the output directory.
const stagingDir = join(tmpdir(), 'cs2-coach-packaging', variant);
const releaseDir = join(desktopDir, testSeam ? 'release/test-seam' : 'release');
const env = {
  ...process.env,
  CS2_COACH_TEST_SEAM: testSeam ? '1' : '0',
  CS2_COACH_PACK: '1',
  CS2_COACH_PACK_OUTPUT: stagingDir,
};

function run(command, args) {
  const result = spawnSync(command, args, { cwd: desktopDir, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
}

const electronVite = join(dirname(require.resolve('electron-vite/package.json')), 'bin', 'electron-vite.js');
run(process.execPath, [electronVite, 'build']);
run(process.execPath, [fileURLToPath(new URL('./prepare-pack.mjs', import.meta.url))]);

const mainBundle = readFileSync(join(desktopDir, 'dist/electron/main.js'), 'utf8');
const workerBundle = readFileSync(join(desktopDir, 'dist/electron/report-worker.js'), 'utf8');

// The worker must be self-contained JavaScript: workspace packages bundled in,
// native parser external so prepare-pack.mjs can provide it at runtime.
for (const pkg of ['dem-parser', 'match-model', 'analytics', 'findings', 'report-contract']) {
  if (workerBundle.includes(`"@cs2-coach/${pkg}"`)) {
    throw new Error(`report-worker.js still imports @cs2-coach/${pkg}; workspace packages must be bundled`);
  }
}
if (!workerBundle.includes('@laihoe/demoparser2')) {
  throw new Error('report-worker.js does not reference the native parser; prepare-pack staging would be unused');
}

const seamMarker = 'CS2_COACH_TEST_DEM_PATH';
if (testSeam) {
  if (!mainBundle.includes(seamMarker)) throw new Error('test-seam build is missing the packaged import seam');
} else if (mainBundle.includes(seamMarker)) {
  throw new Error(`production main.js contains ${seamMarker}; the packaged app must not accept injected DEM paths`);
}

// Best effort: a previous staging directory can keep a half-written executable around.
try {
  rmSync(stagingDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
} catch (error) {
  console.warn(`warning: could not fully clear ${stagingDir} (${error.code ?? error.message}); continuing`);
}

const electronBuilder = require.resolve('electron-builder/cli.js');
run(process.execPath, [electronBuilder, '--win', 'nsis', '--x64', '--config', 'electron-builder.config.cjs']);

const installer = readdirSync(stagingDir).find(name => name.endsWith('.exe') && !name.includes('__uninstaller'));
if (!installer) throw new Error(`electron-builder produced no installer in ${stagingDir}`);
mkdirSync(releaseDir, { recursive: true });
const artifact = join(releaseDir, installer);
copyFileSync(join(stagingDir, installer), artifact);
const sizeMb = (statSync(artifact).size / 1024 / 1024).toFixed(1);
console.log(`installer (${variant}): ${artifact} (${sizeMb} MB)`);
