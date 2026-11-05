// Local MP3s and genre destinations must survive retries/restarts independently
// of Navidrome. Downloader responses are fixtures; FFmpeg processes real audio.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyFile, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import { youtubeDownloadSchema, youtubeImportFormSchema, youtubeRoutingSchema, youtubeSearchSchema, youtubeVideoId, type YoutubeJob, type YoutubeRoute } from '../src/schemas/youtube.js';
import { routeYoutubeVideo, videoFromInfo, youtubeFilename } from '../src/music/youtube/pure.js';
import { runProcess, type RunProcess } from '../src/music/youtube/process.js';
import { YoutubeImports, youtubeLibraryFolder } from '../src/music/youtube/service.js';
import { conversionAction, duplicateAction } from '../src/stations/pure.js';

const root = createTempDir(join(tmpdir(), 'youtube-test-'));
after(async () => { await removeTempDir(root); });
const routes: YoutubeRoute[] = [
  { stationId: 'jazz', genre: 'Jazz', aliases: ['bebop'], folder: 'YouTube/Jazz' },
  { stationId: 'house', genre: 'House', aliases: ['deep house'], folder: 'YouTube/House' },
];
const details = (id = 'BaW_jenozKc') => ({ id, title: 'Evening Jazz', artist: 'Test Artist', uploader: 'Test Channel', duration: 12, genres: ['Jazz'], tags: ['Bebop'] });
const video = videoFromInfo(details());
async function fixture(name: string, options: { failDownload?: boolean; offlineScan?: boolean; noLibrary?: boolean } = {}) {
  const dir = join(root, name), store = join(dir, 'store'), library = join(dir, 'library'), downloads = join(dir, 'Recent YT downloads');
  await mkdir(library, { recursive: true });
  const audio = join(dir, 'fixture.mp3');
  await runProcess('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=0.2', '-q:a', '9', audio]);
  const calls: string[][] = [];
  const run: RunProcess = async (binary, args, processOptions) => {
    calls.push([binary, ...args]);
    if (binary === 'ffmpeg') return runProcess(binary, args, processOptions);
    if (args.includes('--version')) return 'fixture';
    if (args.includes('--dump-single-json')) return JSON.stringify(args.includes('--flat-playlist') ? { entries: [details(), { id: 'bad' }, { ...details('aaaaaaaaaaa'), is_live: true }] } : details(args.at(-1)?.split('v=')[1]));
    if (options.failDownload) throw new Error('fixture extraction failed');
    const output = args[args.indexOf('-o') + 1].replace('%(ext)s', 'mp3');
    processOptions?.onLine?.('download: 50.0%');
    await copyFile(audio, output); return '';
  };
  const service = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: options.noLibrary ? '' : library, run, stationExists: id => ['jazz', 'house'].includes(id), scanStation: async () => { if (options.offlineScan) throw new Error('offline'); } });
  await service.configure({ routes });
  const result = { service, store, downloads, library, calls, run };
  return result;
}
async function settled(service: YoutubeImports, predicate: (job: YoutubeJob) => boolean) {
  for (let n = 0; n < 300; n++) {
    const jobs = await service.list(); if (jobs[0] && predicate(jobs[0])) return jobs[0];
    await sleep(10);
  }
  assert.fail(`Queue did not settle: ${JSON.stringify(await service.list())}`);
}

