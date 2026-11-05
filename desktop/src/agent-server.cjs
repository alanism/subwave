'use strict';
const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { writeFile, rename, unlink, readFile } = require('node:fs/promises');
const { join } = require('node:path');

class AgentServer {
  constructor({ dataDir, tools, getLocal, importFiles, player }) {
    Object.assign(this, { tools, getLocal, importFiles, player });
    this.file = join(dataDir, 'agent-connection.json');
    this.token = randomBytes(32).toString('hex'); this.session = randomUUID();
  }
  async publish(origin) {
    this.origin = origin;
    const temporary = `${this.file}.${this.session}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, origin, token: this.token, pid: process.pid, session: this.session }), { mode: 0o600, flag: 'wx' });
    await rename(temporary, this.file);
  }
  async close() {
    try { if (JSON.parse(await readFile(this.file, 'utf8')).session === this.session) await unlink(this.file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  allowed(req, origin) {
    if (req.headers.origin && req.headers.origin !== origin) return false;
    if (req.headers.origin === origin && req.headers['sec-fetch-site'] === 'same-origin') return true;
    if (!req.headers.origin && req.headers['sec-fetch-site'] === 'same-origin') return true;
    const supplied = Buffer.from(String(req.headers.authorization || ''));
    const expected = Buffer.from(`Bearer ${this.token}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
  async api(method, path, body) {
    const local = this.getLocal();
    if (!local) throw new Error('The local station is unavailable. Open the local Subwave desktop player.');
    const response = await fetch(`${local.origin}/api${path}`, { method,
      headers: { Authorization: `Bearer ${local.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(180_000) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'The local station could not complete that action.');
    return value;
  }
  list() { return this.tools.listTools(); }
  async call(name, args) {
    return this.tools.callTool({ api: this.api.bind(this), player: this.player, importFiles: this.importFiles }, name, args);
  }
}
module.exports = { AgentServer };
