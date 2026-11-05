import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ServerResponse } from 'node:http';
import type { LocalLibrary } from './library.js';
import { openAudioStream, openPublicRadio, icyAudio, type OpenRadio } from './internet-radio.js';
import type { DesktopTrack } from '../../controller/src/schemas/desktop-local.js';

type Options = { ffmpeg: string; onSpawn: (pid: number) => void; onExit: (pid: number) => void; openRadio?: OpenRadio };
export class LocalRadio {
  private clients = new Set<ServerResponse>();
  private process: ChildProcessWithoutNullStreams | null = null;
  private generation = 0;
  private starting: number | null = null;
  private cursor = 0;
  private requested: string[] = [];
  private burst: Buffer[] = [];
  private burstBytes = 0;
  private stopTimer?: ReturnType<typeof setTimeout>;
  private advanceTimer?: ReturnType<typeof setTimeout>;
  private closing = false;
  private remoteAbort: AbortController | null = null;
  private remoteFailures = 0;
  current: DesktopTrack | null = null;
  startedAt: string | null = null;
  history: Array<DesktopTrack & { startedAt: string; endedAt: string }> = [];
  error: string | null = null;
  constructor(private library: LocalLibrary, private options: Options) {}
  get listeners() { return this.clients.size; }
  get online() { return !!this.library.internetStation() || this.library.tracksFor().length > 0; }
  upcoming() {
    const tracks = this.library.tracksFor();
    if (!tracks.length) return [];
    return Array.from({ length: Math.min(8, tracks.length) }, (_, i) => tracks[(this.cursor + i) % tracks.length]!);
  }
  attach(res: ServerResponse) {
    if (!this.online) { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'This genre station has no songs yet. Add an MP3 from YouTube.' })); return; }
    if (this.clients.size >= 8) { res.writeHead(429); res.end(); return; }
    clearTimeout(this.stopTimer);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.flushHeaders();
    for (const chunk of this.burst) res.write(chunk);
    this.clients.add(res);
    res.once('close', () => {
      this.clients.delete(res);
      if (!this.clients.size) this.stopTimer = setTimeout(() => { if (!this.clients.size) this.stopTrack(); }, 1000);
    });
    if (!this.process) void this.next();
  }
  async select(id: string) {
    await this.library.select(id);
    this.cursor = 0; this.requested = []; this.error = null; this.remoteFailures = 0;
    this.stopTrack();
    if (!this.online) { for (const client of this.clients) client.end(); this.clients.clear(); }
    else if (this.clients.size) await this.next();
  }
  async request(id: string) {
    let track = this.library.track(id);
    if (!track) throw new Error('Song not found');
    // Validate the file before persisting a different source, moving the
    // cursor, or stopping the encoder that the listener is currently hearing.
    await this.library.path(id);
    track = this.library.track(id);
    if (!track) throw new Error('This song is no longer available. Restore or add it again, then choose Refresh library.');
    if (!this.library.tracksFor().some(row => row.id === id)) await this.select(track.stationId);
    const index = this.library.tracksFor().findIndex(row => row.id === id);
    if (index >= 0) this.cursor = index + 1;
    // Play/Next chooses what should start now; it is not an Add-to-queue
    // operation. Replace any choice made before a listener connected.
    this.requested = [id];
    this.stopTrack();
    if (this.clients.size) await this.next();
    return track;
  }
  private stopTrack() {
    this.generation++;
    this.remoteAbort?.abort(); this.remoteAbort = null;
    clearTimeout(this.advanceTimer); this.advanceTimer = undefined;
    this.starting = null;
    const child = this.process; this.process = null;
    if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already stopped */ } }
    if (this.current && this.startedAt) {
      this.history.unshift({ ...this.current, startedAt: this.startedAt, endedAt: new Date().toISOString() });
      this.history = this.history.slice(0, 50);
    }
    this.current = null; this.startedAt = null; this.burst = []; this.burstBytes = 0;
  }
  private advanceAfter(generation: number, delay: number) {
    this.starting = generation;
    this.advanceTimer = setTimeout(() => {
      if (generation !== this.generation) return;
      this.stopTrack();
      if (!this.closing && this.clients.size) void this.next();
    }, delay);
  }
  private async next() {
    if (this.closing || !this.clients.size || this.process || this.starting !== null) return;
    if (this.library.internetStation()) { await this.nextInternet(); return; }
    const tracks = this.library.tracksFor();
    if (!tracks.length) return;
    const requested = this.requested.shift();
    const track = (requested && this.library.track(requested)) || tracks[this.cursor++ % tracks.length]!;
    const generation = ++this.generation;
    this.starting = generation;
    try {
      const file = await this.library.path(track.id);
      if (generation !== this.generation || this.closing || !this.clients.size) return;
      const verifiedTrack = this.library.track(track.id);
      if (!verifiedTrack) throw new Error('This song is no longer available. Choose Refresh library, then play another song.');
      // Bound FFmpeg's initial read-ahead. The emitted CBR audio clock below
      // also accounts for encoder padding and early process completion.
      const child = spawn(this.options.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-re', '-readrate_initial_burst', '0', '-protocol_whitelist', 'file,pipe', '-f', 'mp3', '-i', file,
        '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', '-write_xing', '0', '-id3v2_version', '0', '-flush_packets', '1', '-f', 'mp3', 'pipe:1'],
      { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.process = child; this.current = verifiedTrack; this.startedAt = null; this.error = null;
      child.once('spawn', () => { if (child.pid) this.options.onSpawn(child.pid); });
      let error = '', outputBytes = 0, outputStarted = 0;
      child.stderr.on('data', chunk => { error = (error + String(chunk)).slice(-1500); });
      child.stdout.on('data', (chunk: Buffer) => {
        if (generation !== this.generation) return;
        if (!outputBytes) { outputStarted = performance.now(); this.startedAt = new Date().toISOString(); }
        outputBytes += chunk.length;
        this.burst.push(chunk); this.burstBytes += chunk.length;
        while (this.burstBytes > 12_000 && this.burst.length > 1) this.burstBytes -= this.burst.shift()!.length;
        for (const client of this.clients) {
          if (client.writableLength > 256_000) client.destroy();
          else client.write(chunk);
        }
      });
      child.once('error', err => { this.error = err.message; });
      child.once('close', code => {
        if (child.pid) this.options.onExit(child.pid);
        if (generation !== this.generation) return;
        const failed = code !== 0 || !outputBytes;
        if (failed && !this.closing) this.error = error || 'Could not play this MP3';
        this.process = null;
        if (failed || this.closing || !this.clients.size) this.stopTrack();
        if (!this.closing && this.clients.size) {
          // This output is always 192 kbps CBR with no ID3/Xing headers. A
          // fresh -re child can finish before all its audio has played. Keep
          // this track/current clock until its actual encoded duration ends;
          // otherwise each repeat puts metadata farther ahead of the sound.
          const remaining = outputStarted + outputBytes / 24 - performance.now();
          this.advanceAfter(this.generation, failed ? 1500 : Math.max(0, remaining));
        }
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.stopTrack();
      if (!this.closing && this.clients.size) this.advanceAfter(this.generation, 1500);
    } finally { if (this.starting === generation) this.starting = null; }
  }
  private async nextInternet() {
    const station = this.library.internetStation();
    if (!station || this.closing || !this.clients.size) return;
    const generation = ++this.generation, abort = new AbortController();
    this.remoteAbort = abort; this.starting = generation;
    try {
      const source = await openAudioStream(station.url, abort.signal, this.options.openRadio || openPublicRadio);
      if (generation !== this.generation || this.closing || !this.clients.size) { source.destroy(); return; }
      const child = spawn(this.options.ffmpeg, ['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','pipe','-probesize','65536','-analyzeduration','1000000','-i','pipe:0',
        '-map','0:a:0','-vn','-ac','2','-ar','44100','-c:a','libmp3lame','-b:a','192k','-write_xing','0','-id3v2_version','0','-flush_packets','1','-f','mp3','pipe:1'],
        { detached:true, stdio:['pipe','pipe','pipe'] });
      this.process = child;
      this.current = { id:station.id, stationId:station.id, title:station.name, artist:[station.country,'Live internet radio'].filter(Boolean).join(' · '), genre:station.tags, duration:0, filename:'' };
      this.startedAt = null;
      child.once('spawn',()=>{if(child.pid)this.options.onSpawn(child.pid);});
      child.stdin.on('error',()=>{});
      let output = false;
      const deadline = setTimeout(()=>{if(!output && generation===this.generation){this.error='This station did not send playable audio. Retry or choose another station.';abort.abort();child.kill();}},15_000);
      source.once('error',()=>{if(generation===this.generation){this.error='The station connection was interrupted. Retrying…';child.stdin.destroy();child.kill();}});
      const interval = Number(source.headers['icy-metaint']);
      if (Number.isSafeInteger(interval) && interval>0 && interval<=16_777_216) source.pipe(icyAudio(interval,title=>{
        if(generation===this.generation && this.current)this.current={...this.current,title,artist:station.name};
      })).pipe(child.stdin); else source.pipe(child.stdin);
      child.stderr.on('data',()=>{});
      child.stdout.on('data',(chunk: Buffer)=>{
        if(generation!==this.generation)return;
        if(!output){output=true;clearTimeout(deadline);this.startedAt=new Date().toISOString();this.error=null;this.remoteFailures=0;}
        this.burst.push(chunk);this.burstBytes+=chunk.length;
        while(this.burstBytes>12_000 && this.burst.length>1)this.burstBytes-=this.burst.shift()!.length;
        for(const client of this.clients){if(client.writableLength>256_000)client.destroy();else client.write(chunk);}
      });
      child.once('error',()=>{if(generation===this.generation)this.error='The radio audio decoder could not start. Retry the station.';});
      child.once('close',()=>{
        clearTimeout(deadline);source.destroy();if(child.pid)this.options.onExit(child.pid);
        if(generation!==this.generation)return;
        this.error ||= 'The live station disconnected. Retrying…';
        this.process=null;this.stopTrack();
        if(!this.closing && this.clients.size)this.advanceAfter(this.generation,Math.min(30_000,5000*2**this.remoteFailures++));
      });
    } catch(error) {
      if(generation!==this.generation || this.closing)return;
      this.error=error instanceof Error?error.message:'This radio station could not be reached.';
      this.stopTrack();
      if(this.clients.size)this.advanceAfter(this.generation,Math.min(30_000,5000*2**this.remoteFailures++));
    } finally {if(this.starting===generation)this.starting=null;}
  }
  close() { this.closing = true; clearTimeout(this.stopTimer); this.stopTrack(); for (const res of this.clients) res.end(); this.clients.clear(); }
}
