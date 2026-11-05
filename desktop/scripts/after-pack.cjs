const { cp, access, rm } = require('node:fs/promises');
const { join, resolve } = require('node:path');

// Generic packager resource filters omit nested node_modules. Next's traced
// standalone dependencies are runtime payload, not Electron app dependencies:
// copy the complete prepared tree after packaging, before archive creation.
module.exports = async ({ appOutDir }) => {
  const source = resolve(__dirname, '../runtime/web');
  const target = join(appOutDir, 'resources/web');
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true, dereference: true });
  for (const path of ['server.js', 'node_modules/next/package.json', '.next-desktop/BUILD_ID', 'public/skins/enochian/fonts/ibm-plex-mono-400.ttf']) await access(join(target, path));
  const serviceSource = resolve(__dirname, '../runtime/service');
  const serviceTarget = join(appOutDir, 'resources/service');
  await rm(serviceTarget, { recursive: true, force: true });
  await cp(serviceSource, serviceTarget, { recursive: true, dereference: true });
  await access(join(serviceTarget, 'station.cjs'));
  console.log('Verified complete desktop interface and bundled local station runtime.');
};
