const { build } = require('esbuild');
const { resolve } = require('node:path');
const { mkdir } = require('node:fs/promises');
(async () => {
  const root = resolve(__dirname, '..');
  await mkdir(resolve(root, 'runtime/service'), { recursive: true });
  await build({ entryPoints: [resolve(root, 'service/station.ts')], outfile: resolve(root, 'runtime/service/station.cjs'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node24', sourcemap: false,
    nodePaths: [resolve(root, 'node_modules')], logLevel: 'warning' });
  console.log('Bundled local station, library and YouTube download service.');
})().catch(error => { console.error(error); process.exit(1); });
