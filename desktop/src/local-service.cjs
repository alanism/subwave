'use strict';

// The Electron parent owns the station and its detached media process groups.
// Persist only PID birth identities, never the private HTTP capability.
const { randomBytes, randomUUID } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, chmodSync } = require('node:fs');
const { join } = require('node:path');

function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  try {
    const root = `/proc/${pid}`;
    const value = readFileSync(`${root}/stat`, 'utf8');
    const fields = value.slice(value.lastIndexOf(')') + 2).split(' ');
    return { pid, started: fields[19], group: Number(fields[2]), state: fields[0], uid: statSync(root).uid };
  } catch { return null; }
}
function matchesProcess(record) {
  const actual = processIdentity(record?.pid);
  return actual && typeof record.started === 'string' && /^\d+$/.test(record.started)
    && actual.started === record.started && actual.uid === process.getuid?.() ? actual : null;
}
function killOwned(record, signal = 'SIGKILL', group = true) {
  const actual = matchesProcess(record);
  if (!actual) return;
  try { process.kill(group && actual.group === record.pid ? -record.pid : record.pid, signal); }
  catch { /* the verified process already exited */ }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

class LocalService {
  constructor({ utilityProcess, serviceRoot, stateDir, musicDir, executable, iconPath, log = () => {}, onFatal = () => {}, onImportProgress = () => {} }) {
    Object.assign(this, { utilityProcess, serviceRoot, stateDir, musicDir, executable, iconPath, log, onFatal, onImportProgress });
    this.origin = ''; this.token = ''; this.child = null; this.worker = null;
    this.groups = new Map(); this.requests = new Map(); this.failures = 0;
    this.stopping = false; this.restartTimer = null; this.startupTimer = null; this.stableTimer = null;
    this.recordPath = join(stateDir, 'owned-processes.json');
    this.exitCleanup = () => this.reap();
    process.once('exit', this.exitCleanup);
  }
  endpoint() { return this.origin ? { origin: this.origin, token: this.token } : null; }
  persist() {
    try {
      const value = { owner: processIdentity(process.pid), worker: this.worker, children: [...this.groups.values()] };
      writeFileSync(`${this.recordPath}.tmp`, JSON.stringify(value), { mode: 0o600 });
      renameSync(`${this.recordPath}.tmp`, this.recordPath);
    } catch (error) { this.log('station-owner-record', error.message); }
  }
  reap() {
    for (const record of this.groups.values()) killOwned(record);
    this.groups.clear();
    killOwned(this.worker, 'SIGKILL', false);
    this.worker = null; this.persist();
  }
  async recoverOwner() {
    let previous;
    try { previous = JSON.parse(readFileSync(this.recordPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') this.log('station-owner-record', 'Unreadable previous ownership record'); return; }
    const owner = matchesProcess(previous.owner);
    if (owner && owner.state !== 'Z' && owner.pid !== process.pid) throw new Error('This local station is already open in another Subwave process.');
    if (Array.isArray(previous.children)) for (const record of previous.children) killOwned(record);
    killOwned(previous.worker, 'SIGTERM', false);
    for (let i = 0; i < 20; i++) {
      const worker = matchesProcess(previous.worker);
      if (!worker || worker.state === 'Z') break;
      await sleep(50);
    }
    killOwned(previous.worker, 'SIGKILL', false);
    this.persist();
  }
  tool(name, override) {
    if (override) return override;
    const bundled = join(this.serviceRoot, 'bin', name);
    return existsSync(bundled) ? bundled : `/usr/bin/${name}`;
  }
  environment() {
    const shimDir = join(this.stateDir, 'runtime-bin');
    mkdirSync(shimDir, { recursive: true, mode: 0o700 });
    const shim = join(shimDir, 'node');
    writeFileSync(`${shim}.tmp`, `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec ${quote(this.executable)} "$@"\n`, { mode: 0o700 });
    chmodSync(`${shim}.tmp`, 0o700); renameSync(`${shim}.tmp`, shim);
    const owner = processIdentity(process.pid);
    if (!owner) throw new Error('Could not establish local station process ownership.');
    const env = { ...process.env, NODE_ENV: 'production', SUBWAVE_LOCAL_BOOT: '1',
      SUBWAVE_LOCAL_STATE: this.stateDir, SUBWAVE_MUSIC_DIR: this.musicDir, SUBWAVE_LOCAL_TOKEN: this.token,
      SUBWAVE_PARENT_PID: String(owner.pid), SUBWAVE_PARENT_STARTED: owner.started, SUBWAVE_LOCAL_ICON: this.iconPath,
      SUBWAVE_FFMPEG: this.tool('ffmpeg', process.env.SUBWAVE_FFMPEG),
      SUBWAVE_FFPROBE: this.tool('ffprobe', process.env.SUBWAVE_FFPROBE),
      SUBWAVE_YT_DLP: this.tool('yt-dlp', process.env.SUBWAVE_YT_DLP),
      PATH: `${shimDir}:${join(this.serviceRoot, 'bin')}:/usr/bin:/bin`,
    };
    delete env.NODE_OPTIONS; delete env.ELECTRON_RUN_AS_NODE;
    return env;
  }
  async start() {
    const entry = join(this.serviceRoot, 'station.cjs');
    if (!existsSync(entry)) throw new Error('The bundled local station is missing. Prepare the desktop service first.');
    mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    mkdirSync(this.musicDir, { recursive: true });
    await this.recoverOwner();
    if (this.stopping) throw new Error('Subwave is closing.');
    this.firstReady = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    this.launch();
    return this.firstReady;
  }
  launch() {
    if (this.stopping) return;
    this.token = randomBytes(32).toString('hex'); this.origin = '';
    let child;
    try {
      child = this.utilityProcess.fork(join(this.serviceRoot, 'station.cjs'), [], {
        env: this.environment(), cwd: this.serviceRoot, stdio: 'pipe', serviceName: 'Subwave local station',
      });
    } catch (error) { this.failed(error.message); return; }
    this.child = child;
    child.stdout?.on('data', value => this.log('station', String(value).trim()));
    child.stderr?.on('data', value => this.log('station-error', String(value).trim()));
    child.on('error', (type, location) => this.log('station-process-error', `${type} ${location || ''}`));
    child.once('spawn', () => {
      if (this.child !== child) return;
      this.worker = processIdentity(child.pid); this.persist();
    });
    this.startupTimer = setTimeout(() => {
      if (this.child !== child || this.origin) return;
      this.log('station-start-timeout'); this.reap(); child.kill();
    }, 180_000);
    child.on('message', message => {
      if (this.child !== child || !message || typeof message !== 'object') return;
      if (message.type === 'ready') {
        try {
          const url = new URL(message.origin);
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid station origin');
          this.origin = url.origin;
          clearTimeout(this.startupTimer); this.startupTimer = null;
          clearTimeout(this.stableTimer);
          this.stableTimer = setTimeout(() => { if (this.child === child) this.failures = 0; }, 30_000);
          this.stableTimer.unref?.();
          this.resolveReady?.(this.endpoint()); this.resolveReady = null; this.rejectReady = null;
          this.log('station-ready', this.origin);
        } catch (error) { this.log('station-protocol-error', error.message); this.reap(); child.kill(); }
      } else if (message.type === 'child-started' || message.type === 'process-started') {
        const actual = processIdentity(message.pid);
        if (actual && actual.uid === process.getuid?.() && actual.started === message.started && actual.group === actual.pid) {
          this.groups.set(actual.pid, actual); this.persist();
        }
      } else if (message.type === 'child-exited' || message.type === 'process-exited') {
        this.groups.delete(message.pid); this.persist();
      } else if (message.type === 'file-import-progress') {
        if (Number.isInteger(message.completed) && Number.isInteger(message.total) && message.total >= 0 && message.total <= 50 && message.completed >= 0 && message.completed <= message.total && typeof message.name === 'string') {
          this.onImportProgress({ completed: message.completed, total: message.total, name: message.name.slice(0, 300) });
        }
      } else if (message.type === 'reply' && this.requests.has(message.id)) {
        const request = this.requests.get(message.id); this.requests.delete(message.id); clearTimeout(request.timer);
        if (typeof message.error === 'string') request.reject(new Error(message.error.slice(0, 2000)));
        else request.resolve(message.result);
      } else if (message.type === 'failed') {
        this.log('station-start-failed', typeof message.error === 'string' ? message.error.slice(0, 2000) : 'Unknown station error');
      }
    });
    child.once('exit', code => {
      if (this.child !== child) return;
      clearTimeout(this.startupTimer); this.startupTimer = null; clearTimeout(this.stableTimer);
      this.origin = ''; this.child = null;
      this.reap();
      for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(new Error('The local station restarted. Open the files again.')); }
      this.requests.clear();
      this.log('station-exited', String(code));
      if (!this.stopping) this.failed('The local station stopped repeatedly. See desktop.log.');
    });
  }
  failed(message) {
    if (this.stopping) return;
    this.failures++;
    if (this.failures >= 5) {
      const error = new Error(message);
      if (this.rejectReady) { this.rejectReady(error); this.rejectReady = null; }
      else this.onFatal(error);
      return;
    }
    const delay = Math.min(15_000, 500 * 2 ** (this.failures - 1));
    this.log('station-restarting', `${delay}ms`);
    this.restartTimer = setTimeout(() => { this.restartTimer = null; this.launch(); }, delay);
  }
  importFiles(paths, stationId) {
    if (!this.child || !this.origin || this.stopping) return Promise.reject(new Error('The local station is starting. Try again in a moment.'));
    if (!Array.isArray(paths) || paths.length > 50 || paths.some(path => typeof path !== 'string')) return Promise.reject(new Error('Open up to 50 audio files at a time.'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.requests.delete(id); reject(new Error('Audio import took too long. Check your Library before retrying.')); }, Math.max(180_000, paths.length * 185_000));
      timer.unref?.(); this.requests.set(id, { resolve, reject, timer });
      try { this.child.postMessage({ type: 'import-files', id, paths, ...(stationId ? { stationId } : {}) }); }
      catch (error) { clearTimeout(timer); this.requests.delete(id); reject(error); }
    });
  }
  async close() {
    if (this.closePending) return this.closePending;
    this.stopping = true; this.origin = ''; clearTimeout(this.restartTimer); clearTimeout(this.startupTimer); clearTimeout(this.stableTimer);
    this.rejectReady?.(new Error('Subwave is closing.')); this.rejectReady = null;
    this.closePending = (async () => {
      const child = this.child;
      if (child) {
        const exited = new Promise(resolve => child.once('exit', resolve));
        try { child.postMessage({ type: 'shutdown' }); } catch { /* an exit may be in flight */ }
        await Promise.race([exited, sleep(5000)]);
        if (this.child === child) { this.reap(); child.kill(); await Promise.race([exited, sleep(1000)]); }
      }
      this.reap(); process.removeListener('exit', this.exitCleanup);
    })();
    return this.closePending;
  }
}

module.exports = { LocalService, processIdentity, matchesProcess, killOwned };