test('search and shared form reject malformed pasted links while preserving text queries and valid YouTube URLs', () => {
  for (const query of ['Miles Davis So What', 'https://youtu.be/BaW_jenozKc']) {
    assert.equal(youtubeSearchSchema.safeParse({ query }).success, true);
    assert.equal(youtubeImportFormSchema.safeParse({ query }).success, true);
  }
  for (const query of ['https://example.com/not-youtube', 'https://youtube.com/watch?v=broken', 'www.youtube.com/watch?v=broken', 'ftp://youtu.be/BaW_jenozKc']) {
    assert.equal(youtubeSearchSchema.safeParse({ query }).success, false, query);
    const form = youtubeImportFormSchema.safeParse({ query });
    assert.equal(form.success, false, query);
    if (!form.success) assert.match(form.error.issues[0]!.message, /valid YouTube video URL/);
  }
});
test('YouTube-only URL canonicalisation refuses credentials, lookalikes and arbitrary extractors', () => {
  for (const url of ['https://youtu.be/BaW_jenozKc?t=2', 'https://music.youtube.com/watch?v=BaW_jenozKc&list=evil', 'https://www.youtube.com/shorts/BaW_jenozKc']) assert.equal(youtubeVideoId(url), 'BaW_jenozKc');
  for (const url of ['file:///tmp/a', 'https://youtube.com.evil/watch?v=BaW_jenozKc', 'https://user@youtube.com/watch?v=BaW_jenozKc', 'https://youtube.com:8080/watch?v=BaW_jenozKc', '--exec=x', 'https://youtube.com/playlist?list=x']) assert.equal(youtubeDownloadSchema.safeParse({ url }).success, false);
});
test('genre policy uses song evidence, refuses ties and generic Music, supports aliases', () => {
  assert.equal(routeYoutubeVideo(video, routes)?.stationId, 'jazz');
  assert.equal(routeYoutubeVideo({ ...video, genres: [], tags: ['Deep House'] }, routes)?.stationId, 'house');
  assert.equal(routeYoutubeVideo({ ...video, genres: ['Jazz', 'House'], tags: [], title: 'Song' }, routes), null);
  assert.equal(routeYoutubeVideo({ ...video, genres: [], tags: [], title: 'Song', channel: 'Jazz Channel' }, routes), null);
  assert.deepEqual(videoFromInfo({ ...details(), genres: ['Music'] }).genres, []);
  assert.throws(() => videoFromInfo({ ...details(), is_live: true }), /live stream/);
  assert.throws(() => videoFromInfo({ ...details(), duration: 1801 }), /30 minutes/);
  assert.ok(!youtubeFilename({ ...video, title: '../evil/$()' }).includes('/'));
});
test('routing validation normalises aliases, rejects path escapes and duplicate stations', () => {
  assert.deepEqual(youtubeRoutingSchema.parse({ routes: [{ ...routes[0], aliases: 'bebop, hard bop' }] }).routes[0].aliases, ['bebop', 'hard bop']);
  for (const folder of ['../outside', '/music', '\\outside', 'C:\\music', 'a//b', 'a/./b']) assert.equal(youtubeRoutingSchema.safeParse({ routes: [{ ...routes[0], folder }] }).success, false);
  assert.equal(youtubeRoutingSchema.safeParse({ routes: [routes[0], routes[0]] }).success, false);
});
test('search returns bounded valid videos and passes queries as data', async () => {
  const { service, calls } = await fixture('search');
  assert.equal((await service.search({ query: 'jazz $(touch nope)' })).length, 1);
  assert.equal(calls.at(-1)?.at(-1), 'ytsearch8:jazz $(touch nope)');
  await assert.rejects(service.search({ query: 'https://example.com/file' }), /YouTube/);
  await service.search({ query: 'https://youtu.be/BaW_jenozKc?list=evil' });
  assert.equal(calls.at(-1)?.at(-1), video.url);
});
test('auto import preserves original, tags a station copy, persists across restart and deduplicates', async () => {
  const { service, library, store, downloads } = await fixture('auto', { offlineScan: true });
  const queued = await service.enqueue({ url: video.url });
  const done = await settled(service, j => j.copies.length === 1 && !!j.copies[0].scanWarning);
  assert.equal(done.suggestedStationId, 'jazz'); assert.equal(done.state, 'imported');
  const original = await service.file(done.id); assert.ok((await readFile(original.path)).length > 0);
  const tagged = join(library, done.copies[0].path);
  const metadata = JSON.parse(await runProcess('ffprobe', ['-v', 'quiet', '-show_entries', 'format_tags=genre,artist,title', '-of', 'json', tagged]));
  assert.equal(metadata.format.tags.genre, 'Jazz'); assert.equal(metadata.format.tags.artist, 'Test Artist');
  assert.equal((await service.enqueue({ url: video.url })).id, queued.id);
  assert.equal((await service.add(done.id, 'jazz')).copies.length, 1);
  const houseCopy = await service.add(done.id, 'house');
  assert.equal(houseCopy.copies.length, 2);
  const houseTags = JSON.parse(await runProcess('ffprobe', ['-v', 'quiet', '-show_entries', 'format_tags=genre', '-of', 'json', join(library, houseCopy.copies[1].path)]));
  assert.equal(houseTags.format.tags.genre, 'House');
  const restarted = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: library, stationExists: () => true });
  assert.equal((await restarted.list())[0].copies.length, 2);
  assert.deepEqual((await restarted.routing()).routes, routes);
  assert.equal((await restarted.file(done.id)).filename, done.filename);
});
test('downloads remain available without a connected station library', async () => {
  const { service } = await fixture('manual', { noLibrary: true });
  await service.enqueue({ url: video.url, autoImport: false });
  const ready = await settled(service, j => j.state === 'ready');
  assert.equal(ready.copies.length, 0); assert.ok(await service.file(ready.id));
  await assert.rejects(service.add(ready.id, 'jazz'), /YT_LIBRARY_PATH/);
});
test('failed extraction can be retried without losing its queue identity', async () => {
  const options = { failDownload: true };
  const { service } = await fixture('retry', options);
  const first = await service.enqueue({ url: video.url, autoImport: false });
  await settled(service, j => j.state === 'failed');
  options.failDownload = false;
  assert.equal((await service.retry(first.id)).id, first.id);
  assert.equal((await settled(service, j => j.state === 'ready')).progress, 100);
});
test('library links cannot escape root; collisions keep existing files intact', async () => {
  const { service, library } = await fixture('collision');
  const outside = join(root, 'outside'); await mkdir(outside);
  await symlink(outside, join(library, 'linked'));
  await assert.rejects(youtubeLibraryFolder(library, 'linked/subdir'), /links/);
  await service.enqueue({ url: video.url, autoImport: false });
  const ready = await settled(service, j => j.state === 'ready');
  const folder = await youtubeLibraryFolder(library, routes[0].folder), target = join(folder, ready.filename!);
  await writeFile(target, 'keep me');
  await assert.rejects(service.add(ready.id, 'jazz'), /EEXIST/);
  assert.equal(await readFile(target, 'utf8'), 'keep me');
  await assert.rejects(service.add(ready.id, 'jazz'), /kept unchanged/);
});
test('restart adopts a matching published copy from its durable import journal', async () => {
  const { service, library, store, downloads } = await fixture('recovery');
  await service.enqueue({ url: video.url, autoImport: false });
  const ready = await settled(service, j => j.state === 'ready');
  const folder = await youtubeLibraryFolder(library, routes[0].folder), target = join(folder, ready.filename!);
  await copyFile((await service.file(ready.id)).path, target);
  ready.pendingCopy = { stationId: 'jazz', genre: 'Jazz', path: join(routes[0].folder, ready.filename!), addedAt: new Date().toISOString(), sha256: createHash('sha256').update(await readFile(target)).digest('hex') };
  await writeFile(join(store, 'jobs', `${ready.id}.json`), JSON.stringify(ready));
  const restarted = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: library, stationExists: () => true });
  const recovered = await restarted.add(ready.id, 'jazz');
  assert.equal(recovered.copies.length, 1); assert.equal(recovered.pendingCopy, undefined);
});
test('interrupted jobs fail visibly, published downloads recover only with matching hashes', async () => {
  const { service, library, store, downloads } = await fixture('interrupted');
  await service.enqueue({ url: video.url, autoImport: false });
  const ready = await settled(service, j => j.state === 'ready');
  ready.state = 'downloading';
  const file = join(store, 'jobs', `${ready.id}.json`); await writeFile(file, JSON.stringify(ready));
  const options = { storeDir: store, downloadsDir: downloads, libraryRoot: library, stationExists: () => true };
  assert.equal((await new YoutubeImports(options).list())[0].state, 'ready');
  ready.downloadSha256 = '0'.repeat(64); await writeFile(file, JSON.stringify(ready));
  const failed = (await new YoutubeImports(options).list())[0];
  assert.equal(failed.state, 'failed'); assert.match(failed.error!, /interrupted/);
});
test('queue state stays install-level during station conversion and duplication', () => {
  for (const entry of ['youtube-imports', 'Recent YT downloads']) { assert.equal(conversionAction(entry), 'keep'); assert.equal(duplicateAction(entry), 'skip'); }
});
test('process arguments never go through a shell; timeout terminates a stuck command', async () => {
  const literal = '$(touch should-not-exist)';
  assert.equal(await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal]), literal);
  const orphanMarker = join(root, 'orphan-marker');
  const grandchild = `setTimeout(()=>require('node:fs').writeFileSync(process.argv[1],'orphan'),350)`;
  const parent = `require('node:child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]]);setInterval(()=>{},1000)`;
  await assert.rejects(runProcess(process.execPath, ['-e', parent, grandchild, orphanMarker], { timeoutMs: 100 }), /too long/);
  await sleep(400);
  assert.equal(await readFile(orphanMarker).then(() => true, () => false), false, 'timed-out FFmpeg descendants must also stop');
});

