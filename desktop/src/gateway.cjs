'use strict';

// The renderer sees one stable loopback origin. Only the exact owned worker
// origin receives its private capability; remote QA traffic keeps its contract.
const http = require('node:http');
const https = require('node:https');

const streams = new Set(['/stream.mp3', '/stream.opus', '/stream.aac', '/stream.flac']);
function routeTarget(path, { station, apiOverride, web }) {
  const parsed = new URL(path, 'http://desktop.invalid');
  if (!path.startsWith('/') || path.startsWith('//') || /[\r\n\\]/.test(path)) throw new Error('Invalid request path');
  if (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')) {
    if (!station) return null;
    return new URL(`${(apiOverride || `${station}/api`).replace(/\/$/, '')}${parsed.pathname.slice(4)}${parsed.search}`);
  }
  if (streams.has(parsed.pathname)) return station ? new URL(`${station}${parsed.pathname}${parsed.search}`) : null;
  return new URL(`${web}${parsed.pathname}${parsed.search}`);
}
function workerHeaders(target, local) {
  return local && target.origin === local.origin && typeof local.token === 'string'
    ? { authorization: `Bearer ${local.token}` } : {};
}
function proxy(req, res, target, bundledInterface = false, local = null) {
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;
  // These describe the local renderer, not the station's HTTP origin.
  delete headers.origin;
  delete headers.referer;
  // Assignment replaces a forged renderer Authorization header. Never forward
  // this capability to the interface server or an explicitly remote station.
  Object.assign(headers, workerHeaders(target, local));
  const client = target.protocol === 'https:' ? https : http;
  const upstream = client.request(target, { method: req.method, headers }, reply => {
    const out = { ...reply.headers };
    delete out['access-control-allow-origin'];
    delete out['access-control-allow-credentials'];
    out['x-content-type-options'] = 'nosniff';
    out['referrer-policy'] = 'same-origin';
    if (bundledInterface) out['content-security-policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
    // Match the edge's deliberate audio/console exception; station-auth's
    // exact challenge semantics remain untouched.
    if (req.headers['x-subwave-console'] || req.headers['sec-fetch-dest'] === 'audio') delete out['www-authenticate'];
    res.writeHead(reply.statusCode || 502, out);
    reply.pipe(res);
    reply.on('error', () => res.destroy());
  });
  upstream.setTimeout(streams.has(target.pathname) ? 60_000 : 180_000, () => upstream.destroy(new Error('Station timed out')));
  upstream.on('error', () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'The station is temporarily unavailable. Please try again in a moment.' }));
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}
async function themesResponse(res, station, apiOverride, localThemes, local) {
  let remote = {};
  try {
    if (station) {
      const target = new URL(`${apiOverride || `${station}/api`}/themes`);
      const response = await fetch(target, { headers: workerHeaders(target, local), signal: AbortSignal.timeout(3000), redirect: 'error' });
      if (response.ok) remote = await response.json();
    }
  } catch { /* bundled palettes keep both skins usable while disconnected */ }
  const themes = new Map((Array.isArray(remote.themes) ? remote.themes : []).map(theme => [theme.id, theme]));
  for (const theme of localThemes) themes.set(theme.id, theme);
  const active = themes.has(remote.active) ? remote.active : 'enochian-ivory';
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ ...remote, themes: [...themes.values()], active }));
}
async function startGateway({ port, getStation, getLocal = () => null, apiOverride, web, localThemes = [] }) {
  let origin;
  const server = http.createServer((req, res) => {
    // Block DNS rebinding and cross-site access to the local station proxy.
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403); return res.end('Local player access only');
    }
    const station = getStation();
    const local = getLocal();
    if (req.url?.split('?')[0] === '/api/themes' && req.method === 'GET') {
      void themesResponse(res, station, apiOverride, localThemes, local).catch(() => { if (!res.headersSent) res.writeHead(502); res.end(); });
      return;
    }
    let target;
    try { target = routeTarget(req.url || '/', { station, apiOverride, web }); }
    catch { res.writeHead(400); return res.end(); }
    if (!target) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'The local station is starting. Please try again in a moment.' }));
    }
    proxy(req, res, target, target.origin === web, local);
  });
  const listen = value => new Promise((resolve, reject) => {
    const failed = error => { server.removeListener('listening', ready); reject(error); };
    const ready = () => { server.removeListener('error', failed); resolve(); };
    server.once('error', failed); server.once('listening', ready); server.listen(value, '127.0.0.1');
  });
  try { await listen(port); } catch (error) { if (error.code !== 'EADDRINUSE') throw error; await listen(0); }
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin, port: server.address().port, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
module.exports = { startGateway, routeTarget };
