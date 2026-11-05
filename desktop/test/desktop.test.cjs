'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { stationUrl, ConfigStore, SKINS } = require('../src/config.cjs');
const { routeTarget, startGateway } = require('../src/gateway.cjs');

test('station addresses accept local, remote and base-path installs; reject embedded credentials and non-web protocols', () => {
  assert.equal(stationUrl(' http://localhost:7700/listen '), 'http://localhost:7700');
  assert.equal(stationUrl('https://radio.example/subwave/admin/youtube'), 'https://radio.example/subwave');
  assert.equal(stationUrl('https://radio.example/'), 'https://radio.example');
  for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:secret@radio.example', 'https://radio.example?password=x', 'https://radio.example#x', 'radio.example']) assert.throws(() => stationUrl(bad));
});
test('preferences survive cold startup and concurrent writes, with exactly two allowed skins', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'subwave-desktop-'));
  try {
    const store = new ConfigStore(join(dir, 'preferences.json'));
    await store.load();
    await Promise.all([store.save({ skin: 'classic' }), store.save({ stationUrl: 'https://radio.example' }), store.save({ bounds: { width: 1440, height: 900 } })]);
    const cold = new ConfigStore(store.file); await cold.load();
    assert.equal(cold.value.skin, 'classic'); assert.equal(cold.value.stationUrl, 'https://radio.example');
    assert.deepEqual(cold.value.bounds, { width: 1440, height: 900 });
    assert.deepEqual(SKINS, ['classic', 'enochian']);
    assert.equal(JSON.parse(await readFile(store.file, 'utf8')).skin, 'classic');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('gateway routes preserve stream tokens and station base paths without accepting an arbitrary proxy URL', () => {
  const cfg = { station: 'https://radio.example/subwave', web: 'http://127.0.0.1:1234' };
  assert.equal(routeTarget('/api/state?x=1', cfg).href, 'https://radio.example/subwave/api/state?x=1');
  assert.equal(routeTarget('/stream.mp3?auth=private-token', cfg).href, 'https://radio.example/subwave/stream.mp3?auth=private-token');
  assert.equal(routeTarget('/listen', cfg).href, 'http://127.0.0.1:1234/listen');
  assert.equal(routeTarget('/api/state', { ...cfg, station: '' }), null);
  for (const bad of ['https://evil.example/api/state', '//evil.example/api/state', '/api/\\evil.example']) assert.throws(() => routeTarget(bad, cfg));
});
async function fixture(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('real HTTP proxy forwards authenticated MP3 downloads and private audio, blocks cross-site requests, and retains authored themes offline', async t => {
  const calls = [];
  const station = await fixture(t, (req, res) => {
    calls.push({ path: req.url, auth: req.headers.authorization });
    if (req.url === '/api/themes') return res.end(JSON.stringify({ themes: [{ id: 'remote' }], active: 'remote' }));
    if (req.url.startsWith('/stream.mp3')) { res.setHeader('Content-Type', 'audio/mpeg'); return res.end(Buffer.from([73, 68, 51, 1, 2, 3])); }
    res.setHeader('Content-Disposition', 'attachment; filename="song.mp3"'); res.end('saved-mp3');
  });
  const web = await fixture(t, (_req, res) => res.end('bundled-interface'));
  let selected = station;
  const gateway = await startGateway({ port: 0, getStation: () => selected, web, localThemes: [{ id: 'enochian-ivory' }, { id: 'enochian-obsidian' }] });
  t.after(gateway.close);
  const download = await fetch(`${gateway.origin}/api/youtube/downloads/abc/file`, { headers: { Authorization: 'Basic private' } });
  assert.equal(await download.text(), 'saved-mp3'); assert.match(download.headers.get('content-disposition'), /song.mp3/);
  assert.equal(calls[0].auth, 'Basic private');
  assert.deepEqual(Buffer.from(await (await fetch(`${gateway.origin}/stream.mp3?auth=secret`)).arrayBuffer()), Buffer.from([73, 68, 51, 1, 2, 3]));
  assert.equal(calls[1].path, '/stream.mp3?auth=secret');
  const interfacePage = await fetch(`${gateway.origin}/listen`);
  assert.match(interfacePage.headers.get('content-security-policy'), /object-src 'none'/);
  assert.equal(await interfacePage.text(), 'bundled-interface');
  assert.equal((await fetch(`${gateway.origin}/api/state`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  const rebound = await new Promise((resolve, reject) => {
    http.get(`${gateway.origin}/api/state`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(rebound, 403);
  const palettes = await (await fetch(`${gateway.origin}/api/themes`)).json();
  assert.equal(palettes.active, 'remote'); assert.equal(palettes.themes.length, 3);
  selected = '';
  const offline = await (await fetch(`${gateway.origin}/api/themes`)).json();
  assert.equal(offline.active, 'enochian-ivory'); assert.equal(offline.themes.length, 2);
  assert.equal((await fetch(`${gateway.origin}/api/state`)).status, 503);
});

test('owned-worker capability is scoped, replaces renderer forgeries and rotates without reaching a remote station', async t => {
  const calls = [];
  const owned = await fixture(t, (req, res) => { calls.push(req.headers.authorization); res.end('{}'); });
  const remoteCalls = [];
  const remote = await fixture(t, (req, res) => { remoteCalls.push(req.headers.authorization); res.end('{}'); });
  const webCalls = [];
  const web = await fixture(t, (req, res) => { webCalls.push(req.headers.authorization); res.end('interface'); });
  let station = owned, local = { origin: owned, token: 'private-first' };
  const gateway = await startGateway({ port: 0, getStation: () => station, getLocal: () => local, web }); t.after(gateway.close);
  await fetch(gateway.origin + '/api/local/library', { headers: { Authorization: 'forged' } });
  assert.equal(calls.at(-1), 'Bearer private-first');
  local = { origin: owned, token: 'private-next' };
  await fetch(gateway.origin + '/stream.mp3'); assert.equal(calls.at(-1), 'Bearer private-next');
  await fetch(gateway.origin + '/listen'); assert.equal(webCalls.at(-1), undefined);
  station = remote;
  await fetch(gateway.origin + '/api/health', { headers: { Authorization: 'Basic remote-auth' } });
  assert.equal(remoteCalls.at(-1), 'Basic remote-auth');
  const before = remoteCalls.length;
  assert.equal((await fetch(gateway.origin + '/api/local/playlists', { method: 'POST', headers: { Origin: 'https://hostile.example' }, body: '{}' })).status, 403);
  assert.equal(remoteCalls.length, before);
});
