// Installs and uninstalls only this task's NSIS test directories. Never touches an existing user install.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync,mkdirSync,readFileSync,rmSync,statSync,writeFileSync } from 'node:fs';
import { join,resolve,sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { inspectReplayPackage } from './replay-package-inspection.mjs';
import { sha256 } from './replay-resource-audit.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),base=resolve(tmpdir(),'cs2-analyst-p6-installed');
const version=JSON.parse(readFileSync(join(root,'apps/desktop/package.json'),'utf8')).version;
const registryProbe=String.raw`
$ErrorActionPreference='Stop'
$found=@()
foreach($taskHive in @([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryHive]::LocalMachine)) {
  foreach($taskView in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)) {
    $taskBase=[Microsoft.Win32.RegistryKey]::OpenBaseKey($taskHive,$taskView)
    try {
      $taskUninstall=$taskBase.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall')
      if($taskUninstall) { try { foreach($taskName in $taskUninstall.GetSubKeyNames()) {
        $taskEntry=$taskUninstall.OpenSubKey($taskName)
        try { if($taskEntry.GetValue('DisplayName') -eq 'CS2 Analyst') { $found += [pscustomobject]@{ Hive="$taskHive";View="$taskView";InstallLocation=$taskEntry.GetValue('InstallLocation') } } } finally { $taskEntry.Dispose() }
      } } finally { $taskUninstall.Dispose() } }
    } finally { $taskBase.Dispose() }
  }
}
ConvertTo-Json -InputObject @($found) -Compress
`;
const registrations=spawnSync('pwsh',['-NoProfile','-Command',registryProbe],{encoding:'utf8',windowsHide:true});
assert.equal(registrations.status,0);const entries=JSON.parse(registrations.stdout||'[]');
for(const record of Array.isArray(entries)?entries:[entries])assert.ok(record.InstallLocation&&resolve(record.InstallLocation).toLowerCase().startsWith((base+sep).toLowerCase())&&existsSync(join(record.InstallLocation,'.p6-owned')),'Existing user install detected; do not overwrite it');
const results=[];
async function waitFor(fn,label){const end=Date.now()+120000;while(Date.now()<end){if(fn())return;await delay(150);}throw new Error(`Timed out: ${label}`);}
for(const variant of ['production','test-seam']){
  const directory=resolve(base,variant);assert.ok(directory.startsWith(base+sep));
  const owner=join(directory,'.p6-owned');
  if(existsSync(directory)){assert.ok(existsSync(owner),'Do not reset an unowned install directory');rmSync(directory,{recursive:true,force:true});}
  mkdirSync(directory,{recursive:true});writeFileSync(owner,'CS2 Analyst P6 local install test');
  const installer=variant==='production'?join(root,'release',version,`CS2-Analyst-Setup-${version}.exe`):join(root,'.tmp/test-output',version,`CS2-Analyst-TestSeam-Setup-${version}.exe`);
  assert.ok(existsSync(installer));
  const record={variant,installerBytes:statSync(installer).size,installerSha256:sha256(readFileSync(installer))};
  let installed=false;
  try{
    const install=spawnSync(installer,['/S','/D='+directory],{windowsHide:true,encoding:'utf8',timeout:120000});assert.equal(install.status,0,install.stderr);installed=true;
    const executable=join(directory,'CS2 Analyst.exe');await waitFor(()=>existsSync(executable),variant+' installation');
    record.package=inspectReplayPackage(directory,variant);
    console.log(JSON.stringify({stage:'installed',variant,images:record.package.imagePaths.length}));
    const args=[join(root,'scripts/replay-smoke.mjs'),executable,...(variant==='production'?['--production']:[])];
    const smoke=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,stdio:'inherit',timeout:240000});assert.equal(smoke.status,0,`${variant} real installed smoke failed`);
    if(variant==='test-seam'){
      const corrupt=spawnSync(process.execPath,[join(root,'scripts/replay-smoke.mjs'),executable,'--broken'],{cwd:root,windowsHide:true,stdio:'inherit',timeout:120000});assert.equal(corrupt.status,0,'Installed corrupt DEM smoke failed');
    }
    record.status='PASS';
  }finally{
    const uninstaller=join(directory,'Uninstall CS2 Analyst.exe');
    if(installed&&existsSync(uninstaller)){
      const uninstall=spawnSync(uninstaller,['/S'],{windowsHide:true,encoding:'utf8',timeout:120000});assert.equal(uninstall.status,0,uninstall.stderr);
      await waitFor(()=>!existsSync(join(directory,'CS2 Analyst.exe')),variant+' uninstall');record.uninstalled=true;
    }
    assert.ok(resolve(directory).startsWith(base+sep));if(existsSync(owner))rmSync(directory,{recursive:true,force:true,maxRetries:8,retryDelay:250});
  }
  results.push(record);
}
writeFileSync(join(root,'.tmp/p6-qa/installed-summary.json'),JSON.stringify(results,null,2)+'\n');
console.log('P6 local Windows production/test-seam install, offline assets and installed replay checks PASS; both test installs removed.');
