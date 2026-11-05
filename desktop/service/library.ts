import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { createSerialFileWriter } from '../../controller/src/util/atomic-file.js';
import { youtubeLibraryFolder } from '../../controller/src/music/youtube/service.js';
import type { YoutubeRoute } from '../../controller/src/schemas/youtube.js';
import { desktopPlaylistEditSchema, desktopPlaylistSchema, desktopTrackSchema, desktopInternetStationSchema, type DesktopInternetStation, type DesktopInternetStationInput, type DesktopLibrary, type DesktopTrack, type DesktopPlaylist } from '../../controller/src/schemas/desktop-local.js';
import type { RunProcess } from '../../controller/src/music/youtube/process.js';

export const DEFAULT_GENRES: YoutubeRoute[] = [
  { stationId: 'jazz', genre: 'Jazz', aliases: ['bebop', 'hard bop', 'swing'], folder: 'Jazz' },
  { stationId: 'house', genre: 'House', aliases: ['deep house', 'tech house'], folder: 'House' },
  { stationId: 'rock', genre: 'Rock', aliases: ['alternative rock', 'indie rock'], folder: 'Rock' },
  { stationId: 'ambient', genre: 'Ambient', aliases: ['drone', 'downtempo'], folder: 'Ambient' },
  { stationId: 'local-files', genre: 'Local files', aliases: [], folder: 'Local files' },
];
type CachedTrack = { stamp: string; track: DesktopTrack };
type Preferences = { selected: string; names: Record<string, string>; playlists: DesktopPlaylist[]; internetStations: DesktopInternetStation[] };
type Options = { stateDir: string; musicDir: string; run: RunProcess; ffprobe: string; onChange?: () => void };

