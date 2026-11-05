// Persistent install-level download queue. A ready MP3 is independent of a
// Navidrome import: a scan failure never loses/re-downloads the local file.
// The library root is operator-configured, never supplied by an HTTP client.
import { constants, createReadStream } from 'node:fs';
import { access, copyFile, link, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createSerialFileWriter, writeFileAtomic } from '../../util/atomic-file.js';
import {
  youtubeDownloadSchema, youtubeRoutingSchema, youtubeSearchSchema, youtubeVideoId,
  YT_JOB_ID_RE, YT_STATION_ID_RE, type YoutubeImportCopy, type YoutubeJob, type YoutubeRoute, type YoutubeRouting, type YoutubeVideo,
} from '../../schemas/youtube.js';
import { routeYoutubeVideo, videoFromInfo, youtubeFilename } from './pure.js';
import { runProcess, YT_BASE_ARGS, type RunProcess } from './process.js';

interface Options {
  storeDir: string; downloadsDir: string; libraryRoot: string;
  binary?: string; ffmpeg?: string; run?: RunProcess;
  scanStation?: (stationId: string) => Promise<void>;
  stationExists: (stationId: string) => boolean;
}
const active = (job: YoutubeJob) => ['queued', 'inspecting', 'downloading', 'importing'].includes(job.state);
async function digest(file: string): Promise<string> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Expected an ordinary MP3 file');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

// Disk records are not trusted TypeScript objects. Quarantine only malformed
// records; I/O/recovery failures remain retryable and never discard history.
function storedJob(value: unknown, id: string): YoutubeJob {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const nullableText = (v: unknown) => v === null || typeof v === 'string';
  const station = (v: unknown) => typeof v === 'string' && YT_STATION_ID_RE.test(v);
  const nullableStation = (v: unknown) => v === null || station(v);
  const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  const strings = (v: unknown) => Array.isArray(v) && v.every(s => typeof s === 'string');
  const invalid = () => { throw new Error(`Invalid YouTube download record: ${id}`); };
  if (!object(value) || value.id !== id || typeof value.url !== 'string'
    || typeof value.videoId !== 'string' || youtubeVideoId(value.url) !== value.videoId
    || !['queued', 'inspecting', 'downloading', 'ready', 'importing', 'imported', 'failed'].includes(String(value.state))
    || !(value.progress === null || typeof value.progress === 'number' && Number.isFinite(value.progress) && value.progress >= 0 && value.progress <= 100)
    || !timestamp(value.createdAt) || !timestamp(value.updatedAt)
    || !nullableStation(value.requestedStationId) || !nullableStation(value.suggestedStationId)
    || typeof value.autoImport !== 'boolean' || !nullableText(value.error)
    || !(value.filename === null || typeof value.filename === 'string' && basename(value.filename) === value.filename
      && !/[\\/\x00-\x1f]/.test(value.filename) && value.filename.endsWith(`[${value.videoId}].mp3`))
    || !(value.downloadSha256 === undefined || hash(value.downloadSha256))) invalid();
  // Narrow again after the throwing validation helper for TypeScript.
  if (!object(value)) return invalid();
  const video = value.video;
  if (video !== null && (!object(video) || video.id !== value.videoId || typeof video.url !== 'string'
    || youtubeVideoId(video.url) !== value.videoId
    || !['title', 'artist', 'channel', 'description'].every(key => typeof video[key] === 'string')
    || !strings(video.genres) || !strings(video.tags)
    || !(video.duration === null || typeof video.duration === 'number' && Number.isFinite(video.duration) && video.duration > 0))) invalid();
  if (value.filename !== null && video === null) invalid();
  const copy = (v: unknown, pending = false) => object(v) && station(v.stationId)
    && typeof v.genre === 'string' && timestamp(v.addedAt) && typeof v.path === 'string'
    && basename(v.path) === value.filename
    && youtubeRoutingSchema.safeParse({ routes: [{ stationId: v.stationId, genre: v.genre, aliases: [], folder: dirname(v.path) }] }).success
    && (pending ? hash(v.sha256) : nullableText(v.scanWarning));
  if (!Array.isArray(value.copies) || !value.copies.every(v => copy(v))
    || !(value.pendingCopy === undefined || copy(value.pendingCopy, true))) invalid();
  return value as unknown as YoutubeJob;
}

