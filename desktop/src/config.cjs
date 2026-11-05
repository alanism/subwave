'use strict';

const { mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const { dirname } = require('node:path');

const SKINS = ['classic', 'enochian'];
function stationUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('Enter the address of your Subwave station.');
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error('Use a complete address, such as http://localhost:7700.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTP or HTTPS station address without a password, query or fragment.');
  }
  url.pathname = url.pathname.replace(/\/(listen|admin)(\/.*)?$/, '').replace(/\/+$/, '');
  return url.href.replace(/\/$/, '');
}
function bounds(raw) {
  const n = (value, min, max, fallback) => Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  return { width: n(raw?.width, 800, 7680, 1280), height: n(raw?.height, 620, 4320, 860) };
}
class ConfigStore {
  constructor(file) {
    this.file = file;
    this.value = { stationUrl: '', skin: 'enochian', port: 17873, bounds: bounds(null) };
    this.pending = Promise.resolve();
  }
  async load() {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      this.value = {
        stationUrl: raw.stationUrl ? stationUrl(raw.stationUrl) : '',
        skin: SKINS.includes(raw.skin) ? raw.skin : 'enochian',
        port: Number.isInteger(raw.port) && raw.port >= 1024 && raw.port <= 65535 ? raw.port : 17873,
        bounds: bounds(raw.bounds),
      };
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('Desktop preferences could not be read; using defaults.');
    }
    return this.value;
  }
  save(patch) {
    this.value = { ...this.value, ...patch };
    const content = JSON.stringify(this.value, null, 2);
    const write = async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(`${this.file}.tmp`, content, { mode: 0o600 });
      await rename(`${this.file}.tmp`, this.file);
    };
    this.pending = this.pending.catch(() => {}).then(write);
    return this.pending;
  }
}
module.exports = { ConfigStore, stationUrl, SKINS, bounds };