// Wait for the durable state before simulating a process restart with a new
// instance. An in-memory ready/imported state can precede its atomic rename.
async function persistedJob(service: YoutubeImports, store: string, predicate: (job: YoutubeJob) => boolean): Promise<YoutubeJob> {
  const job = await settled(service, predicate);
  for (let n = 0; n < 300; n++) {
    const saved = JSON.parse(await readFile(join(store, 'jobs', `${job.id}.json`), 'utf8')) as YoutubeJob;
    if (predicate(saved)) return saved;
    await sleep(10);
  }
  assert.fail('Download state did not reach disk before restart');
}

test('cold resume completes verified automatic imports once without extraction or initialization deadlock', { timeout: 10_000 }, async () => {
  const { service, store, downloads, library, run, calls } = await fixture('cold-auto');
  await service.enqueue({ url: video.url, autoImport: false });
  const ready = await persistedJob(service, store, j => j.state === 'ready');
  const original = await service.file(ready.id), originalBytes = await readFile(original.path);
  ready.state = 'downloading'; ready.autoImport = true; ready.requestedStationId = 'jazz';
  await writeFile(join(store, 'jobs', `${ready.id}.json`), JSON.stringify(ready));
  const before = calls.length;
  let scans = 0;
  const restarted = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: library, run,
    stationExists: () => true, scanStation: async () => {
      scans++;
      const saved = JSON.parse(await readFile(join(store, 'jobs', `${ready.id}.json`), 'utf8')) as YoutubeJob;
      assert.match(saved.copies[0].scanWarning!, /pending/, 'the callback intent must already be on disk');
    } });
  const [jobs] = await Promise.all([restarted.list(), restarted.resume()]);
  assert.equal(jobs[0].id, ready.id); assert.equal(jobs[0].state, 'imported'); assert.equal(jobs[0].copies.length, 1);
  assert.equal(jobs[0].copies[0].scanWarning, null);
  assert.equal(scans, 1); assert.equal(calls.length, before + 1); assert.equal(calls.at(-1)?.[0], 'ffmpeg');
  assert.deepEqual(await readFile(original.path), originalBytes);
  const copied = join(library, jobs[0].copies[0].path), copiedBytes = await readFile(copied);
  const metadata = JSON.parse(await runProcess('ffprobe', ['-v', 'quiet', '-show_entries', 'format_tags=genre', '-of', 'json', copied]));
  assert.equal(metadata.format.tags.genre, 'Jazz');
  await restarted.resume(); await restarted.add(ready.id, 'jazz');
  const cold = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: library, run, stationExists: () => true });
  assert.equal((await cold.list())[0].copies.length, 1); assert.equal(calls.length, before + 1);
  assert.deepEqual(await readFile(copied), copiedBytes);
});

