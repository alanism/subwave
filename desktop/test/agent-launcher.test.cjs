'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, writeFile, symlink, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

test('packaged helper resolves user-bin symlinks and paths with spaces before starting the bundled Node runtime', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'subwave-launcher-'));
  try {
    const native = join(dir, 'app with spaces'), bin = join(dir, 'bin');
    await mkdir(native); await mkdir(bin);
    await writeFile(join(native, 'subwave-agent'), await readFile(join(__dirname, '../scripts/launch-agent.sh')), { mode: 0o755 });
    await writeFile(join(native, 'subwave'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),nodeMode:process.env.ELECTRON_RUN_AS_NODE}));\n', { mode: 0o755 });
    await symlink(join(native, 'subwave-agent'), join(bin, 'subwave-agent'));
    const value = JSON.parse(execFileSync(join(bin, 'subwave-agent'), ['call', 'subwave_search_library', '{"query":"two words"}'], { encoding: 'utf8' }));
    assert.equal(value.nodeMode, '1');
    assert.deepEqual(value.args, [join(native, 'resources/service/agent.cjs'), 'call', 'subwave_search_library', '{"query":"two words"}']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
