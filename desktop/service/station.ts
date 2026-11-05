import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, readFileSync } from 'node:fs';
import { link, lstat, mkdir, readdir, unlink } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { LocalLibrary, DEFAULT_GENRES } from './library.js';
import { LocalRadio } from './radio.js';
import { YoutubeImports, youtubeLibraryFolder } from '../../controller/src/music/youtube/service.js';
import { runProcess, type RunProcess, type ProcessOptions } from '../../controller/src/music/youtube/process.js';
import { youtubeAddSchema, youtubeDownloadSchema, youtubeRoutingSchema, youtubeSearchSchema } from '../../controller/src/schemas/youtube.js';
import { desktopGenreCreateSchema, desktopPlaylistCreateSchema, desktopStationSelectSchema } from '../../controller/src/schemas/desktop-local.js';

type Options = {
  stateDir: string; musicDir: string; token: string; port?: number;
  ffmpeg?: string; ffprobe?: string; ytDlp?: string; run?: RunProcess;
  notify?: (message: Record<string, unknown>) => void; iconPath?: string;
};
const explain = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'EACCES' || code === 'EPERM') return 'Subwave cannot save to its local folders. Check folder permissions, then try again. Existing songs are kept.';
  if (code === 'ENOSPC') return 'Your disk is full. Free some space, then try again. Existing songs are kept.';
  if (code === 'EIO') return 'The disk could not save this change. Check that it is connected, then try again.';
  return error instanceof Error ? error.message : String(error);
};
const json = (res: ServerResponse, value: unknown, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
};
async function body(req: IncomingMessage): Promise<unknown> {
  let data = '';
  for await (const chunk of req) { data += String(chunk); if (Buffer.byteLength(data) > 16_384) throw new Error('Request is too large'); }
  try { return data ? JSON.parse(data) : {}; } catch { throw new Error('Request must contain valid JSON'); }
}
function processStart(pid: number) {
  try { const stat = readFileSync(`/proc/${pid}/stat`, 'utf8'); return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] || ''; }
  catch { return ''; }
}
const workerChildren = new Map<number, string>();
function killWorkerChildren() {
  for (const [pid, started] of workerChildren) {
    if (started && processStart(pid) === started) { try { process.kill(-pid, 'SIGKILL'); } catch { /* already stopped */ } }
  }
  workerChildren.clear();
}