test('cold resume reconciles pending-copy publication and retries its index callback without duplicate bytes', { timeout: 10_000 }, async () => {
  for (const published of [false, true]) {
    const { service, store, downloads, library, run, calls } = await fixture(`cold-journal-${published}`);
    await service.enqueue({ url: video.url, autoImport: false });
    const ready = await persistedJob(service, store, j => j.state === 'ready');
    const original = await service.file(ready.id), originalBytes = await readFile(original.path);
    const folder = await youtubeLibraryFolder(library, routes[0].folder), target = join(folder, ready.filename!);
    if (published) await copyFile(original.path, target);
    ready.state = 'importing'; ready.autoImport = true; ready.requestedStationId = 'jazz';
    ready.pendingCopy = { stationId: 'jazz', genre: 'Jazz', path: join(routes[0].folder, ready.filename!),
      addedAt: new Date().toISOString(), sha256: createHash('sha256').update(originalBytes).digest('hex') };
    await writeFile(join(store, 'jobs', `${ready.id}.json`), JSON.stringify(ready));
    const before = calls.length;
    const restarted = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: library, run,
      stationExists: () => true, scanStation: async () => { throw new Error('index unavailable'); } });
    const recovered = (await restarted.list())[0];
    assert.equal(recovered.id, ready.id); assert.equal(recovered.state, 'imported'); assert.equal(recovered.copies.length, 1);
    assert.equal(recovered.pendingCopy, undefined); assert.match(recovered.copies[0].scanWarning!, /index unavailable/);
    assert.equal(calls.length, before + (published ? 0 : 1));
    const copiedBytes = await readFile(target);
    if (published) assert.deepEqual(copiedBytes, originalBytes, 'adopted bytes must not be retagged or overwritten');
    let scans = 0;
    const cold = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: library, run,
      stationExists: () => true, scanStation: async () => { scans++; } });
    const imported = (await cold.list())[0];
    assert.equal(scans, 1); assert.equal(imported.copies[0].scanWarning, null);
    assert.equal(imported.copies.length, 1); assert.equal(calls.length, before + (published ? 0 : 1));
    await cold.resume(); await cold.add(ready.id, 'jazz');
    assert.equal(scans, 1); assert.deepEqual(await readFile(target), copiedBytes); assert.deepEqual(await readFile(original.path), originalBytes);
  }
});

