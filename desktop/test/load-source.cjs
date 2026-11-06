'use strict';
const { build } = require('esbuild');
const { mkdtemp, rm } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
// Small source-policy tests do not add test-only exports to the shipped worker.
module.exports = async (t, path) => {
  const dir = await mkdtemp(join(tmpdir(), 'subwave-source-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outfile = join(dir, 'source.cjs');
  await build({ entryPoints: [resolve(__dirname, '..', path)], outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'silent' });
  return require(outfile);
};
