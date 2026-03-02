#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DOMAIN = 'https://race.sauchukmaze.com';
const CHECKPOINTS = ['START', 'C1', 'C2', 'C3', 'C4', 'FINISH'];
const outputJson = path.join(__dirname, '..', 'data', 'checkpoints.json');
const outputCsv = path.join(__dirname, '..', 'data', `qr_urls_${new Date().toISOString().slice(0, 10)}.csv`);

function token() {
  return crypto.randomBytes(18).toString('base64url');
}

const rotatedAt = new Date().toISOString();
const json = {};
const lines = ['checkpoint,qr_url'];

for (const cp of CHECKPOINTS) {
  const tok = token();
  json[cp] = { tok, active: true, rotatedAt };
  const url = `${DOMAIN}/scan?cp=${encodeURIComponent(cp)}&tok=${encodeURIComponent(tok)}`;
  lines.push(`${cp},${url}`);
}

fs.writeFileSync(outputJson, `${JSON.stringify(json, null, 2)}\n`);
fs.writeFileSync(outputCsv, `${lines.join('\n')}\n`);

console.log(`Updated ${outputJson}`);
console.log(`Wrote ${outputCsv}`);
console.log(lines.join('\n'));
