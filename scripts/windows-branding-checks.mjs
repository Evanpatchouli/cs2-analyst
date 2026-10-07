import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const electronBuilderRequire = createRequire(require.resolve('electron-builder'));
const builderRequire = createRequire(electronBuilderRequire.resolve('app-builder-lib'));
const { NtExecutable, NtExecutableResource, Resource } = builderRequire('resedit');
const ico = readFileSync(new URL('../apps/desktop/resources/icon.ico', import.meta.url));
const expected = new Map();
for (let i = 0; i < ico.readUInt16LE(4); i++) {
  const start = 6 + i * 16;
  const size = ico[start] || 256;
  const length = ico.readUInt32LE(start + 8);
  const offset = ico.readUInt32LE(start + 12);
  expected.set(size, ico.subarray(offset, offset + length));
}

/** Verify the actual Windows PE resource, rather than builder configuration. */
export function checkExecutableIcon(path) {
  const entries = NtExecutableResource.from(NtExecutable.from(readFileSync(path), { ignoreCert: true })).entries;
  const groups = Resource.IconGroupEntry.fromEntries(entries);
  const branded = groups.some(group => [...expected].every(([size, payload]) => {
    const item = group.icons.find(icon => (icon.width || 256) === size && (icon.height || 256) === size);
    const resource = item && entries.find(entry => entry.type === 3 && entry.id === item.iconID && entry.lang === group.lang);
    return resource && Buffer.from(resource.bin).equals(payload);
  }));
  assert.ok(branded, path + ': missing byte-identical seven-size brand icon group');
  console.log('Windows PE icon PASS (16/24/32/48/64/128/256): ' + path);
}

export function checkWindowsInstallBranding(variant, expectSeam) {
  for (const path of [variant.installer, join(variant.installDir, 'CS2 Analyst.exe'), join(variant.installDir, 'Uninstall CS2 Analyst.exe')]) checkExecutableIcon(path);
  const quote = text => "'" + text.replaceAll("'", "''") + "'";
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $brandingShell = New-Object -ComObject WScript.Shell
    $brandingExplorer = New-Object -ComObject Shell.Application
    $brandingLinks = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) | ForEach-Object {
      $brandingPath = Join-Path $_ 'CS2 Analyst.lnk'
      if (Test-Path -LiteralPath $brandingPath) {
        $brandingLink = $brandingShell.CreateShortcut($brandingPath)
        $brandingFolder = $brandingExplorer.NameSpace((Split-Path $brandingPath))
        $brandingItem = $brandingFolder.ParseName((Split-Path $brandingPath -Leaf))
        [pscustomobject]@{ path=$brandingPath; target=$brandingLink.TargetPath; icon=$brandingLink.IconLocation; appId=$brandingItem.ExtendedProperty('System.AppUserModel.ID') }
      }
    }
    $brandingApps = @(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -eq 'CS2 Analyst' -and $_.UninstallString.Contains(${quote(variant.installDir)}) } |
      Select-Object DisplayName, DisplayIcon, UninstallString, PSChildName)
    @{ links=@($brandingLinks); apps=$brandingApps } | ConvertTo-Json -Depth 5 -Compress
  `], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(result.stdout.trim());
  assert.equal(state.links.length, 2, 'Desktop and Start Menu links must both exist');
  for (const link of state.links) {
    assert.equal(link.target.toLowerCase(), join(variant.installDir, 'CS2 Analyst.exe').toLowerCase());
    // NSIS uses the executable's embedded brand icon (index 0).
    assert.equal(link.icon.toLowerCase(), (join(variant.installDir, 'CS2 Analyst.exe') + ',0').toLowerCase());
    assert.equal(link.appId, 'com.evanpatchouli.cs2analyst' + (expectSeam ? '.testseam' : ''));
  }
  assert.equal(state.apps.length, 1, 'Programs/Apps registration must exist');
  const registration = state.apps[0];
  assert.equal(registration.DisplayName, 'CS2 Analyst');
  assert.equal(registration.DisplayIcon.toLowerCase(), join(variant.installDir, 'uninstallerIcon.ico').toLowerCase());
  assert.deepEqual(readFileSync(registration.DisplayIcon), ico, 'Apps list icon must be the same multi-size brand ICO');
  assert.ok(registration.UninstallString.includes('Uninstall CS2 Analyst.exe'));
  console.log('Desktop/Start Menu icon targets and Programs/Apps uninstall registration PASS: ' + JSON.stringify(state));
}
