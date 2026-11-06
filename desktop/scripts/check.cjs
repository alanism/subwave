const { readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
for (const dir of ['src', 'scripts', 'test']) {
  for (const file of readdirSync(join(__dirname, '..', dir))) {
    if (/\.(cjs|js)$/.test(file)) execFileSync(process.execPath, ['--check', join(__dirname, '..', dir, file)], { stdio: 'inherit' });
  }
}
// The desktop build already requires web's installed dependencies. Use that
// declared compiler to check the service/agent TS that esbuild only strips.
const tsc = require.resolve('typescript/bin/tsc', { paths: [resolve(__dirname, '../../web')] });
execFileSync(process.execPath, [tsc, '--project', resolve(__dirname, '../tsconfig.json')], { stdio: 'inherit' });
console.log('Desktop JavaScript and service/agent TypeScript checks passed.');
