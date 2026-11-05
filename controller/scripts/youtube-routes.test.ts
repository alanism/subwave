// The download history and local files are admin-only, including reads.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import { YoutubeImports } from '../src/music/youtube/service.js';

process.env.ADMIN_USER = 'youtube-test';
process.env.ADMIN_PASS = 'local-test-only';
const { createYoutubeRouter } = await import('../src/routes/youtube.js');
const dir = createTempDir(join(tmpdir(), 'youtube-routes-'));
const service = new YoutubeImports({ storeDir: join(dir, 'store'), downloadsDir: join(dir, 'downloads'), libraryRoot: '', stationExists: () => true, run: async () => JSON.stringify({ entries: [] }) });
const app = express(); app.use(express.json());
app.use(createYoutubeRouter(service, () => [{ id: 'jazz', name: 'Jazz', active: true, configured: true }]));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const body = async (response: Response) => await response.json() as { routes: { genre: string }[]; stations: { name: string }[]; videos: unknown[]; error: string };
const auth = { Authorization: `Basic ${Buffer.from('youtube-test:local-test-only').toString('base64')}`, 'Content-Type': 'application/json' };
after(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await removeTempDir(dir); });

test('all YouTube reads and mutations require admin credentials', async () => {
  for (const [method, path] of [['GET', '/youtube/downloads'], ['GET', '/youtube/routing'], ['GET', '/youtube/status'], ['GET', '/youtube/downloads/nope/file'], ['POST', '/youtube/search'], ['POST', '/youtube/downloads'], ['POST', '/youtube/downloads/nope/add'], ['POST', '/youtube/downloads/nope/retry'], ['PUT', '/youtube/routing']]) {
    const response = await fetch(base + path, { method, headers: { 'X-Subwave-Console': '1' } });
    assert.equal(response.status, 401, `${method} ${path}`); assert.equal(response.headers.get('www-authenticate'), null);
  }
});
test('authorised routing persists, search works and invalid URLs/ids return readable errors', async () => {
  const put = await fetch(base + '/youtube/routing', { method: 'PUT', headers: auth, body: JSON.stringify({ routes: [{ stationId: 'jazz', genre: 'Jazz', folder: 'YouTube/Jazz' }] }) });
  assert.equal(put.status, 200);
  const routing = await body(await fetch(base + '/youtube/routing', { headers: auth }));
  assert.equal(routing.routes[0].genre, 'Jazz'); assert.equal(routing.stations[0].name, 'Jazz');
  const search = await fetch(base + '/youtube/search', { method: 'POST', headers: auth, body: JSON.stringify({ query: 'Jazz song' }) });
  assert.equal(search.status, 200); assert.deepEqual((await body(search)).videos, []);
  const bad = await fetch(base + '/youtube/downloads', { method: 'POST', headers: auth, body: JSON.stringify({ url: 'https://example.com/not-youtube' }) });
  assert.equal(bad.status, 400); assert.match((await body(bad)).error, /YouTube/);
  const file = await fetch(base + '/youtube/downloads/nope/file', { headers: auth });
  assert.equal(file.status, 400); assert.match((await body(file)).error, /not found/);
});
