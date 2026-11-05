// Admin-only YouTube search, persistent local MP3 downloads and genre-station
// imports. The feature does not change the station currently on air.
import express from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { config, STATE_ROOT } from '../config.js';
import { envStr } from '../util/env.js';
import { resolveNavidrome } from '../setup/navidrome-policy.js';
import * as manager from '../stations/manager.js';
import * as settings from '../settings.js';
import { YoutubeImports } from '../music/youtube/service.js';
import { youtubeAddSchema, youtubeDownloadSchema, youtubeRoutingSchema, youtubeSearchSchema } from '../schemas/youtube.js';

const stationRows = () => manager.listStations(STATE_ROOT, settings.get()?.station || 'SUB/WAVE', !!config.navidrome.user)
  .map(s => ({ id: s.id ?? 'main', name: s.name, active: s.active, configured: s.configured }));

async function scanStation(stationId: string) {
  const row = stationRows().find(s => s.id === stationId);
  if (!row) throw new Error('The destination station no longer exists');
  let credentials = config.navidrome;
  if (!row.active) {
    const saved = JSON.parse(await readFile(join(STATE_ROOT, 'stations', stationId, 'setup-config.json'), 'utf8'));
    credentials = { ...config.navidrome, ...resolveNavidrome(saved.navidrome, false) };
  }
  if (!credentials.url || !credentials.user || !credentials.password) throw new Error('Configure this station’s Navidrome connection, then scan its library');
  const salt = randomBytes(12).toString('hex');
  const url = new URL(`${credentials.url.replace(/\/$/, '')}/rest/startScan.view`);
  const params = { u: credentials.user, t: createHash('md5').update(credentials.password + salt).digest('hex'), s: salt, v: '1.16.1', c: 'sub-wave', f: 'json' };
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Music server returned ${response.status}`);
  const body = await response.json();
  if (body?.['subsonic-response']?.status !== 'ok') throw new Error('The music server refused the library scan');
}

export function createYoutubeRouter(service: YoutubeImports, stations = stationRows) {
  const router = express.Router();
  router.use('/youtube', requireAdmin);
  const failure = (res: express.Response, error: unknown) => res.status(400).json({ error: error instanceof Error ? error.message : 'YouTube import failed' });
  router.get('/youtube/downloads', async (_req, res) => {
    try { res.json({ jobs: await service.list() }); } catch (error) { failure(res, error); }
  });
  router.get('/youtube/status', async (_req, res) => {
    try { res.json(await service.tools()); } catch (error) { failure(res, error); }
  });
  router.get('/youtube/routing', async (_req, res) => {
    try { res.json({ ...await service.routing(), stations: stations() }); } catch (error) { failure(res, error); }
  });
  router.put('/youtube/routing', validateBody(youtubeRoutingSchema), async (req, res) => {
    try { res.json(await service.configure(req.body)); } catch (error) { failure(res, error); }
  });
  router.post('/youtube/search', validateBody(youtubeSearchSchema), async (req, res) => {
    try { res.json({ videos: await service.search(req.body) }); } catch (error) { failure(res, error); }
  });
  router.post('/youtube/downloads', validateBody(youtubeDownloadSchema), async (req, res) => {
    try { res.status(202).json({ job: await service.enqueue(req.body) }); } catch (error) { failure(res, error); }
  });
  router.post('/youtube/downloads/:id/retry', async (req, res) => {
    try { res.status(202).json({ job: await service.retry(String(req.params.id)) }); } catch (error) { failure(res, error); }
  });
  router.post('/youtube/downloads/:id/add', validateBody(youtubeAddSchema), async (req, res) => {
    try { res.json({ job: await service.add(String(req.params.id), req.body.stationId) }); } catch (error) { failure(res, error); }
  });
  router.get('/youtube/downloads/:id/file', async (req, res) => {
    try {
      const file = await service.file(String(req.params.id));
      res.download(file.path, file.filename, error => { if (error && !res.headersSent) res.status(404).json({ error: 'Saved MP3 is missing' }); });
    } catch (error) { failure(res, error); }
  });
  return router;
}

export const youtubeImports = new YoutubeImports({
  storeDir: join(STATE_ROOT, 'youtube-imports'),
  downloadsDir: envStr('YT_DOWNLOADS_DIR', join(STATE_ROOT, 'Recent YT downloads')),
  libraryRoot: envStr('YT_LIBRARY_PATH', envStr('MUSIC_LIBRARY_PATH', '')),
  binary: envStr('YT_DLP_PATH', 'yt-dlp'), ffmpeg: envStr('FFMPEG_PATH', 'ffmpeg'),
  scanStation, stationExists: id => stationRows().some(s => s.id === id),
});
export const router = createYoutubeRouter(youtubeImports);
