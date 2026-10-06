const path = require('node:path');

/**
 * Windows x64 NSIS packaging for the local-install MVP.
 *
 * The application directory only ships `dist/**` (Main, preload, renderer and the
 * staged native parser) plus `package.json`. Production dependencies are never
 * copied: the worker bundle already inlines every workspace package, and the
 * renderer bundle already inlines React and Fluent UI. That keeps the monorepo,
 * the pnpm store and development-only files out of the installer.
 */

const testSeam = process.env.CS2_COACH_TEST_SEAM === '1';
const artifactName = testSeam ? 'CS2-Coach-TestSeam-Setup-${version}.${ext}' : 'CS2-Coach-Setup-${version}.${ext}';

module.exports = {
  appId: testSeam ? 'com.evanpatchouli.cs2coach.testseam' : 'com.evanpatchouli.cs2coach',
  productName: 'CS2 Coach',
  executableName: 'CS2 Coach',
  copyright: 'Copyright © 2026 Evanpatchouli',
  directories: {
    // build-installer.mjs stages outside the workspace; workspace file watchers can
    // hold packaged archives open and block electron-builder's directory reset.
    output: process.env.CS2_COACH_PACK_OUTPUT || (testSeam ? 'release/test-seam' : 'release'),
  },
  artifactName,
  // Electron reads productName from the packaged package.json, so the app name and
  // userData directory become "CS2 Coach" instead of the workspace package name.
  extraMetadata: { productName: 'CS2 Coach' },
  // Reuse the Electron runtime the workspace already installed instead of downloading it again.
  electronDist: path.dirname(require('electron')),
  asar: true,
  asarUnpack: ['**/*.node'],
  npmRebuild: false,
  // Skipped on purpose: it rewrites the newly copied ~234 MB Electron executable right
  // after the rename, which races antivirus scanning on this machine. Electron only
  // enforces embedded ASAR integrity when its fuse is enabled, and this MVP ships an
  // unsigned local build without release hardening.
  disableAsarIntegrity: true,
  files: [
    'dist/**',
    'package.json',
    '!node_modules/**',
    '!**/*.map',
  ],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'CS2 Coach',
    uninstallDisplayName: 'CS2 Coach',
    deleteAppDataOnUninstall: false,
  },
};
