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

const testSeam = process.env.CS2_ANALYST_TEST_SEAM === '1';
const artifactName = testSeam ? 'CS2-Analyst-TestSeam-Setup-${version}.${ext}' : 'CS2-Analyst-Setup-${version}.${ext}';

module.exports = {
  appId: testSeam ? 'com.evanpatchouli.cs2analyst.testseam' : 'com.evanpatchouli.cs2analyst',
  productName: 'CS2 Analyst',
  executableName: 'CS2 Analyst',
  copyright: 'Copyright © 2026 Evanpatchouli',
  directories: {
    buildResources: 'resources',
    // build-installer.mjs stages outside the workspace; workspace file watchers can
    // hold packaged archives open and block electron-builder's directory reset.
    output: process.env.CS2_ANALYST_PACK_OUTPUT || (testSeam ? 'release/test-seam' : 'release'),
  },
  artifactName,
  // Electron reads productName from the packaged package.json, so the app name and
  // userData directory become "CS2 Analyst" instead of the workspace package name.
  extraMetadata: { productName: 'CS2 Analyst' },
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
  extraResources: [{ from: 'resources/branding/cs2-analyst-mark.png', to: 'branding/cs2-analyst-mark.png' }],
  win: {
    icon: 'resources/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    installerIcon: 'resources/icon.ico',
    uninstallerIcon: 'resources/icon.ico',
    installerHeaderIcon: 'resources/icon.ico',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'CS2 Analyst',
    uninstallDisplayName: 'CS2 Analyst',
    deleteAppDataOnUninstall: false,
  },
};
