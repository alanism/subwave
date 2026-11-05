'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile, mkdir, rm, copyFile, chmod, unlink } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync, fork } = require('node:child_process');
const { startLocalStation } = require('../runtime/service/station.cjs');
const { LocalService, processIdentity } = require('../src/local-service.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const token = 'a'.repeat(64);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'subwave-local-'));
  const inputs = join(root, 'inputs'); await mkdir(inputs);
  const files = [];
  for (const [i, format] of ['mp3', 'flac', 'wav', 'm4a', 'ogg'].entries()) {
    const file = join(inputs, `song-${i}.${format}`);
    execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', `sine=frequency=${330 + i * 110}:duration=1.4`, '-metadata', `title=Song ${i}`, '-metadata', 'artist=Subwave QA', '-metadata', 'genre=Test genre', file]); files.push(file);
  }
  const options = { stateDir: join(root, 'state'), musicDir: join(root, 'Music'), token, ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe', ytDlp: '/usr/bin/yt-dlp' };
  return { root, files, options };
}
function api(station) {
  return async (path, method = 'GET', body) => {
    const response = await fetch(station.origin + '/api' + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error); return value;
  };
}
test('real local station: formats, persistent playlists, genres, corrupt file isolation and private HTTP', { timeout: 30_000 }, async t => {
  const { root, files, options } = await fixture(t);
  const originals = await Promise.all(files.map(file => readFile(file)));
  let station = await startLocalStation(options); t.after(async () => { await station.close(); await rm(root, { recursive: true, force: true }); }); let request = api(station);
  assert.equal((await fetch(station.origin + '/api/local/library')).status, 401);
  assert.equal((await request('/local/library')).tracks.length, 0);
  await assert.rejects(request('/local/stations/select', 'POST', { id: 'missing' }), /not found/);
  const invalid = join(root, 'invalid.mp3'); await writeFile(invalid, 'not audio');
  const result = await station.importFiles([...files, invalid]);
  assert.equal(result.added, 5); assert.equal(result.errors.length, 1);
  assert.equal((await station.importFiles(files)).added, 0, 'a repeated selection is idempotent');
  for (const [i, file] of files.entries()) assert.deepEqual(await readFile(file), originals[i], 'import never edits the original');
  const library = await request('/local/library'); assert.equal(library.tracks.length, 5);
  for (const track of library.tracks) {
    assert.equal(track.stationId, 'local-files'); assert.ok(track.duration > 1); assert.equal(track.artist, 'Subwave QA', track.filename);
    execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-i', await station.library.path(track.id), '-f', 'null', '-']);
  }
  const tracks = library.tracks;
  const first = await request('/local/playlists', 'POST', { name: 'First playlist' });
  const second = await request('/local/playlists', 'POST', { name: 'Second playlist' });
  const ordered = [tracks[2].id, tracks[0].id, tracks[1].id];
  await request('/local/playlists/' + first.id, 'PUT', { name: 'Reordered', trackIds: ordered });
  await request('/local/playlists/' + second.id, 'PUT', { name: second.name, trackIds: [tracks[0].id] });
  await assert.rejects(request('/local/playlists/' + second.id, 'PUT', { name: second.name, trackIds: [tracks[0].id, tracks[0].id] }), /once/);
  await request('/local/playlists/' + second.id, 'PUT', { name: second.name, trackIds: [] });
  await request('/local/stations/select', 'POST', { id: first.id });
  assert.deepEqual((await request('/local/library')).tracks.map(row => row.id), ordered);
  await request('/local/tracks/' + ordered[0] + '/play', 'POST', {});
  assert.equal(station.library.selected, first.id, 'playing a playlist member preserves its source');
  await chmod(options.stateDir, 0o500);
  try {
    await assert.rejects(request('/local/playlists', 'POST', { name: 'Cannot save' }), /Check folder permissions/);
    await assert.rejects(request('/local/playlists/' + first.id, 'PUT', { name: 'Unsaved rename', trackIds: [] }), /Check folder permissions/);
    await assert.rejects(request('/local/playlists/' + first.id, 'DELETE'), /Check folder permissions/);
    await assert.rejects(request('/local/stations/select', 'POST', { id: 'house' }), /Check folder permissions/);
    const unchanged = await request('/local/library');
    assert.equal(unchanged.playlists.length, 2); assert.equal(unchanged.selected, first.id);
    assert.equal(unchanged.playlists.find(row => row.id === first.id).name, 'Reordered');
    assert.deepEqual(unchanged.playlists.find(row => row.id === first.id).trackIds, ordered);
    assert.equal(unchanged.playlists.find(row => row.id === first.id).deletedAt, null);
    const created = await request('/local/stations', 'POST', { name: 'Read only station', genre: 'Testing' });
    assert.equal(created.stations.find(row => row.id === 'read-only-station').name, 'Read only station', 'genre creation commits its name in one owner file without a failing post-commit cache write');
  } finally { await chmod(options.stateDir, 0o700); }
  await request('/local/playlists/' + first.id, 'PUT', { name: 'Reordered', trackIds: ordered });
  await request('/local/tracks/' + tracks[0].id + '/copy', 'POST', { stationId: 'jazz' });
  await request('/local/tracks/' + tracks[1].id + '/copy', 'POST', { stationId: 'house' });
  await request('/local/tracks/' + tracks[0].id + '/copy', 'POST', { stationId: 'house' });
  assert.equal(station.library.tracksFor('jazz').length, 1); assert.equal(station.library.tracksFor('house').length, 2);
  await request('/local/tracks/' + tracks[0].id + '/copy', 'POST', { stationId: 'jazz' });
  assert.equal(station.library.tracksFor('jazz').length, 1);
  await request('/local/playlists/' + first.id, 'DELETE');
  assert.ok((await request('/local/library')).playlists.find(row => row.id === first.id).deletedAt);
  await station.close(); station = await startLocalStation(options); request = api(station);
  const cold = await request('/local/library'); assert.ok(cold.playlists.find(row => row.id === first.id).deletedAt);
  assert.equal(cold.stations.find(row => row.id === 'read-only-station').name, 'Read only station');
  await request('/local/playlists/' + first.id + '/restore', 'POST');
  await request('/local/stations/select', 'POST', { id: first.id });
  assert.deepEqual((await request('/local/library')).tracks.map(row => row.id), ordered);
  assert.equal(station.library.tracksFor('jazz').length, 1); assert.equal(station.library.tracksFor('house').length, 2);
  const selected = (await request('/local/library')).tracks[0];
  await writeFile(await station.library.path(selected.id), 'corrupt audio'); await station.library.scan();
  assert.match((await request('/local/library')).error, /could not be read/);
  assert.ok(station.library.tracksFor('all').length >= 4, 'one unreadable item cannot hide other music');
  await assert.rejects(request('/local/tracks/' + selected.id + '/play', 'POST'), /not found/);
  const unicode = join(root, '音'.repeat(78) + '.mp3'); await copyFile(files[0], unicode);
  assert.equal((await station.importFiles([unicode])).added, 1, 'Unicode titles must respect the filesystem byte limit');
  const genres = await request('/local/stations', 'POST', { name: 'All', genre: 'Test' });
  assert.ok(genres.stations.some(row => row.id === 'genre-all'), 'reserved source names cannot create an unreachable genre');
});
test('changed and missing playback files fail before source changes, preserve current audio and recover after refresh', { timeout: 30_000 }, async t => {
  const { root, files, options } = await fixture(t);
  // Count actual probe executions at the dependency boundary. The station and
  // media children still use their normal argument arrays and process groups.
  const probeLog = join(root, 'probes.log'), probe = join(root, 'ffprobe-count.cjs');
  await writeFile(probe, `#!${process.execPath}\n'use strict';\nconst fs = require('node:fs');\nconst { spawnSync } = require('node:child_process');\nfs.appendFileSync(${JSON.stringify(probeLog)}, 'probe\\n');\nconst child = spawnSync('/usr/bin/ffprobe', process.argv.slice(2), { stdio: 'inherit' });\nif (child.error) throw child.error;\nprocess.exit(child.status === null ? 1 : child.status);\n`, { mode: 0o700 });
  const probeCount = async () => (await readFile(probeLog, 'utf8')).trim().split('\n').filter(Boolean).length;
  execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=12', '-metadata', 'title=Keep playing', files[0]]);
  const station = await startLocalStation({ ...options, ffprobe: probe });
  const controller = new AbortController();
  t.after(async () => { controller.abort(); await station.close(); await rm(root, { recursive: true, force: true }); });
  const request = api(station);
  await station.importFiles([files[0]], 'jazz');
  await station.importFiles([files[1], files[2], files[3]], 'house');
  const active = station.library.tracksFor('jazz')[0];
  const [corrupt, missing, valid] = station.library.tracksFor('house');
  const corruptPath = await station.library.path(corrupt.id), missingPath = await station.library.path(missing.id), validPath = await station.library.path(valid.id);
  await request('/local/stations/select', 'POST', { id: 'jazz' });
  const beforeUnchanged = await probeCount();
  await station.library.path(active.id); await station.library.path(active.id);
  await request('/local/tracks/' + active.id + '/play', 'POST');
  assert.equal(await probeCount(), beforeUnchanged, 'unchanged indexed MP3s must not be probed again for playback');
  const stream = await fetch(station.origin + '/stream.mp3', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  const chunks = [];
  const drain = (async () => { try { for await (const chunk of stream.body) chunks.push(Buffer.from(chunk)); } catch (error) { if (!controller.signal.aborted) throw error; } })();
  for (let i = 0; i < 80 && (!station.radio.current || !chunks.length); i++) await sleep(25);
  assert.equal(station.radio.current?.id, active.id);
  const startedAt = station.radio.startedAt, historyLength = station.radio.history.length;

  await writeFile(corruptPath, 'this indexed MP3 is now corrupt');
  await assert.rejects(request('/local/tracks/' + corrupt.id + '/play', 'POST'), /could not be read.*Refresh library/);
  assert.equal(station.library.selected, 'jazz', 'a corrupt target cannot commit its source');
  assert.equal(station.radio.current?.id, active.id); assert.equal(station.radio.startedAt, startedAt);
  assert.equal(station.radio.history.length, historyLength, 'a failed request cannot stop the current encoder');
  assert.equal(station.library.track(corrupt.id), undefined, 'the refresh drops an unreadable index row');
  assert.ok(station.library.track(missing.id)); assert.ok(station.library.track(valid.id));

  await unlink(missingPath);
  await assert.rejects(request('/local/tracks/' + missing.id + '/play', 'POST'), /no longer available.*Refresh library/);
  assert.equal(station.library.selected, 'jazz'); assert.equal(station.radio.current?.id, active.id);
  assert.equal(station.radio.startedAt, startedAt); assert.equal(station.radio.history.length, historyLength);
  const refreshed = await request('/local/scan', 'POST');
  assert.equal(refreshed.allTracks.length, 2); assert.ok(refreshed.allTracks.some(track => track.id === active.id));
  assert.ok(refreshed.allTracks.some(track => track.id === valid.id)); assert.equal(station.library.track(missing.id), undefined);
  const beforeValid = await probeCount();
  await station.library.path(valid.id); assert.equal(await probeCount(), beforeValid, 'refresh retains the unchanged neighbor cache');

  // A changed file that is still valid is re-indexed, rather than rejected
  // merely because its stamp or metadata changed.
  execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'sine=frequency=770:duration=3', '-metadata', 'title=Updated playable song', validPath]);
  const offset = chunks.length;
  const played = await request('/local/tracks/' + valid.id + '/play', 'POST');
  assert.equal(played.track.title, 'Updated playable song'); assert.equal(station.library.selected, 'house');
  for (let i = 0; i < 100 && (station.radio.current?.id !== valid.id || Buffer.concat(chunks.slice(offset)).length < 6000); i++) await sleep(25);
  assert.equal(station.radio.current?.id, valid.id); assert.equal(station.radio.current?.title, 'Updated playable song');
  const received = join(root, 'recovered-stream.mp3'); await writeFile(received, Buffer.concat(chunks.slice(offset)));
  execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-i', received, '-f', 'null', '-']);
  controller.abort(); await drain;
});
test('real MP3 radio decodes, advances a reordered playlist, changes source and closes children', { timeout: 30_000 }, async t => {
  const { root, files, options } = await fixture(t); const children = new Set();
  const station = await startLocalStation({ ...options, notify: message => { if (message.type === 'child-started') children.add(message.pid); if (message.type === 'child-exited') children.delete(message.pid); } }); t.after(async () => { await station.close(); await rm(root, { recursive: true, force: true }); });
  await station.importFiles(files); const request = api(station), tracks = (await request('/local/library')).tracks;
  const playlist = await request('/local/playlists', 'POST', { name: 'Ordered audio' });
  const order = [tracks[2].id, tracks[0].id, tracks[1].id];
  await request('/local/playlists/' + playlist.id, 'PUT', { name: playlist.name, trackIds: order });
  await request('/local/stations/select', 'POST', { id: playlist.id });
  await request('/local/tracks/' + order[0] + '/play', 'POST', {});
  const originalPath = station.library.path.bind(station.library);
  let releasePath; let pathReads = 0;
  const held = new Promise(resolve => { releasePath = resolve; });
  station.library.path = async id => { pathReads++; await held; return originalPath(id); };
  const controller = new AbortController(); t.after(() => controller.abort());
  const stream = await fetch(station.origin + '/stream.mp3', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  const other = await fetch(station.origin + '/stream.mp3', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  assert.equal(pathReads, 1, 'simultaneous listeners must not consume another requested song');
  releasePath();
  const chunks = []; const drain = (async () => { try { for await (const chunk of stream.body) chunks.push(Buffer.from(chunk)); } catch (error) { if (!controller.signal.aborted) throw error; } })();
  const otherDrain = (async () => { try { for await (const chunk of other.body) { void chunk; } } catch (error) { if (!controller.signal.aborted) throw error; } })();
  for (let i = 0; i < 160 && station.radio.history.length < 3; i++) await sleep(50);
  assert.deepEqual(station.radio.history.slice(0, 3).reverse().map(row => row.id), order);
  const saved = join(root, 'received.mp3'); await writeFile(saved, Buffer.concat(chunks));
  const decoded = execFileSync('/usr/bin/ffmpeg', ['-hide_banner', '-i', saved, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); assert.equal(decoded, '');
  assert.ok(Buffer.concat(chunks).length > 50_000);
  await request('/local/tracks/' + tracks[4].id + '/copy', 'POST', { stationId: 'jazz' });
  await request('/local/stations/select', 'POST', { id: 'jazz' });
  for (let i = 0; i < 50 && station.radio.current?.stationId !== 'jazz'; i++) await sleep(50);
  assert.equal(station.radio.current.stationId, 'jazz');
  controller.abort(); await Promise.all([drain, otherDrain]); await station.close();
  await sleep(150); for (const pid of children) assert.equal(processIdentity(pid)?.state === 'Z' || !processIdentity(pid), true, 'media child must exit');
});
test('stopped track selections replace an unplayed choice instead of queuing old clicks', { timeout: 15_000 }, async t => {
  const { root, files, options } = await fixture(t);
  const station = await startLocalStation(options), controller = new AbortController();
  t.after(async () => { controller.abort(); await station.close(); await rm(root, { recursive: true, force: true }); });
  await station.importFiles(files);
  const request = api(station), tracks = station.library.tracksFor();
  await request('/local/tracks/' + tracks[0].id + '/play', 'POST');
  await request('/local/tracks/' + tracks[1].id + '/play', 'POST');
  const stream = await fetch(station.origin + '/stream.mp3', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  const drain = (async () => { try { for await (const chunk of stream.body) { void chunk; } } catch (error) { if (!controller.signal.aborted) throw error; } })();
  for (let i = 0; i < 160 && station.radio.history.length < 2; i++) await sleep(25);
  assert.deepEqual(station.radio.history.slice(0, 2).reverse().map(track => track.id), [tracks[1].id, tracks[2].id]);
  controller.abort(); await drain;
});
test('four-second playlist repeats keep API transitions paced to the decoded audio timeline', { timeout: 40_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'subwave-pacing-'));
  const musicDir = join(root, 'Music'), folder = join(musicDir, 'Stations/Local files');
  await mkdir(folder, { recursive: true });
  for (let i = 0; i < 3; i++) {
    execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', `sine=frequency=${330 + i * 110}:duration=4`,
      '-metadata', `title=Paced ${i}`, join(folder, `paced-${i}.mp3`)]);
  }
  const station = await startLocalStation({ stateDir: join(root, 'state'), musicDir, token,
    ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe', ytDlp: '/usr/bin/yt-dlp' });
  const controller = new AbortController();
  t.after(async () => { controller.abort(); await station.close(); await rm(root, { recursive: true, force: true }); });
  const request = api(station), tracks = station.library.tracksFor('local-files');
  const playlist = await request('/local/playlists', 'POST', { name: 'Pacing proof' });
  const order = [tracks[2].id, tracks[0].id, tracks[1].id];
  await request('/local/playlists/' + playlist.id, 'PUT', { name: playlist.name, trackIds: order });
  await request('/local/stations/select', 'POST', { id: playlist.id });
  const stream = await fetch(station.origin + '/stream.mp3', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  const chunks = [];
  const drain = (async () => { try { for await (const chunk of stream.body) chunks.push(Buffer.from(chunk)); } catch (error) { if (!controller.signal.aborted) throw error; } })();
  // Complete the first turn of the repeated playlist as well as its initial
  // three entries. A per-child half-second lead must not hide in one startup.
  for (let i = 0; i < 1200 && station.radio.history.length < 4; i++) await sleep(25);
  assert.ok(station.radio.history.length >= 4, 'the repeated playlist must complete four tracks');
  const completed = station.radio.history.slice(0, 4).reverse();
  assert.deepEqual(completed.map(track => track.id), [...order, order[0]]);
  controller.abort(); await drain;
  const encoded = join(root, 'paced-stream.mp3'); await writeFile(encoded, Buffer.concat(chunks));
  const pcm = execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-i', encoded, '-ac', '1', '-ar', '8000', '-f', 'f32le', 'pipe:1']);
  const mediaSeconds = pcm.length / 4 / 8000;
  const transitionSeconds = (Date.parse(completed.at(-1).endedAt) - Date.parse(completed[0].startedAt)) / 1000;
  const expectedSeconds = completed.reduce((sum, track) => sum + track.duration, 0);
  assert.ok(mediaSeconds >= 15.8, `the captured stream must contain four full songs, got ${mediaSeconds.toFixed(3)}s`);
  assert.ok(transitionSeconds >= expectedSeconds - 0.4,
    `API transitions compressed ${expectedSeconds.toFixed(3)}s of songs into ${transitionSeconds.toFixed(3)}s`);
  // Allow bounded frame/encoder padding and polling error. Resetting FFmpeg's
  // default burst for each child used to build almost two seconds of lead here.
  assert.ok(mediaSeconds - transitionSeconds <= 0.4,
    `decoded audio leads its real-time transition clock by ${(mediaSeconds - transitionSeconds).toFixed(3)}s`);
});
test('supervisor rotates its private connection and restarts a killed worker without losing the library', { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'subwave-owner-'));
  const music = join(root, 'Music/Stations/Local files'); await mkdir(music, { recursive: true });
  execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', join(music, 'retained.mp3')]);
  const supervisor = new LocalService({ utilityProcess: { fork: (entry, _args, options) => {
    const child = fork(entry, [], { env: options.env, cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.postMessage = value => child.send(value); return child;
  } }, serviceRoot: join(__dirname, '../runtime/service'), stateDir: join(root, 'state'), musicDir: join(root, 'Music'), executable: process.execPath });
  t.after(async () => { await supervisor.close(); await rm(root, { recursive: true, force: true }); }); const first = await supervisor.start();
  assert.equal((await fetch(first.origin + '/api/health', { headers: { Authorization: `Bearer ${first.token}` } })).status, 200);
  const stream = await fetch(first.origin + '/stream.mp3', { headers: { Authorization: `Bearer ${first.token}` } });
  const reader = stream.body.getReader(); await reader.read();
  for (let i = 0; i < 20 && !supervisor.groups.size; i++) await sleep(50);
  const media = [...supervisor.groups.values()]; assert.ok(media.length, 'the active encoder must be owned');
  supervisor.child.kill('SIGKILL');
  await reader.cancel().catch(() => {});
  for (let i = 0; i < 200 && (!supervisor.endpoint() || supervisor.endpoint().token === first.token); i++) await sleep(50);
  const second = supervisor.endpoint(); assert.ok(second); assert.notEqual(second.token, first.token);
  assert.equal((await fetch(second.origin + '/api/health', { headers: { Authorization: `Bearer ${first.token}` } })).status, 401);
  assert.equal((await fetch(second.origin + '/api/health', { headers: { Authorization: `Bearer ${second.token}` } })).status, 200);
  assert.equal((await (await fetch(second.origin + '/api/local/library', { headers: { Authorization: `Bearer ${second.token}` } })).json()).tracks.length, 1);
  for (const child of media) assert.ok(!processIdentity(child.pid) || processIdentity(child.pid).state === 'Z', 'a killed worker must not leave its encoder running');
  const pid = supervisor.child.pid; await supervisor.close(); assert.ok(!processIdentity(pid) || processIdentity(pid).state === 'Z');
});
