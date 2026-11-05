const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
for (const dir of ['src', 'scripts', 'test']) {
  for (const file of readdirSync(join(__dirname, '..', dir))) {
    if (/\.(cjs|js)$/.test(file)) execFileSync(process.execPath, ['--check', join(__dirname, '..', dir, file)], { stdio: 'inherit' });
  }
}
console.log('Desktop JavaScript checks passed.');
