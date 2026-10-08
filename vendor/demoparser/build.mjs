import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const vendor = dirname(fileURLToPath(import.meta.url));
const root = resolve(vendor, '../..');
const output = join(root, 'packages/demoparser-native/native');
const sourceInfo = JSON.parse(readFileSync(join(root, 'packages/demoparser-native/source.json'), 'utf8'));
const repository = join(vendor, '.build/source');
const source = join(vendor, '.build/work');
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(process.platform + '-' + process.arch, 'win32-x64');
for (const [name, expected] of Object.entries(sourceInfo.patches)) assert.equal(sha(join(vendor,name)),expected);
let env = Object.fromEntries(Object.entries(process.env).map(([k,v])=>[k.toUpperCase(),v]));
const localCargo = join(vendor, '.build/cargo/bin');
if (existsSync(join(localCargo,'cargo.exe'))) {
  env.CARGO_HOME = join(vendor,'.build/cargo');
  env.RUSTUP_HOME = join(vendor,'.build/rustup');
  env.PATH = localCargo + ';' + env.PATH;
}
const setup = process.env.CS2_ANALYST_MSVC_SETUP ?? join(vendor,'.build/msvc/setup_x64.bat');
if (existsSync(setup)) {
  assert.ok(!/["\r\n]/.test(setup));
  const text = execFileSync('cmd.exe',['/d','/s','/c',`"call "${setup}" >nul && set"`],{env,encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true});
  for (const line of text.split(/\r?\n/)) {const i=line.indexOf('=');if(i>0) env[line.slice(0,i).toUpperCase()]=line.slice(i+1);}
}
const run = (cmd,args,cwd=source, capture=false) => execFileSync(cmd,args,{cwd,env,windowsHide:true,stdio:capture?'pipe':'inherit',encoding:'utf8'});
assert.match(run('rustc',['--version'],root,true), new RegExp(`^rustc ${sourceInfo.rustVersion.replaceAll('.','\\.')}`));
assert.ok(env.VCTOOLSVERSION, 'Run in an MSVC developer shell or set CS2_ANALYST_MSVC_SETUP to setup_x64.bat / vcvars64.bat');
mkdirSync(dirname(source),{recursive:true});
if (!existsSync(join(repository,'.git'))) run('git',['clone','--no-checkout',sourceInfo.repository,repository],root);
// Disposable source checkout only. No product files or user Cargo cache are reset.
const archive = join(vendor,'.build/base.tar');
run('git',['archive','--format=tar','--output',archive,sourceInfo.baseCommit],repository);
// git archive bypasses developer checkout filters / CRLF configuration.
rmSync(source,{recursive:true,force:true});
mkdirSync(source,{recursive:true});
run('tar.exe',['-xf',archive,'-C',source],root);
function canonicalText(dir) {
  for(const entry of readdirSync(dir,{withFileTypes:true})) {
    if(entry.name === 'target') continue;
    const path=join(dir,entry.name);
    if(entry.isDirectory()) canonicalText(path);
    else if(/\.(rs|toml|lock)$/.test(entry.name)) writeFileSync(path,readFileSync(path,'utf8').replaceAll('\r\n','\n'));
  }
}
canonicalText(join(source,'src'));
env.GIT_CEILING_DIRECTORIES = dirname(source);
for(const name of ['backport-363.patch','build-support.patch']) run('git',['-c','core.autocrlf=false','apply',join(vendor,name)]);
assert.equal(sha(join(source,'src/csgoproto/src/protobuf.rs')),sourceInfo.protobufSha256);
for(const [path,hash] of Object.entries(sourceInfo.generatedSourceHashes)) assert.equal(sha(join(source,path)),hash);
assert.equal(sha(join(source,'src/node/Cargo.lock')),sourceInfo.cargoLockSha256);
env.RUSTFLAGS = `-C link-arg=/Brepro --remap-path-prefix=${source}=/demoparser`;
env.CARGO_INCREMENTAL = '0';
env.CARGO_TARGET_DIR = join(vendor,'.build/target');
const nodeDir = join(source,'src/node');
if (process.argv.includes('--clean')) run('cargo',['clean','--manifest-path',join(nodeDir,'Cargo.toml')]);
run('cargo',['test','--locked','--manifest-path',join(source,'src/parser/Cargo.toml'),'entity_handle::tests','--target',sourceInfo.target]);
const require = createRequire(join(root,'packages/demoparser-native/package.json'));
const cli = require.resolve('@napi-rs/cli/scripts/index.js');
run(process.execPath,[cli,'build','--platform','--release','--target',sourceInfo.target,'--cargo-flags=--locked'],nodeDir);
const binary = join(nodeDir,'demoparser2.win32-x64-msvc.node');
assert.equal(sha(join(nodeDir,'Cargo.lock')),sourceInfo.cargoLockSha256,'Cargo changed the locked dependency graph');
for(const [path,hash] of Object.entries(sourceInfo.generatedSourceHashes)) assert.equal(sha(join(source,path)),hash,'Generated source changed during build');
const pe = readFileSync(binary);
assert.equal(pe.readUInt16LE(pe.readUInt32LE(0x3c)+4),0x8664,'Expected PE AMD64');
mkdirSync(output,{recursive:true});
copyFileSync(binary,join(output,'demoparser2.win32-x64-msvc.node'));
const provenance = {source:sourceInfo,target:sourceInfo.target,rust:run('rustc',['--version'],root,true).trim(),cargo:run('cargo',['--version'],root,true).trim(),msvc:env.VCTOOLSVERSION,sdk:env.WINDOWSSDKVERSION,node:process.version,nodeApi:process.versions.napi,nativeApi:'napi6',napiCli:require('@napi-rs/cli/package.json').version,sourceGeneration:'Both generators disabled: exact tag protobuf.rs, maps.rs, message_type.rs retained; no GameTracking fetch / protoc',binary:{filename:'demoparser2.win32-x64-msvc.node',sha256:sha(binary)}};
writeFileSync(join(output,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
run(process.execPath,[join(root,'packages/demoparser-native/verify.mjs')],root);