/** Creates only ordinary directories; a symlink cannot redirect an import
 * outside the explicitly configured library mount. Existing files are kept. */
export async function youtubeLibraryFolder(root: string, relative: string): Promise<string> {
  const parsed = youtubeRoutingSchema.safeParse({ routes: [{ stationId: 'check', genre: 'check', aliases: [], folder: relative }] });
  if (!parsed.success) throw new Error('Invalid library folder');
  const realRoot = await realpath(root);
  let current = realRoot;
  for (const part of relative.replaceAll('\\', '/').split('/')) {
    current = join(current, part);
    try { await mkdir(current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Library folders must be real directories, not links');
    const physical = await realpath(current);
    if (!physical.startsWith(realRoot + sep)) throw new Error('Library folder is outside the library mount');
  }
  return current;
}

export class YoutubeImports {
  private jobs = new Map<string, YoutubeJob>();
  private writers = new Map<string, ReturnType<typeof createSerialFileWriter>>();
  private running = false;
  private searches = 0;
  private routingWriter: ReturnType<typeof createSerialFileWriter>;
  private importLocks = new Map<string, Promise<unknown>>();
  private initialization: Promise<void> | undefined;
  private recovery: Promise<void> | undefined;
  private recoveries = new Set<string>();
  private automaticRecoveries = new Set<string>();
  private routes: YoutubeRoute[] = [];
  private run: RunProcess;
  private binary: string;
  private ffmpeg: string;
  constructor(private options: Options) {
    this.routingWriter = createSerialFileWriter(join(options.storeDir, 'routing.json'));
    this.run = options.run ?? runProcess; this.binary = options.binary || 'yt-dlp'; this.ffmpeg = options.ffmpeg || 'ffmpeg';
  }
  private async initialize() {
    if (!this.initialization) {
      this.initialization = this.load().catch(error => {
        this.initialization = undefined;
        throw error;
      });
    }
    return this.initialization;
  }
  private async savedOriginal(job: YoutubeJob): Promise<boolean> {
    if (!job.filename || !job.downloadSha256) return false;
    try { return await digest(await this.mediaPath(job)) === job.downloadSha256; }
    catch { return false; }
  }
  private async load() {
    await mkdir(join(this.options.storeDir, 'jobs'), { recursive: true });
    await mkdir(this.options.downloadsDir, { recursive: true });
    let routes: YoutubeRoute[] = [];
    try {
      routes = youtubeRoutingSchema.parse(JSON.parse(await readFile(join(this.options.storeDir, 'routing.json'), 'utf8'))).routes;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Could not read YouTube routing rules; repair routing.json before importing'); }
    const jobs = new Map<string, YoutubeJob>(), recoveries = new Set<string>(), automatic = new Set<string>();
    for (const file of await readdir(join(this.options.storeDir, 'jobs'))) {
      const id = file.replace(/\.json$/, ''); if (!YT_JOB_ID_RE.test(id) || file !== `${id}.json`) continue;
      const path = join(this.options.storeDir, 'jobs', file);
      const source = await readFile(path, 'utf8'); // operational failures must not quarantine valid records
      let job: YoutubeJob;
      try { job = storedJob(JSON.parse(source), id); }
      catch (error) {
        const quarantine = join(this.options.storeDir, 'quarantine');
        await mkdir(quarantine, { recursive: true });
        await rename(path, join(quarantine, `${id}-${randomUUID()}.json`));
        console.warn(`[youtube] quarantined ${file}: ${errorText(error)}`);
        continue;
      }
      jobs.set(id, job);
      await rm(join(this.options.storeDir, 'tmp', id), { recursive: true, force: true });
      // Keep interrupted automatic intent on disk until resume completes. A
      // failed later initialization can then retry without losing that intent.
      if (active(job)) {
        const saved = await this.savedOriginal(job);
        job.state = saved ? job.copies.length ? 'imported' : 'ready' : 'failed'; job.progress = saved ? 100 : null;
        job.error = saved ? null : 'Download interrupted by a restart. Retry to continue.';
        if (saved && job.autoImport && this.options.libraryRoot && (job.requestedStationId || job.suggestedStationId)) {
          automatic.add(id); recoveries.add(id);
        } else await this.save(job);
      }
      if (job.pendingCopy || job.copies.some(copy => copy.scanWarning !== null)) recoveries.add(id);
    }
    // Publish only a complete load, so an operational retry cannot retain a
    // partial in-memory history or stale routing rules.
    this.jobs = jobs; this.routes = routes;
    this.recoveries = recoveries; this.automaticRecoveries = automatic;
  }
  /** Reconcile only durable interrupted work, after initialization resolves.
   * Call at local-worker startup; list() also runs it once for web cold starts.
   * add() deliberately waits for initialization, not resume, so neither the
   * recovery lock nor automatic publication can recursively await itself. */
  async resume(): Promise<void> {
    await this.initialize();
    if (!this.recovery) this.recovery = this.resumeLoaded().catch(error => { this.recovery = undefined; throw error; });
    return this.recovery;
  }
  private async resumeLoaded() {
    for (const id of [...this.recoveries]) {
      await this.withImportLock(id, async () => {
        const job = this.find(id);
        try {
          // Keep automatic intent durable even when an absent published copy
          // clears its old journal before the replacement is tagged.
          const automatic = this.automaticRecoveries.has(id);
          if (automatic) job.state = 'importing';
          const pendingStation = job.pendingCopy?.stationId;
          if (job.pendingCopy) await this.recoverCopy(job);
          for (const copy of job.copies) {
            if (copy.scanWarning !== null && copy.stationId !== pendingStation) await this.scanCopy(job, copy);
          }
          const station = job.requestedStationId || job.suggestedStationId;
          if (automatic && station && !job.copies.some(copy => copy.stationId === station)) await this.copyToLibrary(id, station);
          else if (automatic) { job.state = job.copies.length ? 'imported' : 'ready'; await this.save(job); }
        } catch (error) {
          job.state = job.copies.length ? 'imported' : await this.savedOriginal(job) ? 'ready' : 'failed';
          job.error = `Could not resume station import: ${errorText(error)}`;
          await this.save(job);
        }
      });
      this.recoveries.delete(id); this.automaticRecoveries.delete(id);
    }
  }
  private save(job: YoutubeJob) {
    job.updatedAt = new Date().toISOString();
    let writer = this.writers.get(job.id);
    if (!writer) { writer = createSerialFileWriter(join(this.options.storeDir, 'jobs', `${job.id}.json`)); this.writers.set(job.id, writer); }
    return writer(JSON.stringify(job, null, 2));
  }
  async list(): Promise<YoutubeJob[]> {
    await this.resume();
    return structuredClone([...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async routing(): Promise<YoutubeRouting> { await this.initialize(); return { routes: structuredClone(this.routes) }; }
  async configure(raw: unknown): Promise<YoutubeRouting> {
    await this.initialize();
    const next = youtubeRoutingSchema.parse(raw);
    for (const route of next.routes) if (!this.options.stationExists(route.stationId)) throw new Error(`Station ${route.stationId} is not available`);
    await this.routingWriter(JSON.stringify(next, null, 2));
    this.routes = next.routes;
    return this.routing();
  }
  async tools() {
    const probe = async (binary: string, args: string[]) => {
      try { return { available: true, version: (await this.run(binary, args, { timeoutMs: 10_000 })).trim().split('\n')[0].slice(0, 150) }; }
      catch { return { available: false, version: null }; }
    };
    const ytDlp = await probe(this.binary, ['--version']);
    const ffmpeg = await probe(this.ffmpeg, ['-version']);
    let libraryWritable = false;
    if (this.options.libraryRoot) try { await access(this.options.libraryRoot, constants.W_OK); libraryWritable = true; } catch { /* surface status below */ }
    return { ytDlp, ffmpeg, libraryConfigured: !!this.options.libraryRoot, libraryWritable, downloadsDir: resolve(this.options.downloadsDir), libraryRoot: this.options.libraryRoot || null };
  }
  async search(raw: unknown): Promise<YoutubeVideo[]> {
    const { query } = youtubeSearchSchema.parse(raw);
    if (this.searches >= 2) throw new Error('A search is already running. Try again in a moment.');
    const id = youtubeVideoId(query);
    this.searches++;
    try {
      const args = [...YT_BASE_ARGS, '--dump-single-json', '--skip-download', ...(id ? ['--no-playlist'] : ['--flat-playlist', '--playlist-end', '8']), '--', id ? `https://www.youtube.com/watch?v=${id}` : `ytsearch8:${query}`];
      const result = JSON.parse(await this.run(this.binary, args, { timeoutMs: id ? 120_000 : 60_000 }));
      if (id) return [videoFromInfo(result)];
      const rows: YoutubeVideo[] = [];
      for (const item of Array.isArray(result.entries) ? result.entries.slice(0, 8) : []) {
        try { rows.push(videoFromInfo(item)); } catch { /* unavailable, live or overly long result */ }
      }
      return rows;
    } finally { this.searches--; }
  }
  async enqueue(raw: unknown): Promise<YoutubeJob> {
    const input = youtubeDownloadSchema.parse(raw);
    await this.initialize();
    if (input.stationId) this.route(input.stationId);
    const videoId = youtubeVideoId(input.url)!;
    const previous = [...this.jobs.values()].find(j => j.videoId === videoId);
    if (previous && previous.state !== 'failed') return structuredClone(previous);
    if ([...this.jobs.values()].filter(active).length >= 25) throw new Error('The download queue is full. Wait for a download to finish.');
    if (!previous && this.jobs.size >= 500) throw new Error('The download history is full (500 songs). Archive old download records before adding more.');
    const now = new Date().toISOString();
    const job: YoutubeJob = previous ?? {
      id: randomUUID(), videoId, url: `https://www.youtube.com/watch?v=${videoId}`,
      state: 'queued', progress: null, createdAt: now, updatedAt: now, video: null,
      requestedStationId: input.stationId ?? null, suggestedStationId: null, autoImport: input.autoImport,
      filename: null, error: null, copies: [],
    };
    job.state = 'queued'; job.progress = null; job.error = null;
    job.autoImport = input.autoImport; job.requestedStationId = input.stationId ?? null;
    this.jobs.set(job.id, job); await this.save(job);
    void this.drain().catch(error => console.error('[youtube] download queue:', errorText(error)));
    return structuredClone(job);
  }
  async retry(id: string): Promise<YoutubeJob> {
    await this.initialize(); const job = this.find(id);
    if (job.state !== 'failed') throw new Error('Only a failed download needs retrying');
    return this.enqueue({ url: job.url, autoImport: job.autoImport, ...(job.requestedStationId ? { stationId: job.requestedStationId } : {}) });
  }
  private find(id: string): YoutubeJob {
    if (!YT_JOB_ID_RE.test(id) || !this.jobs.has(id)) throw new Error('Download not found');
    return this.jobs.get(id)!;
  }
  private route(id: string) {
    const route = this.routes.find(r => r.stationId === id);
    if (!route || !this.options.stationExists(id)) throw new Error('Choose a configured genre station');
    return route;
  }
  private async mediaPath(job: YoutubeJob): Promise<string> {
    const name = job.filename;
    if (!name || basename(name) !== name || !name.endsWith(`[${job.videoId}].mp3`)) throw new Error('MP3 is not ready');
    const file = join(this.options.downloadsDir, name);
    const info = await lstat(file).catch(() => { throw new Error('Saved MP3 is missing'); });
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1) throw new Error('Saved MP3 is missing');
    return file;
  }
  async file(id: string): Promise<{ path: string; filename: string }> {
    await this.initialize(); const job = this.find(id);
    if (job.state !== 'ready' && job.state !== 'importing' && job.state !== 'imported') throw new Error('MP3 is not ready');
    return { path: await this.mediaPath(job), filename: job.filename! };
  }
  private async drain() {
    if (this.running) return; this.running = true;
    try {
      for (let job = [...this.jobs.values()].find(j => j.state === 'queued'); job; job = [...this.jobs.values()].find(j => j.state === 'queued')) {
        try { await this.download(job); }
        catch (error) {
          job.state = 'failed'; job.error = errorText(error); job.progress = null;
          await this.save(job).catch(writeError => {
            job!.error += ` (Could not save download status: ${errorText(writeError)})`;
            console.error('[youtube] could not persist failed download:', errorText(writeError));
          });
        }
      }
    } finally { this.running = false; }
  }
  private async download(job: YoutubeJob) {
    // Resume only a publication whose bytes match this job's durable intent.
    if (await this.savedOriginal(job)) { await this.ready(job); return; }
    job.state = 'inspecting'; await this.save(job);
    const raw = JSON.parse(await this.run(this.binary, [...YT_BASE_ARGS, '--no-playlist', '--dump-single-json', '--skip-download', '--', job.url], { timeoutMs: 120_000 }));
    job.video = videoFromInfo(raw);
    if (job.video.id !== job.videoId) throw new Error('YouTube returned a different video');
    job.suggestedStationId = routeYoutubeVideo(job.video, this.routes)?.stationId ?? null;
    const dir = join(this.options.storeDir, 'tmp', job.id, randomUUID()); await mkdir(dir, { recursive: true });
    try {
      const metadataFile = join(dir, 'video.info.json');
      await writeFileAtomic(metadataFile, JSON.stringify(raw), { mode: 0o600 });
      job.state = 'downloading'; await this.save(job);
      await this.run(this.binary, [
        ...YT_BASE_ARGS, ...(this.ffmpeg.includes('/') ? ['--ffmpeg-location', this.ffmpeg] : []), '--no-playlist', '--no-overwrites', '--max-filesize', '250M', '--match-filter', '!is_live & duration <= 1800',
        '-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '--embed-metadata',
        '--newline', '--progress-template', 'download:download:%(progress._percent_str)s',
        '-o', join(dir, 'audio.%(ext)s'), '--load-info-json', metadataFile,
      ], { timeoutMs: 15 * 60_000, onLine: line => {
        const match = /^download:\s*(\d+(?:\.\d+)?)%/.exec(line);
        if (match) job.progress = Math.min(100, Number(match[1]));
      } });
      const downloaded = join(dir, 'audio.mp3');
      const info = await stat(downloaded).catch(() => { throw new Error('YouTube did not produce an MP3. The video may be unavailable, restricted or too long.'); });
      if (info.size < 1 || info.size > 250 * 1024 * 1024) throw new Error('YouTube did not produce an MP3 within the size limit');
      job.filename = youtubeFilename(job.video); job.downloadSha256 = await digest(downloaded); await this.save(job);
      const temporary = join(this.options.downloadsDir, `.${job.id}-${randomUUID()}.tmp.mp3`);
      try {
        await copyFile(downloaded, temporary, constants.COPYFILE_EXCL);
        try { await link(temporary, join(this.options.downloadsDir, job.filename)); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await digest(join(this.options.downloadsDir, job.filename)) !== job.downloadSha256) throw new Error('An existing MP3 has this name. It was kept unchanged.');
        }
      } finally { await unlink(temporary).catch(() => {}); }
      await unlink(downloaded).catch(() => {});
      await this.ready(job);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
  private async ready(job: YoutubeJob) {
    const station = job.requestedStationId || job.suggestedStationId;
    job.state = job.autoImport && station && this.options.libraryRoot ? 'importing' : 'ready'; job.progress = 100; await this.save(job);
    if (job.autoImport && station && this.options.libraryRoot) {
      try { await this.add(job.id, station); }
      catch (error) { job.state = job.copies.length ? 'imported' : 'ready'; job.error = `MP3 saved. Could not add it to the station: ${errorText(error)}`; await this.save(job); }
    }
  }
  private async withImportLock<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.importLocks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    this.importLocks.set(id, next);
    try { return await next; } finally { if (this.importLocks.get(id) === next) this.importLocks.delete(id); }
  }
  async add(id: string, stationId: string): Promise<YoutubeJob> {
    await this.initialize();
    return this.withImportLock(id, async () => {
      try { return await this.copyToLibrary(id, stationId); }
      catch (error) {
        const job = this.find(id);
        if (job.state === 'importing') { job.state = job.copies.length ? 'imported' : 'ready'; job.error = errorText(error); await this.save(job); }
        throw error;
      }
    });
  }
  private async copyToLibrary(id: string, stationId: string): Promise<YoutubeJob> {
    const job = this.find(id), route = this.route(stationId);
    if (!this.options.libraryRoot) throw new Error('Set YT_LIBRARY_PATH to a writable Navidrome music folder first');
    if (job.state !== 'ready' && job.state !== 'importing' && job.state !== 'imported') throw new Error('Wait for the MP3 download to finish');
    const pendingStation = job.pendingCopy?.stationId;
    await this.recoverCopy(job);
    const existing = job.copies.find(c => c.stationId === stationId);
    if (existing) {
      if (existing.scanWarning !== null && pendingStation !== stationId) await this.scanCopy(job, existing);
      return structuredClone(job);
    }
    const source = await this.mediaPath(job);
    const folder = await youtubeLibraryFolder(this.options.libraryRoot, route.folder);
    const target = join(folder, job.filename!);
    job.state = 'importing'; await this.save(job);
    const temporary = join(folder, `.${job.id}-${randomUUID()}.tmp.mp3`);
    try {
      await this.run(this.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', source,
        '-map', '0:a:0', '-c:a', 'copy', '-map_metadata', '0',
        '-metadata', `genre=${route.genre}`, '-metadata', `title=${job.video!.title}`,
        '-metadata', `artist=${job.video!.artist}`, '-metadata', `comment=${job.url}`, temporary,
      ], { timeoutMs: 60_000 });
      const info = await stat(temporary); if (!info.size) throw new Error('The tagged MP3 is empty');
      // Journal the expected bytes BEFORE publication; retry can adopt only
      // our own completed copy after a process restart, never a colliding file.
      job.pendingCopy = { stationId, genre: route.genre, path: join(route.folder, job.filename!), addedAt: new Date().toISOString(), sha256: await digest(temporary) };
      await this.save(job);
      await link(temporary, target); // refuses an existing file rather than replacing it
    } finally { await unlink(temporary).catch(() => {}); }
    await this.recoverCopy(job);
    return structuredClone(job);
  }
  private async recoverCopy(job: YoutubeJob) {
    const pending = job.pendingCopy;
    if (!pending) return;
    if (basename(pending.path) !== job.filename || !/^[a-f0-9]{64}$/.test(pending.sha256)) throw new Error('Invalid pending station import');
    const folder = await youtubeLibraryFolder(this.options.libraryRoot, dirname(pending.path));
    const target = join(folder, job.filename!);
    const exists = await lstat(target).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (!exists) { delete job.pendingCopy; await this.save(job); return; }
    if (await digest(target) !== pending.sha256) throw new Error('An existing station MP3 has this name. It was kept unchanged.');
    let copy = job.copies.find(c => c.stationId === pending.stationId);
    if (!copy) {
      copy = { stationId: pending.stationId, genre: pending.genre, path: pending.path, addedAt: pending.addedAt, scanWarning: null };
      job.copies.push(copy);
    }
    // A non-null scan warning is also the durable pending-callback marker.
    // Commit it with the adopted copy BEFORE the callback: a crash after the
    // callback is safe to replay, and a crash before it cannot lose the scan.
    copy.scanWarning = 'MP3 added. Station scan is pending.';
    delete job.pendingCopy; job.state = 'imported'; job.error = null;
    await this.save(job);
    await this.scanCopy(job, copy);
  }
  private async scanCopy(job: YoutubeJob, copy: YoutubeImportCopy) {
    try {
      await this.options.scanStation?.(copy.stationId);
      copy.scanWarning = null;
    } catch (error) {
      copy.scanWarning = `MP3 added. Navidrome scan could not start: ${errorText(error)}`;
    }
    await this.save(job);
  }
}
