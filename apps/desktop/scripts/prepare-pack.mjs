import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Stages the native parser binding inside the Main output so a packaged app can
 * load it from app.asar/dist/electron/node_modules without any pnpm workspace
 * symlink. Only the files the binding needs are copied: the @laihoe/demoparser2
 * loader (index.js) and the platform package that owns the .node binary.
 *
 * The loader resolves its sibling .node first and falls back to
 * require('@laihoe/demoparser2-<triple>'); staging the fallback package keeps the
 * exact code path that runs in the dev workspace.
 */

const desktopDir = fileURLToPath(new URL('../', import.meta.url));
const parserRequire = createRequire(new URL('../../../packages/dem-parser/package.json', import.meta.url));

const WORKER_NODE_MODULES = join(desktopDir, 'dist', 'electron', 'node_modules');
const LOADER_PACKAGE = '@laihoe/demoparser2';
const LOADER_FILES = ['index.js', 'index.d.ts', 'package.json'];

/** napi-rs triple used by the optional platform package name. */
const TRIPLES = {
  'win32-x64': 'win32-x64-msvc',
  'win32-arm64': 'win32-arm64-msvc',
  'darwin-x64': 'darwin-x64',
  'darwin-arm64': 'darwin-arm64',
  'linux-x64': 'linux-x64-gnu',
};

const platform = process.env.CS2_COACH_PACK_PLATFORM || process.platform;
const arch = process.env.CS2_COACH_PACK_ARCH || process.arch;
const triple = TRIPLES[`${platform}-${arch}`];
if (!triple) {
  throw new Error(`native parser packaging does not support ${platform}-${arch}; supported: ${Object.keys(TRIPLES).join(', ')}`);
}

const loaderDir = dirname(parserRequire.resolve(`${LOADER_PACKAGE}/package.json`));
// Resolve the platform package exactly like the loader's runtime fallback does,
// i.e. from the loader's own directory, not from the app.
const loaderRequire = createRequire(join(loaderDir, 'index.js'));
const platformPackage = `${LOADER_PACKAGE}-${triple}`;
const platformDir = dirname(loaderRequire.resolve(`${platformPackage}/package.json`));
const bindingName = `demoparser2.${triple}.node`;
const bindingSource = join(platformDir, bindingName);
if (!existsSync(bindingSource)) {
  throw new Error(`native binding not found: ${bindingSource}`);
}

rmSync(join(WORKER_NODE_MODULES, '@laihoe'), { recursive: true, force: true });
const loaderTarget = join(WORKER_NODE_MODULES, LOADER_PACKAGE);
const platformTarget = join(WORKER_NODE_MODULES, platformPackage);
mkdirSync(loaderTarget, { recursive: true });
mkdirSync(platformTarget, { recursive: true });
for (const file of LOADER_FILES) {
  cpSync(join(loaderDir, file), join(loaderTarget, file));
}
cpSync(join(platformDir, 'package.json'), join(platformTarget, 'package.json'));
cpSync(bindingSource, join(platformTarget, bindingName));

const sizeMb = (statSync(join(platformTarget, bindingName)).size / 1024 / 1024).toFixed(1);
console.log(`native parser staged: ${LOADER_PACKAGE} + ${platformPackage} (${bindingName}, ${sizeMb} MB)`);
