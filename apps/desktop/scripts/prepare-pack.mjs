import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// One internal loader, one verified MSVC binary, no official-package fallback.
const desktopDir = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../../../packages/dem-parser/package.json', import.meta.url));
const name = '@cs2-analyst/demoparser-native';
const packageDir = dirname(require.resolve(name));
const source = require(name).getBindingProvenance();
const modules = join(desktopDir,'dist/electron/node_modules');
for(const namespace of ['@laihoe','@cs2-analyst']) rmSync(join(modules,namespace),{recursive:true,force:true});
const target = join(modules,name);
mkdirSync(target,{recursive:true});
for(const file of ['index.cjs','index.d.ts','package.json','source.json','native']) cpSync(join(packageDir,file),join(target,file),{recursive:true});
const staged = createRequire(join(target,'package.json'))(join(target,'index.cjs')).getBindingProvenance();
if(staged.verifiedSha256 !== source.verifiedSha256) throw new Error('Staged native parser SHA differs from build');
console.log('native parser staged: '+JSON.stringify(staged));
