'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { mkdtemp, readFile, stat, chmod, symlink } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { AgentServer } = require('../src/agent-server.cjs');
const { startGateway } = require('../src/gateway.cjs');
const tools = require('../src/agent-tools.cjs');
const client = require('../src/agent-client.cjs');

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'subwave-agent-'));
  const trackA = { id: 'a'.repeat(32), stationId: 'jazz', title: 'First song', artist: 'Alpha', genre: 'Jazz', duration: 4, filename: 'a.mp3' };
  const trackB = { id: 'b'.repeat(32), stationId: 'house', title: 'Second song', artist: 'Beta', genre: 'House', duration: 4, filename: 'b.mp3' };
  const library = { allTracks: [trackA, trackB], selected: 'jazz', playlists: [], error: null,
    stations: [{ id: 'all', name: 'All music', count: 2 }, { id: 'jazz', name: 'Jazz', count: 1 }, { id: 'house', name: 'House', count: 1 }, { id: 'rock', name: 'Rock', count: 0 }] };
  const calls = [], playerCalls = [];
  const worker = http.createServer((req, res) => {
    calls.push({ url: req.url, authorization: req.headers.authorization });
    assert.equal(req.headers.authorization, 'Bearer worker-private');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/local/library') res.end(JSON.stringify(library));
    else if (req.url === '/api/now-playing') res.end(JSON.stringify({ nowPlaying: trackA }));
    else res.end('{}');
  });
  await new Promise(resolve => worker.listen(0, '127.0.0.1', resolve));
  const workerOrigin = `http://127.0.0.1:${worker.address().port}`;
  const agent = new AgentServer({ dataDir: dir, tools, getLocal: () => ({ origin: workerOrigin, token: 'worker-private' }),
    player: async (action, args) => { playerCalls.push({ action, args }); return { playing: false, volume: 75 }; },
    importFiles: async (paths, stationId) => ({ added: paths.length, stationId, errors: [] }) });
  const gateway = await startGateway({ port: 0, getStation: () => workerOrigin, getLocal: () => ({ origin: workerOrigin, token: 'worker-private' }), web: workerOrigin, agent });
  await agent.publish(gateway.origin);
  t.after(async () => { await agent.close(); await gateway.close(); await new Promise(resolve => { worker.close(resolve); worker.closeAllConnections(); }); });
  const previous = process.env.SUBWAVE_AGENT_CONNECTION_FILE;
  process.env.SUBWAVE_AGENT_CONNECTION_FILE = agent.file;
  t.after(() => { if (previous === undefined) delete process.env.SUBWAVE_AGENT_CONNECTION_FILE; else process.env.SUBWAVE_AGENT_CONNECTION_FILE = previous; });
  return { dir, agent, gateway, calls, playerCalls, trackA, trackB };
}

test('agent discovery is private, rotates capabilities and does not remove a newer app session', async t => {
  const f = await fixture(t);
  assert.equal((await stat(f.agent.file)).mode & 0o777, 0o600);
  const first = JSON.parse(await readFile(f.agent.file, 'utf8'));
  assert.equal(first.token, f.agent.token);
  assert.notEqual(first.token, 'worker-private');
  const second = new AgentServer({ dataDir: f.dir, tools });
  await second.publish(f.gateway.origin);
  assert.notEqual(second.token, first.token);
  await f.agent.close();
  assert.equal(JSON.parse(await readFile(second.file, 'utf8')).session, second.session);
  await second.close();
  await assert.rejects(client.connection(), /Subwave is closed/);
});