test('repeated Add retries an existing copy index warning without copying or extracting again', async () => {
  const options = { offlineScan: true };
  const { service, store, calls } = await fixture('retry-index', options);
  await service.enqueue({ url: video.url });
  const imported = await persistedJob(service, store, j => j.state === 'imported' && !!j.copies[0]?.scanWarning?.includes('offline'));
  const before = calls.length;
  options.offlineScan = false;
  const retried = await service.add(imported.id, 'jazz');
  assert.equal(retried.copies.length, 1); assert.equal(retried.copies[0].scanWarning, null); assert.equal(calls.length, before);
});

test('ordinary ready downloads with auto import disabled remain unchanged by resume', async () => {
  const { service, store, downloads, library } = await fixture('cold-manual');
  await service.enqueue({ url: video.url, autoImport: false });
  const ready = await persistedJob(service, store, j => j.state === 'ready');
  const path = join(store, 'jobs', `${ready.id}.json`), source = await readFile(path, 'utf8');
  const run: RunProcess = async () => { throw new Error('resume must not invoke a tool for a manual ready download'); };
  const cold = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: library, run,
    stationExists: () => true, scanStation: async () => assert.fail('manual ready downloads must not be imported') });
  await cold.resume();
  const [job] = await cold.list(); assert.equal(job.state, 'ready'); assert.deepEqual(job.copies, []);
  assert.equal(await readFile(path, 'utf8'), source); assert.ok(await cold.file(ready.id));
});

