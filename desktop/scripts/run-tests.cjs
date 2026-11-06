'use strict';
// Always test the current service source. A stale ignored runtime must never
// make a source regression look green. Accept the same substring filter as web.
const { execFileSync, spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const filters = process.argv.slice(2);
const files = readdirSync(join(root, 'test')).filter(name => name.endsWith('.test.cjs') && (!filters.length || filters.some(filter => name.includes(filter)))).sort();
if (!files.length) { console.error('No desktop test files matched.'); process.exit(1); }
execFileSync(process.execPath, [join(__dirname, 'build-service.cjs')], { cwd: root, stdio: 'inherit' });
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.map(name => join(root, 'test', name))], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