export class LocalLibrary {
  routes: YoutubeRoute[] = [];
  selected = 'all';
  error: string | null = null;
  private names: Record<string, string> = {};
  private playlists: DesktopPlaylist[] = [];
  private internetStations: DesktopInternetStation[] = [];
  private tracks: DesktopTrack[] = [];
  private files = new Map<string, string>();
  private cache: Record<string, CachedTrack> = {};
  private scanChain = Promise.resolve();
  private preferencesChain: Promise<unknown> = Promise.resolve();
  private savePreferences;
  private saveCache;
  readonly root: string;
  readonly downloadsDir: string;
  constructor(private options: Options) {
    this.root = join(options.musicDir, 'Stations');
    this.downloadsDir = join(options.musicDir, 'Recent YT downloads');
    this.savePreferences = createSerialFileWriter(join(options.stateDir, 'library.json'));
    this.saveCache = createSerialFileWriter(join(options.stateDir, 'catalog.json'));
  }
  async initialize() {
    await mkdir(this.options.stateDir, { recursive: true, mode: 0o700 });
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await mkdir(this.downloadsDir, { recursive: true, mode: 0o700 });
    const read = async (name: string) => {
      try { return JSON.parse(await readFile(join(this.options.stateDir, name), 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`Could not read ${name}; rebuilding local library index.`); return {}; }
    };
    const loaded = await read('library.json');
    const preferences = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? loaded : {};
    this.selected = typeof preferences.selected === 'string' ? preferences.selected : 'all';
    this.names = preferences.names && typeof preferences.names === 'object' ? Object.fromEntries(Object.entries(preferences.names).filter(([id, name]) => /^[a-z0-9-]{1,41}$/.test(id) && typeof name === 'string')) as Record<string, string> : {};
    this.playlists = Array.isArray(preferences.playlists) ? preferences.playlists.filter((p: unknown) => desktopPlaylistSchema.safeParse(p).success && /^pl-[a-f0-9]{8}$/.test((p as DesktopPlaylist).id)) : [];
    this.internetStations = Array.isArray(preferences.internetStations) ? preferences.internetStations.filter((row: unknown) => desktopInternetStationSchema.safeParse(row).success).slice(0,200) : [];
    const cache = await read('catalog.json');
    this.cache = cache && typeof cache === 'object' ? cache : {};
  }
  setRoutes(routes: YoutubeRoute[]) {
    this.routes = structuredClone(routes);
    if (this.selected !== 'all' && !routes.some(route => route.stationId === this.selected) && !this.playlists.some(p => p.id === this.selected && !p.deletedAt) && !this.internetStation()) this.selected = 'all';
  }
  private changePreferences<T>(change: (current: Preferences) => { next: Preferences; result: T }): Promise<T> {
    const operation = this.preferencesChain.catch(() => {}).then(async () => {
      const current = { selected: this.selected, names: this.names, playlists: this.playlists, internetStations: this.internetStations };
      const { next, result } = change(current);
      // Publish memory only after the snapshot reaches disk. Every writer,
      // including an index scan, takes its snapshot inside this same queue.
      await this.savePreferences(JSON.stringify(next));
      this.selected = next.selected; this.names = next.names; this.playlists = next.playlists; this.internetStations = next.internetStations;
      return result;
    });
    this.preferencesChain = operation; return operation;
  }
  async remember() { await this.changePreferences(current => ({ next: current, result: undefined })); }
  async setName(id: string, name: string) { await this.changePreferences(current => ({ next: { ...current, names: { ...current.names, [id]: name } }, result: undefined })); }
  async select(id: string) {
    await this.changePreferences(current => {
      if (id !== 'all' && !this.routes.some(route => route.stationId === id) && !current.playlists.some(p => p.id === id && !p.deletedAt) && !current.internetStations.some(row => row.id === id)) throw new Error('Station or playlist not found');
      return { next: { ...current, selected: id }, result: undefined };
    });
    this.options.onChange?.();
  }
  stationName(id = this.selected) {
    if (id === 'all') return 'All music';
    const internet = this.internetStation(id); if (internet) return internet.name;
    const playlist = this.playlists.find(p => p.id === id && !p.deletedAt);
    if (playlist) return playlist.name;
    const label = this.routes.find(route => route.stationId === id)?.displayName;
    if (label) return label;
    return typeof this.names[id] === 'string' ? this.names[id] : `${this.routes.find(route => route.stationId === id)?.genre || id} Radio`;
  }
  internetStation(id = this.selected) { return this.internetStations.find(row => row.id === id) || null; }
  async saveInternetStation(input: DesktopInternetStationInput) {
    const id = `net-${createHash('sha256').update(input.providerId || input.url).digest('hex').slice(0,16)}`;
    const station = desktopInternetStationSchema.parse({ ...input, id });
    await this.changePreferences(current => {
      if (current.internetStations.length >= 200 && !current.internetStations.some(row => row.id === id)) throw new Error('You can save up to 200 radio presets.');
      return { next: { ...current, internetStations: current.internetStations.some(row => row.id === id) ? current.internetStations.map(row => row.id === id ? station : row) : [...current.internetStations,station] }, result: undefined };
    });
    this.options.onChange?.(); return station;
  }
  async removeInternetStation(id: string) {
    await this.changePreferences(current => ({ next: { ...current, selected: current.selected === id ? 'all' : current.selected, internetStations: current.internetStations.filter(row => row.id !== id) }, result: undefined }));
    this.options.onChange?.();
  }
  tracksFor(id = this.selected): DesktopTrack[] {
    const playlist = this.playlists.find(p => p.id === id && !p.deletedAt);
    if (playlist) return playlist.trackIds.map(trackId => this.tracks.find(track => track.id === trackId)).filter((track): track is DesktopTrack => !!track);
    if (id !== 'all') return this.tracks.filter(track => track.stationId === id);
    const distinct = new Map<string, DesktopTrack>();
    for (const track of this.tracks) {
      const videoId = /\[([A-Za-z0-9_-]{11})\]\.mp3$/i.exec(track.filename)?.[1];
      const localId = /\[local-([a-f0-9]{12})\]\.mp3$/i.exec(track.filename)?.[1];
      distinct.set(videoId ? `yt:${videoId}` : localId ? `local:${localId}` : track.id, track);
    }
    return [...distinct.values()];
  }
  view(): DesktopLibrary {
    return {
      selected: this.selected, musicDir: this.options.musicDir, downloadsDir: this.downloadsDir, error: this.error,
      stations: [{ id: 'all', name: 'All music', genre: 'All genres', count: this.tracksFor('all').length },
        ...this.routes.map(route => ({ id: route.stationId, name: this.stationName(route.stationId), genre: route.genre, count: this.tracksFor(route.stationId).length }))],
      playlists: this.playlists.map(p => ({ ...p, count: p.trackIds.filter(id => this.files.has(id)).length })),
      internetStations: [...this.internetStations], tracks: this.tracksFor(), allTracks: [...this.tracks],
    };
  }
  async path(id: string): Promise<string> {
    const file = this.files.get(id);
    if (!file) throw new Error('Song is not in this library');
    const unavailable = () => new Error('This song is no longer available or could not be read. Restore or add the file again, then choose Refresh library.');
    const inspect = async (candidate: string) => {
      const info = await lstat(candidate);
      const physical = await realpath(candidate);
      const root = await realpath(this.root);
      if (!info.isFile() || info.isSymbolicLink() || !physical.startsWith(root + sep)) throw unavailable();
      return { physical, stamp: `${info.size}:${info.mtimeMs}` };
    };
    let current: Awaited<ReturnType<typeof inspect>> | undefined;
    try { current = await inspect(file); } catch { /* a refresh removes missing/unsafe entries */ }
    if (current && this.cache[relative(this.root, file)]?.stamp === current.stamp) return current.physical;

    // Reuse the scanner's cache and validation policy. Unchanged tracks incur
    // no probe; a changed or missing file is reconciled before playback or a
    // source change can act on its stale index row.
    try { await this.scan(); }
    catch (error) {
      if (['EACCES', 'EPERM', 'ENOSPC', 'EIO'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
      throw unavailable();
    }
    const refreshed = this.files.get(id);
    if (!refreshed) throw unavailable();
    try { current = await inspect(refreshed); } catch { throw unavailable(); }
    if (this.cache[relative(this.root, refreshed)]?.stamp !== current.stamp) {
      throw new Error('This song changed while Subwave was reading it. Choose Refresh library, then try playing it again.');
    }
    return current.physical;
  }
  track(id: string) { return this.tracks.find(track => track.id === id); }
  async createPlaylist(name: string) {
    const playlist: DesktopPlaylist = { id: `pl-${randomUUID().slice(0, 8)}`, name, trackIds: [], count: 0, deletedAt: null };
    await this.changePreferences(current => {
      if (current.playlists.length >= 200) throw new Error('You have reached 200 playlists. Reuse an existing playlist.');
      return { next: { ...current, playlists: [...current.playlists, playlist] }, result: undefined };
    });
    this.options.onChange?.(); return playlist;
  }
  async editPlaylist(id: string, value: unknown) {
    const parsed = desktopPlaylistEditSchema.parse(value);
    const playlist = await this.changePreferences(current => {
      const previous = current.playlists.find(p => p.id === id && !p.deletedAt);
      if (!previous) throw new Error('Playlist not found');
      if (new Set(parsed.trackIds).size !== parsed.trackIds.length) throw new Error('Each song can appear once in a playlist');
      const allowed = new Set([...this.files.keys(), ...previous.trackIds]);
      if (parsed.trackIds.some(track => !allowed.has(track))) throw new Error('Add a song from your library first');
      const next = { ...previous, ...parsed };
      return { next: { ...current, playlists: current.playlists.map(row => row.id === id ? next : row) }, result: next };
    });
    this.options.onChange?.(); return playlist;
  }
  async trashPlaylist(id: string, restore = false) {
    await this.changePreferences(current => {
      if (!current.playlists.some(p => p.id === id)) throw new Error('Playlist not found');
      return { next: { ...current, selected: current.selected === id && !restore ? 'all' : current.selected,
        playlists: current.playlists.map(row => row.id === id ? { ...row, deletedAt: restore ? null : new Date().toISOString() } : row) }, result: undefined };
    });
    this.options.onChange?.();
  }
  scan(): Promise<void> {
    this.scanChain = this.scanChain.catch(() => {}).then(() => this.scanFiles());
    return this.scanChain;
  }
  private async scanFiles() {
    const tracks: DesktopTrack[] = [];
    const files = new Map<string, string>();
    const cache: Record<string, CachedTrack> = {};
    let unreadable = 0;
    for (const route of this.routes) {
      const folder = await youtubeLibraryFolder(this.root, route.folder);
      const pending = [{ path: folder, depth: 0 }];
      while (pending.length && tracks.length < 5000) {
        const current = pending.shift()!;
        for (const entry of await readdir(current.path, { withFileTypes: true })) {
          if (tracks.length >= 5000) break;
          if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
          const file = join(current.path, entry.name);
          if (entry.isDirectory() && current.depth < 6) { pending.push({ path: file, depth: current.depth + 1 }); continue; }
          if (!entry.isFile() || !/\.mp3$/i.test(entry.name)) continue;
          try {
            const info = await lstat(file);
            if (!info.isFile() || info.isSymbolicLink()) throw new Error('Not an ordinary MP3 file');
            const key = relative(this.root, file);
            const stamp = `${info.size}:${info.mtimeMs}`;
            const old = this.cache[key];
            let track: DesktopTrack;
            if (old?.stamp === stamp && desktopTrackSchema.safeParse(old.track).success && old.track.stationId === route.stationId) track = old.track;
            else {
              const output = JSON.parse(await this.options.run(this.options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-f', 'mp3', '-show_entries', 'format=duration:format_tags=title,artist,genre', '-of', 'json', file], { timeoutMs: 15_000 }));
              const duration = Number(output.format?.duration);
              if (!Number.isFinite(duration) || duration <= 0) throw new Error('No audio duration');
              // Vorbis/RIFF commonly preserve uppercase tag keys; MP3 keys
              // are lowercase. Normalize names before reading across formats.
              const tags = Object.fromEntries(Object.entries(output.format?.tags || {}).map(([name, value]) => [name.toLowerCase(), value]));
              const text = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : fallback;
              track = { id: createHash('sha256').update(key).digest('hex').slice(0, 32), stationId: route.stationId,
                title: text(tags.title, basename(file, '.mp3')), artist: text(tags.artist, 'Unknown artist'), genre: route.stationId === 'local-files' ? text(tags.genre, 'Local files') : route.genre, duration, filename: entry.name };
            }
            tracks.push(track); files.set(track.id, file); cache[key] = { stamp, track };
          } catch { unreadable++; }
        }
      }
    }
    tracks.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    this.tracks = tracks; this.files = files; this.cache = cache;
    this.error = unreadable ? `${unreadable} audio file${unreadable === 1 ? ' could' : 's could'} not be read. Your other songs are available.` : null;
    await this.saveCache(JSON.stringify(cache));
    await this.remember(); this.options.onChange?.();
  }
}
