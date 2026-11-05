const { cp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

(async () => {
  const root = resolve(__dirname, '../..');
  const env = { ...process.env, NEXT_PUBLIC_SUBWAVE_DESKTOP: '1', SUBWAVE_NEXT_DIST_DIR: '.next-desktop', NEXT_PUBLIC_API_URL: '', NEXT_PUBLIC_STREAM_URL: '' };
  // Runtime station connection belongs to the desktop gateway. Never bake a
  // developer's controller address or credentials into the distribution.
  const built = spawnSync('npm', ['run', 'build'], { cwd: join(root, 'web'), env, stdio: 'inherit' });
  if (built.status !== 0) process.exit(built.status || 1);
  const target = join(root, 'desktop/runtime/web');
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(join(root, 'web/.next-desktop/standalone'), target, { recursive: true });
  // Next follows distDir at runtime too; its standalone server already points
  // at .next-desktop. Public assets are deliberately copied alongside it.
  await cp(join(root, 'web/.next-desktop/static'), join(target, '.next-desktop/static'), { recursive: true });
  await cp(join(root, 'web/public'), join(target, 'public'), { recursive: true });
  // Standalone traces may copy local env files: they must never ship.
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) await rm(join(target, name), { force: true });
  const themes = [];
  for (const name of ['classic-light', 'classic-dark', 'enochian-ivory', 'enochian-obsidian']) {
    themes.push(JSON.parse(await readFile(join(root, `controller/src/themes/builtin/${name}.json`), 'utf8')));
  }
  await writeFile(join(root, 'desktop/assets/themes.json'), JSON.stringify(themes));
  await cp(join(root, 'LICENSE'), join(root, 'desktop/assets/LICENSE'));
  console.log('Desktop interface prepared with Original and Enochian.');
})().catch(error => { console.error(error); process.exit(1); });
