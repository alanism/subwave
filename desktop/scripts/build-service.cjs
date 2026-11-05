const { build } = require('esbuild');
const { resolve } = require('node:path');
const { mkdir, readFile, readdir, writeFile } = require('node:fs/promises');
(async () => {
  const root = resolve(__dirname, '..');
  await mkdir(resolve(root, 'runtime/service'), { recursive: true });
  await build({ entryPoints: [resolve(root, 'service/station.ts')], outfile: resolve(root, 'runtime/service/station.cjs'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node24', sourcemap: false,
    nodePaths: [resolve(root, 'node_modules')], logLevel: 'warning' });
  const dependencies = new Set();
  for (const [entry, output] of [['src/agent-tools.cjs', 'agent-tools.cjs'], ['agent/index.ts', 'agent.cjs']]) {
    const result = await build({ entryPoints: [resolve(root, entry)], outfile: resolve(root, 'runtime/service', output),
      bundle: true, platform: 'node', format: 'cjs', target: 'node24',
      nodePaths: [resolve(root, 'node_modules')], logLevel: 'warning', metafile: true });
    for (const input of Object.keys(result.metafile.inputs)) {
      const packageRoot = /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(resolve(input))?.[1];
      if (packageRoot) dependencies.add(packageRoot);
    }
  }
  const notices = [];
  for (const dir of [...dependencies].sort()) {
    const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'));
    const files = (await readdir(dir)).filter(name => /^(license|licence)(\.|$|-)/i.test(name));
    notices.push(`${pkg.name} ${pkg.version}\n${(await Promise.all(files.map(name => readFile(resolve(dir, name), 'utf8')))).join('\n')}`);
  }
  await writeFile(resolve(root, 'runtime/service/THIRD_PARTY_NOTICES.txt'), notices.join('\n\n----------------------------------------\n\n'));
  console.log('Bundled local station, library and YouTube download service.');
})().catch(error => { console.error(error); process.exit(1); });