test('HTTP tools reject cross-site, unauthenticated, invalid and unknown calls before acting', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.gateway.origin + '/api/agent/tools')).status, 401);
  assert.equal((await fetch(f.gateway.origin + '/api/agent/tools', { headers: { Authorization: 'Bearer forged' } })).status, 401);
  assert.equal((await fetch(f.gateway.origin + '/api/agent/tools', { headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin', Authorization: `Bearer ${f.agent.token}` } })).status, 403);
  const page = await fetch(f.gateway.origin + '/agent');
  assert.match(await page.text(), /Search YouTube/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const catalog = await (await fetch(f.gateway.origin + '/api/agent/tools', { headers: { Authorization: `Bearer ${f.agent.token}` } })).json();
  assert.equal(catalog.tools.length, 25);
  assert.ok(!catalog.tools.find(t => t.name === 'subwave_search_library').inputSchema.required?.includes('limit'));
  for (const [name, args] of [['subwave_shell', {}], ['subwave_play_track', { trackId: '../secret' }],
    ['subwave_set_volume', { volume: 101 }], ['subwave_stop', { command: 'whoami' }], ['subwave_import_files', { paths: ['relative.mp3'] }]]) {
    await assert.rejects(client.call(name, args));
  }
  assert.equal(f.calls.length, 0); assert.equal(f.playerCalls.length, 0);
  assert.equal((await fetch(f.gateway.origin + '/api/agent/tools', { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
});

test('local search preserves genre identity; transport commands use the native player adapter', async t => {
  const f = await fixture(t);
  assert.deepEqual((await client.call('subwave_search_library', { query: 'alpha', stationId: 'jazz' })).tracks, [f.trackA]);
  assert.equal((await client.call('subwave_search_library', { query: 'alpha', stationId: 'house' })).total, 0);
  await assert.rejects(client.call('subwave_search_library', { stationId: 'absent' }), /Unknown genre/);
  await assert.rejects(client.call('subwave_play_station', { sourceId: 'rock' }), /empty/);
  assert.equal(f.playerCalls.length, 0);
  const state = await client.call('subwave_status');
  assert.equal(state.trackCount, 2); assert.equal(state.playback.playing, false);
  await client.call('subwave_set_volume', { volume: 75 });
  assert.deepEqual(f.playerCalls.at(-1), { action: 'set-volume', args: { volume: 75 } });
  assert.deepEqual(await client.call('subwave_import_files', { paths: ['/tmp/audio.mp3'], stationId: 'jazz' }), { added: 1, stationId: 'jazz', errors: [] });
});

test('local client refuses shared connection files, symlinks and non-loopback discovery origins', async t => {
  const f = await fixture(t);
  await chmod(f.agent.file, 0o644);
  await assert.rejects(client.connection(), /private file/);
  await chmod(f.agent.file, 0o600);
  const link = join(f.dir, 'linked.json'); await symlink(f.agent.file, link);
  process.env.SUBWAVE_AGENT_CONNECTION_FILE = link;
  await assert.rejects(client.connection());
  process.env.SUBWAVE_AGENT_CONNECTION_FILE = f.agent.file;
  await f.agent.publish('https://external.example');
  await assert.rejects(client.connection(), /Invalid local/);
});

test('official MCP SDK client initializes, discovers and invokes the bundled stdio server', async t => {
  const f = await fixture(t);
  const { build } = require('esbuild');
  const entry = join(f.dir, 'agent.cjs');
  await build({ entryPoints: [resolve(__dirname, '../agent/index.ts')], outfile: entry, bundle: true, platform: 'node', format: 'cjs', target: 'node24', nodePaths: [resolve(__dirname, '../node_modules')], logLevel: 'silent' });
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, '--mcp'],
    env: { ...process.env, SUBWAVE_AGENT_CONNECTION_FILE: f.agent.file }, stderr: 'pipe' });
  const mcp = new Client({ name: 'subwave-protocol-test', version: '1' });
  await mcp.connect(transport); t.after(() => mcp.close());
  const catalog = await mcp.listTools(); assert.equal(catalog.tools.length, 25);
  const result = await mcp.callTool({ name: 'subwave_search_library', arguments: { query: 'Alpha' } });
  assert.equal(result.structuredContent.tracks[0].id, f.trackA.id);
  assert.equal(result.isError, undefined);
  const bad = await mcp.callTool({ name: 'subwave_set_volume', arguments: { volume: -1 } });
  assert.equal(bad.isError, true);
  await f.agent.close();
  const closed = await mcp.callTool({ name: 'subwave_status', arguments: {} });
  assert.equal(closed.isError, true); assert.match(closed.content[0].text, /Subwave is closed/);
});