export async function startLocalStation(options: Options) {
  if (options.token.length < 32) throw new Error('A private local service token is required');
  await mkdir(options.stateDir, { recursive: true, mode: 0o700 });
  const notify = options.notify || (() => {});
  const owned = new Map<number, string>();
  const onSpawn = (pid: number) => { const started = processStart(pid); owned.set(pid, started); workerChildren.set(pid, started); notify({ type: 'child-started', pid, started }); };
  const onExit = (pid: number) => { owned.delete(pid); workerChildren.delete(pid); notify({ type: 'child-exited', pid }); };
  const run: RunProcess = (binary, args, values: ProcessOptions = {}) => (options.run || runProcess)(binary, args, { ...values, onSpawn, onExit });
  const ffmpeg = options.ffmpeg || 'ffmpeg', ffprobe = options.ffprobe || 'ffprobe';
  let radio: LocalRadio | undefined;
  const library = new LocalLibrary({ stateDir: options.stateDir, musicDir: options.musicDir, ffprobe, run,
    onChange: () => notify({ type: 'library-changed', selected: library.selected }) });
  await library.initialize();
  const pendingStations = new Set<string>();
  const youtube = new YoutubeImports({ storeDir: join(options.stateDir, 'youtube-imports'), downloadsDir: library.downloadsDir,
    libraryRoot: library.root, binary: options.ytDlp || 'yt-dlp', ffmpeg, run,
    stationExists: id => pendingStations.has(id) || library.routes.some(route => route.stationId === id), scanStation: async () => { await library.scan(); } });
  const routing = await youtube.routing();
  library.setRoutes(routing.routes.length ? routing.routes : DEFAULT_GENRES);
  if (!routing.routes.length) await youtube.configure({ routes: DEFAULT_GENRES });
  const staging = (folder: string) => youtubeLibraryFolder(library.root, join(folder, '.subwave-staging'));
  // Main has already reaped the previous owner. Only app-owned unpublished
  // UUID staging files are eligible for interrupted-import cleanup.
  for (const route of library.routes) {
    const folder = await staging(route.folder);
    for (const name of await readdir(folder)) {
      if (!/^[a-f0-9-]{36}\.mp3$/.test(name)) continue;
      const file = join(folder, name), info = await lstat(file);
      if (info.isFile() && !info.isSymbolicLink()) await unlink(file);
    }
  }
  await library.scan();
  await youtube.resume();
  await library.scan();
  radio = new LocalRadio(library, { ffmpeg, onSpawn, onExit });
  const tools = await youtube.tools();
  if (!tools.ytDlp.available || !tools.ffmpeg.available) throw new Error('The local station needs yt-dlp and FFmpeg. Install them before starting Subwave.');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const stationRows = () => library.routes.map(route => ({ id: route.stationId, name: library.stationName(route.stationId), active: route.stationId === library.selected, configured: true }));
  let mutations = Promise.resolve<unknown>(undefined);
  const serialize = <T>(action: () => Promise<T>): Promise<T> => {
    const next = mutations.catch(() => {}).then(action); mutations = next; return next;
  };
  const select = async (id: string) => { await radio!.select(id); return library.view(); };
  const publicTrack = (track: ReturnType<LocalLibrary['track']> | null) => track ? {
    title: track.title, artist: track.artist, genre: track.genre, duration: track.duration,
    subsonic_id: track.id,
  } : null;

  async function importFiles(paths: string[], stationId?: string) {
    if (paths.length > 50) throw new Error('Open up to 50 audio files at a time');
    let destination = stationId && library.routes.some(route => route.stationId === stationId) ? stationId : library.selected;
    if (!library.routes.some(route => route.stationId === destination)) destination = library.routes.find(row => row.stationId === 'local-files')?.stationId || library.routes[0]!.stationId;
    const route = library.routes.find(row => row.stationId === destination)!;
    const folder = await youtubeLibraryFolder(library.root, route.folder);
    const stagingDir = await staging(route.folder);
    const published = new Set<string>();
    const result: { added: number; errors: string[] } = { added: 0, errors: [] };
    for (let i = 0; i < paths.length; i++) {
      const source = paths[i]!;
      notify({ type: 'file-import-progress', completed: i, total: paths.length, name: basename(source) });
      let temporary = '';
      try {
        const info = await lstat(source);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 250 * 1024 * 1024 || !/\.(mp3|flac|wav|m4a|ogg|opus|aac)$/i.test(source)) throw new Error('Choose an audio file under 250 MB');
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(source)) hash.update(chunk);
        const id = hash.digest('hex').slice(0, 12);
        let name = basename(source, extname(source)).replace(/[\x00-\x1f<>:"/\\|?*]/g, '-').slice(0, 100);
        while (Buffer.byteLength(name) > 180) name = Array.from(name).slice(0, -1).join('');
        const target = join(folder, `${name} [local-${id}].mp3`);
        if (await lstat(target).then(value => value.isFile() && !value.isSymbolicLink(), () => false)) {
          if (published.has(target) || library.tracksFor(destination).some(track => track.filename === basename(target))) continue;
          throw new Error('An existing file has this name but could not be read. It was kept unchanged. Try a different genre destination.');
        }
        temporary = join(stagingDir, `${randomUUID()}.mp3`);
        const metadata = JSON.parse(await run(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format_tags:stream_tags', '-of', 'json', source], { timeoutMs: 15_000 })
          .catch(() => { throw new Error('This file could not be read as audio. Try another copy.'); }));
        const tags = Object.fromEntries(Object.entries({ ...metadata.streams?.[0]?.tags, ...metadata.format?.tags }).map(([key, value]) => [key.toLowerCase(), value]));
        const namedTags = ['title', 'artist', 'album', 'genre'].flatMap(key => typeof tags[key] === 'string' ? ['-metadata', `${key}=${String(tags[key]).slice(0, 300)}`] : []);
        await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-protocol_whitelist', 'file,pipe', '-i', source,
          '-map', '0:a:0', '-vn', '-map_metadata', '0', ...namedTags, ...(route.stationId === 'local-files' ? [] : ['-metadata', `genre=${route.genre}`]),
          ...(/\.mp3$/i.test(source) ? ['-c:a', 'copy'] : ['-c:a', 'libmp3lame', '-q:a', '2']), temporary], { timeoutMs: 180_000 });
        if (!(await lstat(temporary)).size) throw new Error('No audio could be read');
        await link(temporary, target); published.add(target); result.added++;
      } catch (error) { result.errors.push(`${basename(source)}: ${explain(error)}`); }
      finally { if (temporary) await unlink(temporary).catch(() => {}); }
    }
    await library.scan();
    notify({ type: 'file-import-progress', completed: paths.length, total: paths.length, name: '' });
    return result;
  }

  async function copyTrack(id: string, stationId: string) {
    const track = library.track(id), route = library.routes.find(row => row.stationId === stationId);
    if (!track || !route) throw new Error('Choose a song and a genre station from your library');
    if (track.stationId === stationId) return library.view();
    const source = await library.path(id), folder = await youtubeLibraryFolder(library.root, route.folder);
    const target = join(folder, track.filename);
    const existing = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing) {
      // A matching catalog row is an idempotent repeat. A foreign file must
      // never be replaced just because its name happens to match.
      if (existing.isFile() && !existing.isSymbolicLink() && library.tracksFor(stationId).some(row => row.filename === track.filename)) return library.view();
      throw new Error('A file with this name already exists in the destination. It was kept unchanged.');
    }
    const temporary = join(await staging(route.folder), `${randomUUID()}.mp3`);
    try {
      await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-protocol_whitelist', 'file,pipe', '-f', 'mp3', '-i', source,
        '-map', '0:a:0', '-vn', '-c:a', 'copy', '-map_metadata', '0', '-metadata', `genre=${route.genre}`, temporary], { timeoutMs: 60_000 });
      if (!(await lstat(temporary)).size) throw new Error('No audio could be copied');
      await link(temporary, target);
    } finally { await unlink(temporary).catch(() => {}); }
    await library.scan(); return library.view();
  }

  let origin = '';
  const server = createServer((req, res) => {
    const supplied = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from(`Bearer ${options.token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || req.headers.host !== new URL(origin).host) {
      json(res, { error: 'Local station access only' }, 401); return;
    }
    const url = new URL(req.url || '/', origin);
    const path = url.pathname, method = req.method || 'GET';
    void (async () => {
      if (path === '/stream.mp3' && method === 'GET') { radio!.attach(res); return; }
      if (!path.startsWith('/api/')) { json(res, { error: 'Not found' }, 404); return; }
      const route = path.slice(4);
      if (method === 'GET') {
        if (route === '/health') { json(res, { ok: true, mode: 'local', tracks: library.tracksFor('all').length, station: library.selected }); return; }
        if (route === '/local/library') { json(res, { ...library.view(), error: radio!.error || library.error }); return; }
        if (route === '/youtube/downloads') { json(res, { jobs: await youtube.list() }); return; }
        if (route === '/youtube/status') { json(res, tools); return; }
        if (route === '/youtube/routing') { json(res, { ...await youtube.routing(), stations: stationRows() }); return; }
        const download = /^\/youtube\/downloads\/([a-f0-9-]{36})\/file$/.exec(route);
        if (download) {
          const file = await youtube.file(download[1]!);
          res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, 'Cache-Control': 'no-store' });
          const input = createReadStream(file.path); input.on('error', () => res.destroy()); res.once('close', () => input.destroy()); input.pipe(res); return;
        }
        if (route === '/now-playing') {
          json(res, { nowPlaying: publicTrack(radio!.current), context: { dominantMood: library.stationName() }, dj: { station: library.stationName() },
            activeShow: null, listeners: radio!.listeners, streamOnline: radio!.online, timezone, locale: 'en-GB',
            stream: { mount: '/stream.mp3', format: 'mp3', bitrate: 192, opusEnabled: false, bufferSeconds: 0 } }); return;
        }
        if (route === '/state') {
          json(res, { upcoming: radio!.upcoming().map(publicTrack), history: radio!.history.map(track => ({ ...publicTrack(track), startedAt: track.startedAt, endedAt: track.endedAt })),
            current: radio!.current ? { ...publicTrack(radio!.current), startedAt: radio!.startedAt } : null,
            ui: { skin: 'enochian', tuneInOverlay: false }, privacy: { privatePlayer: false, listenerAuth: false }, lyrics: { enabled: false }, timezone, locale: 'en-GB' }); return;
        }
        if (route === '/session') { json(res, { session: null, messages: radio!.history.slice(0, 20).reverse().map(track => ({ role: 'track', text: `${track.artist} — ${track.title}`, t: track.startedAt })) }); return; }
        if (route === '/schedule') { json(res, { personas: [], shows: [], schedule: {}, timezone, locale: 'en-GB' }); return; }
        if (route === '/onboarding/status') { json(res, { needsSetup: false, mode: 'local' }); return; }
        if (route === '/dj') { json(res, { station: library.stationName(), stationDescription: 'Your local genre radio library.' }); return; }
        if (route === '/like') { json(res, { enabled: false }); return; }
        if (route.startsWith('/lyrics/current')) { json(res, { error: 'Lyrics are not enabled' }, 403); return; }
        if (route.startsWith('/cover/') && options.iconPath) { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' }); createReadStream(options.iconPath).pipe(res); return; }
      }
      const value = await body(req);
      if (method === 'POST' && route === '/youtube/search') { json(res, { videos: await youtube.search(youtubeSearchSchema.parse(value)) }); return; }
      if (method === 'POST' && route === '/youtube/downloads') { json(res, { job: await youtube.enqueue(youtubeDownloadSchema.parse(value)) }, 202); return; }
      const jobAction = /^\/youtube\/downloads\/([a-f0-9-]{36})\/(add|retry)$/.exec(route);
      if (method === 'POST' && jobAction) {
        const job = jobAction[2] === 'retry' ? await youtube.retry(jobAction[1]!) : await youtube.add(jobAction[1]!, youtubeAddSchema.parse(value).stationId);
        json(res, { job }); return;
      }
      const youtubePlay = /^\/youtube\/downloads\/([a-f0-9-]{36})\/play$/.exec(route);
      if (method === 'POST' && youtubePlay) {
        const id = youtubePlay[1]!;
        const result = await serialize(async () => {
          let job = (await youtube.list()).find(row => row.id === id);
          if (!job || !['ready', 'importing', 'imported'].includes(job.state)) throw new Error('Wait for the MP3 to finish downloading');
          let track = library.view().allTracks.find(row => row.filename === job!.filename);
          if (!track) { job = await youtube.add(id, 'local-files'); await library.scan(); track = library.view().allTracks.find(row => row.filename === job!.filename); }
          if (!track) throw new Error('MP3 saved but it could not be read. Try adding it again.');
          await radio!.request(track.id); return { track, job };
        });
        json(res, result); return;
      }
      if (method === 'PUT' && route === '/youtube/routing') {
        const parsed = youtubeRoutingSchema.parse(value);
        const routing = await serialize(async () => { const next = await youtube.configure(parsed); library.setRoutes(next.routes); await library.scan(); return next; });
        json(res, routing); return;
      }
      if (method === 'POST' && route === '/local/stations/select') { json(res, await serialize(() => select(desktopStationSelectSchema.parse(value).id))); return; }
      if (method === 'POST' && route === '/local/scan') { json(res, await serialize(async () => { await library.scan(); return library.view(); })); return; }
      if (method === 'POST' && route === '/local/stations') {
        const input = desktopGenreCreateSchema.parse(value);
        const result = await serialize(async () => {
          if (library.routes.length >= 8) throw new Error('You can use up to eight genre stations');
          let id = input.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || `genre-${randomUUID().slice(0, 8)}`;
          if (id === 'all' || /^pl-[a-f0-9]{8}$/.test(id)) id = `genre-${id}`;
          if (library.routes.some(row => row.stationId === id)) id += `-${randomUUID().slice(0, 6)}`;
          await youtubeLibraryFolder(library.root, id); await staging(id);
          pendingStations.add(id);
          try {
            const next = await youtube.configure({ routes: [...library.routes, { stationId: id, displayName: input.name, genre: input.genre, aliases: [], folder: id }] });
            // One authoritative snapshot commits the genre and its name.
            // The empty folder needs no cache write after this commit.
            library.setRoutes(next.routes); return library.view();
          } finally { pendingStations.delete(id); }
        });
        json(res, result); return;
      }
      if (method === 'POST' && route === '/local/playlists') { json(res, await serialize(() => library.createPlaylist(desktopPlaylistCreateSchema.parse(value).name))); return; }
      const playlist = /^\/local\/playlists\/(pl-[a-f0-9]{8})(\/restore)?$/.exec(route);
      if (playlist && method === 'PUT') { json(res, await serialize(() => library.editPlaylist(playlist[1]!, value))); return; }
      if (playlist && (method === 'DELETE' || (method === 'POST' && playlist[2]))) { json(res, await serialize(async () => {
        const active = library.selected === playlist[1] && !playlist[2];
        await library.trashPlaylist(playlist[1]!, !!playlist[2]); if (active) await radio!.select('all'); return library.view();
      })); return; }
      if (method === 'POST' && route === '/local/next') {
        json(res, await serialize(async () => { const next = radio!.upcoming()[0] || library.tracksFor()[0]; if (next) await radio!.request(next.id); return { ok: true }; })); return;
      }
      const play = /^\/local\/tracks\/([a-f0-9]{32})\/play$/.exec(route);
      if (method === 'POST' && play) { json(res, await serialize(async () => ({ track: await radio!.request(play[1]!) }))); return; }
      const copy = /^\/local\/tracks\/([a-f0-9]{32})\/copy$/.exec(route);
      if (method === 'POST' && copy) { json(res, await serialize(() => copyTrack(copy[1]!, youtubeAddSchema.parse(value).stationId))); return; }
      if (method === 'POST' && route === '/request') {
        const query = String((value as { text?: string }).text || '').toLowerCase().replace(/\b(play|please|by)\b/g, '').trim();
        const track = library.tracksFor('all').find(row => `${row.title} ${row.artist}`.toLowerCase().includes(query));
        if (track && query) { await serialize(() => radio!.request(track.id)); json(res, { success: true, status: 'queued', ack: `Playing ${track.title} by ${track.artist}.`, track }); }
        else json(res, { success: false, status: 'no-match', ack: 'Choose a song already in your Library, or add it from YouTube.' });
        return;
      }
      if (method === 'POST' && route === '/beacon') { json(res, { ok: true }); return; }
      json(res, { error: 'This control belongs to the server edition. Use the local Library, Playlists and Genre stations in the desktop player.' }, 404);
    })().catch(error => { if (!res.headersSent) json(res, { error: explain(error).slice(0, 1200) }, 400); else res.destroy(); });
  });
  server.requestTimeout = 180_000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port || 0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let closing: Promise<void> | undefined;
  return { origin, library, youtube, radio, importFiles,
    close: () => closing ??= (async () => { radio!.close(); for (const [pid, started] of owned) { if (started && processStart(pid) === started) { try { process.kill(-pid, 'SIGKILL'); } catch { /* already exited */ } } }
      await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); await library.remember(); })(),
  };
}

type ParentPort = { on: (name: string, callback: (event: { data: unknown }) => void) => void; postMessage: (value: unknown) => void };
const parent = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort;
if (process.env.SUBWAVE_LOCAL_BOOT === '1') {
  const send = (message: Record<string, unknown>) => { if (parent) parent.postMessage(message); else if (process.send) process.send(message); };
  const parentPid = Number(process.env.SUBWAVE_PARENT_PID);
  const parentStarted = process.env.SUBWAVE_PARENT_STARTED;
  let stopping = false;
  // Watch the owner during initialization as well as after readiness. Recovery
  // may already be running FFmpeg when the desktop process disappears.
  const earlyStop = () => { if (stopping) return; stopping = true; killWorkerChildren(); process.exit(0); };
  let stopWorker: () => void = earlyStop;
  process.on('SIGTERM', () => stopWorker()); process.on('SIGINT', () => stopWorker());
  if (parentPid) setInterval(() => { const identity = processStart(parentPid); if (!identity || identity !== parentStarted) stopWorker(); }, 1500).unref();
  void startLocalStation({ stateDir: process.env.SUBWAVE_LOCAL_STATE!, musicDir: process.env.SUBWAVE_MUSIC_DIR!, token: process.env.SUBWAVE_LOCAL_TOKEN!,
    port: Number(process.env.SUBWAVE_LOCAL_PORT || 0), ffmpeg: process.env.SUBWAVE_FFMPEG, ffprobe: process.env.SUBWAVE_FFPROBE,
    ytDlp: process.env.SUBWAVE_YT_DLP, iconPath: process.env.SUBWAVE_LOCAL_ICON, notify: send,
  }).then(station => {
    send({ type: 'ready', origin: station.origin });
    const stop = async () => { if (stopping) return; stopping = true; await station.close(); process.exit(0); };
    stopWorker = () => { void stop(); };
    const command = (value: unknown) => {
      const message = value as { type?: string; id?: string; paths?: string[]; stationId?: string };
      if (message.type === 'shutdown') { void stop(); return; }
      if (message.type === 'import-files' && message.id && Array.isArray(message.paths)) {
        void station.importFiles(message.paths, message.stationId).then(result => send({ type: 'reply', id: message.id, result }), error => send({ type: 'reply', id: message.id, error: explain(error) }));
      }
    };
    if (parent) parent.on('message', event => command(event.data));
    else process.on('message', command);
  }).catch(error => { killWorkerChildren(); send({ type: 'failed', error: explain(error) }); console.error(explain(error)); process.exit(1); });
}