test('cold recovery preserves a colliding station file and reports the pending journal error', async () => {
  const { service, store, downloads, library, run, calls } = await fixture('cold-collision');
  await service.enqueue({ url: video.url, autoImport: false });
  const ready = await persistedJob(service, store, j => j.state === 'ready');
  const folder = await youtubeLibraryFolder(library, routes[0].folder), target = join(folder, ready.filename!);
  await writeFile(target, 'foreign song');
  ready.state = 'importing'; ready.autoImport = true; ready.requestedStationId = 'jazz';
  ready.pendingCopy = { stationId: 'jazz', genre: 'Jazz', path: join(routes[0].folder, ready.filename!),
    addedAt: new Date().toISOString(), sha256: createHash('sha256').update('different intended bytes').digest('hex') };
  await writeFile(join(store, 'jobs', `${ready.id}.json`), JSON.stringify(ready));
  const before = calls.length;
  const cold = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: library, run, stationExists: () => true });
  const [job] = await cold.list();
  assert.equal(job.state, 'ready'); assert.match(job.error!, /kept unchanged/); assert.equal(job.copies.length, 0);
  assert.equal(await readFile(target, 'utf8'), 'foreign song'); assert.equal(calls.length, before);
});

test('malformed disk records are quarantined independently without hiding good history or deleting MP3s', async () => {
  const { service, store, downloads, library } = await fixture('cold-corrupt');
  await service.enqueue({ url: video.url, autoImport: false });
  const ready = await persistedJob(service, store, j => j.state === 'ready'), original = await service.file(ready.id);
  const originalBytes = await readFile(original.path);
  const badJsonId = randomUUID(), badShapeId = randomUUID(), badJson = '{"incomplete":';
  const badShape = JSON.stringify({ ...ready, id: badShapeId, createdAt: 7 });
  await writeFile(join(store, 'jobs', `${badJsonId}.json`), badJson);
  await writeFile(join(store, 'jobs', `${badShapeId}.json`), badShape);
  const cold = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: library, stationExists: () => true });
  assert.deepEqual((await cold.list()).map(j => j.id), [ready.id]);
  assert.equal((await cold.list()).length, 1); assert.ok(await cold.file(ready.id));
  const quarantine = join(store, 'quarantine'), quarantined = await readdir(quarantine);
  assert.equal(quarantined.length, 2);
  const preserved = await Promise.all(quarantined.map(file => readFile(join(quarantine, file), 'utf8')));
  assert.ok(preserved.includes(badJson)); assert.ok(preserved.includes(badShape));
  assert.deepEqual(await readdir(join(store, 'jobs')), [`${ready.id}.json`]);
  assert.deepEqual(await readFile(original.path), originalBytes);
});

test('the same service can retry initialization after a repaired routing file', async () => {
  const { service, store, downloads, library } = await fixture('cold-init-retry');
  await service.enqueue({ url: video.url, autoImport: false });
  const ready = await persistedJob(service, store, j => j.state === 'ready');
  await writeFile(join(store, 'routing.json'), 'broken JSON');
  const cold = new YoutubeImports({ storeDir: store, downloadsDir: downloads, libraryRoot: library, stationExists: () => true });
  await assert.rejects(cold.list(), /repair routing.json/);
  await writeFile(join(store, 'routing.json'), JSON.stringify({ routes }));
  await cold.resume(); assert.equal((await cold.list())[0].id, ready.id);
  assert.deepEqual((await cold.routing()).routes, routes);
});
