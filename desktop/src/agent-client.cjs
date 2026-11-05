'use strict';
const { open } = require('node:fs/promises');
const { constants } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

function connectionFile() {
  return process.env.SUBWAVE_AGENT_CONNECTION_FILE || join(process.env.SUBWAVE_DESKTOP_DATA_DIR
    || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Subwave'), 'agent-connection.json');
}
async function connection() {
  let handle;
  try {
    handle = await open(connectionFile(), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw new Error('The Subwave agent connection must be a private file owned by your user.');
    const value = JSON.parse(await handle.readFile('utf8'));
    const url = new URL(value.origin);
    if (value.version !== 1 || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)) throw new Error('Invalid local Subwave agent connection. Reopen Subwave.');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Subwave is closed. Open Subwave from Apps, then retry.');
    throw error;
  } finally { await handle?.close(); }
}
async function call(name, args = {}) {
  const value = await connection();
  let response;
  try {
    response = await fetch(`${value.origin}/api/agent/call`, { method: 'POST', headers: {
      Authorization: `Bearer ${value.token}`, 'Content-Type': 'application/json',
    }, body: JSON.stringify({ name, arguments: args }), signal: AbortSignal.timeout(190_000), redirect: 'error' });
  } catch { throw new Error('Subwave is unavailable. Open or reopen the desktop app, then retry.'); }
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'The Subwave agent action failed.');
  return result.result;
}
module.exports = { connectionFile, connection, call };
