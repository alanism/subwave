const { readFile, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { version } = require('../package.json');
(async () => {
  const template = await readFile(resolve(__dirname, 'launch-linux.sh'), 'utf8');
  await writeFile(resolve(__dirname, '../dist/Start Subwave'), template.replace('Subwave-1.0.0-linux', `Subwave-${version}-linux`), { mode: 0o755 });
})().catch(error => { console.error(error); process.exit(1); });
