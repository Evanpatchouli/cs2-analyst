'use strict';
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const bindingPath = join(__dirname, 'native', 'demoparser2.win32-x64-msvc.node');
function getBindingProvenance() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('CS2 Analyst native parser requires Windows x64');
  const provenance = JSON.parse(readFileSync(join(__dirname, 'native', 'provenance.json'), 'utf8'));
  const expected = require('./source.json');
  if (JSON.stringify(provenance.source) !== JSON.stringify(expected)) throw new Error('Native parser source provenance mismatch; run pnpm parser:build-fixed');
  const sha256 = createHash('sha256').update(readFileSync(bindingPath)).digest('hex');
  if (sha256 !== provenance.binary.sha256 || provenance.target !== 'x86_64-pc-windows-msvc') throw new Error('Native parser binary integrity mismatch');
  return { ...provenance, bindingPath, verifiedSha256: sha256 };
}
getBindingProvenance();
const binding = require(bindingPath);
module.exports.parseHeader = binding.parseHeader;
module.exports.parsePlayerInfo = binding.parsePlayerInfo;
module.exports.parseEvents = binding.parseEvents;
module.exports.parseEvent = binding.parseEvent;
module.exports.parseTicks = binding.parseTicks;
module.exports.parseGrenades = binding.parseGrenades;
module.exports.listGameEvents = binding.listGameEvents;
module.exports.listUpdatedFields = binding.listUpdatedFields;
module.exports.getBindingProvenance = getBindingProvenance;
