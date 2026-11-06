'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, readFile, readdir, chmod, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { startLocalStation } = require('../runtime/service/station.cjs');
const token = 'recovery-test-capability'.repeat(3);
async function fixture(t, contents) {
  const root = await mkdtemp(join(tmpdir(), 'subwave-recovery-'));
  const stateDir = join(root, 'state'); await mkdir(stateDir);
  const file = join(stateDir, 'library.json'); await writeFile(file, contents);
  const options = { stateDir, musicDir: join(root, 'Music'), token, ffmpeg:'/usr/bin/ffmpeg', ffprobe:'/usr/bin/ffprobe', ytDlp:'/usr/bin/yt-dlp' };
  let station;
  t.after(async()=>{await station?.close();await rm(root,{recursive:true,force:true});});
  return { stateDir, file, options, async start(){ station=await startLocalStation(options);return station; }, async close(){await station.close();station=null;} };
}
const saved = { selected:'jazz',names:{jazz:'My jazz'},playlists:[{id:'pl-01234567',name:'Keep this playlist',trackIds:[],count:0,deletedAt:null}],internetStations:[] };
test('damaged saved-library bytes are preserved before boot rebuilds settings, and the warning survives scans',async t=>{
  const contents='{"selected":"jazz","playlists":[{"name":"Interrupted write"';
  const f=await fixture(t,contents), station=await f.start();
  const recovery=(await readdir(f.stateDir)).filter(name=>name.startsWith('library-recovery-'));
  assert.equal(recovery.length,1,'Keep the original saved state available for repair.');
  assert.equal(await readFile(join(f.stateDir,recovery[0]),'utf8'),contents);
  assert.match(station.library.error,/preserved|recovery/i);
  await station.library.scan();assert.match(station.library.error,/preserved|recovery/i);
  assert.deepEqual(JSON.parse(await readFile(f.file,'utf8')).playlists,[]);
});
test('a saved-library read refusal cannot overwrite playlists; repairing permissions and restarting recovers them',async t=>{
  const contents=JSON.stringify(saved), f=await fixture(t,contents);await chmod(f.file,0);
  t.after(()=>chmod(f.file,0o600).catch(()=>{}));
  const station=await f.start();
  assert.match(station.library.error,/could not be read|cannot.*read/i);
  await assert.rejects(station.library.createPlaylist('Must not replace unreadable settings'),/read|restart|blocked/i);
  await station.library.remember();await chmod(f.file,0o600);
  assert.equal(await readFile(f.file,'utf8'),contents);await f.close();
  const restarted=await f.start();assert.equal(restarted.library.view().playlists[0].name,saved.playlists[0].name);
  await restarted.library.createPlaylist('Works after repair');assert.equal(restarted.library.view().playlists.length,2);
});
test('valid legacy settings and a damaged derived catalog still load and accept durable playlist edits',async t=>{
  const {internetStations,...legacy}=saved;const f=await fixture(t,JSON.stringify(legacy));await writeFile(join(f.stateDir,'catalog.json'),'{');
  const station=await f.start();assert.equal(station.library.selected,'jazz');assert.equal(station.library.view().playlists[0].name,saved.playlists[0].name);
  await station.library.createPlaylist('New playlist');await f.close();const restarted=await f.start();assert.equal(restarted.library.view().playlists.length,2);
});
for (const [name, contents] of [['non-object JSON', Buffer.from('null')], ['invalid UTF-8', Buffer.from([0xff, 0xfe, 0x7b, 0x80])]]) {
  test(`recovery retains exact bytes for ${name}`, async t => {
    const f = await fixture(t, contents); await f.start();
    const recovery = (await readdir(f.stateDir)).find(name => name.startsWith('library-recovery-'));
    assert.ok(recovery); assert.deepEqual(await readFile(join(f.stateDir, recovery)), contents);
  });
}
test('failure to publish a durable recovery copy keeps the original and blocks preference replacement', async t => {
  const contents = '{"playlists": [';
  const f = await fixture(t, contents);
  t.mock.method(require('node:fs'), 'fsyncSync', () => { throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' }); });
  const station = await f.start();
  assert.match(station.library.error, /recovery copy could not be saved/);
  await assert.rejects(station.library.createPlaylist('Cannot discard original'), /blocked/);
  await station.library.scan(); await f.close();
  assert.equal(await readFile(f.file, 'utf8'), contents);
  assert.deepEqual((await readdir(f.stateDir)).filter(name => name.startsWith('library-recovery-')), []);
});
