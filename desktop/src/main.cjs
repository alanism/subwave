'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess } = require('electron');
const { createServer } = require('node:net');
const { appendFileSync, existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { ConfigStore, stationUrl, SKINS } = require('./config.cjs');
const { startGateway } = require('./gateway.cjs');
const { LocalService } = require('./local-service.cjs');

app.setName('Subwave');
if (process.env.SUBWAVE_DESKTOP_DATA_DIR) app.setPath('userData', process.env.SUBWAVE_DESKTOP_DATA_DIR);
const dataDir = app.getPath('userData');
mkdirSync(dataDir, { recursive: true });
const logPath = join(dataDir, 'desktop.log');
function log(event, detail = '') {
  try { appendFileSync(logPath, `${new Date().toISOString()} ${event} ${detail}\n`); } catch { /* do not prevent playback */ }
}
const config = new ConfigStore(join(dataDir, 'preferences.json'));
const panels = new Set(['youtube', 'library', 'stations', 'settings']);
const panelFromArgs = args => args.includes('--settings') ? 'settings' : args.includes('--youtube') ? 'youtube' : args.includes('--library') ? 'library' : args.includes('--stations') ? 'stations' : null;
let currentPanel = panelFromArgs(process.argv);
let player, runtime, gateway, local, musicDir, openingFiles, quitting = false, shutdownStarted = false;
let remoteStation = '', apiOverride;
const preload = join(__dirname, 'preload.cjs');
const asset = name => join(__dirname, '../assets', name);

function trusted(event) {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame || event.sender !== player?.webContents || !gateway) return false;
  try { return new URL(frame.url).origin === gateway.origin; } catch { return false; }
}
function openExternal(value) {
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) void shell.openExternal(url.href);
  } catch { /* not a navigable external URL */ }
}
function guardWindow(window, allowed) {
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => {
    if (!allowed(url)) { event.preventDefault(); openExternal(url); }
  });
  window.webContents.on('will-redirect', (event, url) => { if (!allowed(url)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.on('render-process-gone', (_event, details) => log('renderer-exited', details.reason));
  window.webContents.on('preload-error', (_event, _path, error) => log('preload-error', error.message));
  window.webContents.on('did-fail-load', (_event, code) => log('page-load-failed', String(code)));
}
function showPlayer() {
  if (!player || player.isDestroyed()) return;
  if (player.isMinimized()) player.restore();
  player.show(); player.focus();
}
function showPanel(panel = null) {
  if (panel !== null && !panels.has(panel)) return;
  currentPanel = panel; showPlayer(); player?.webContents.send('player:panel', panel);
}
function playerCommand(command) {
  showPlayer(); player?.webContents.send('player:command', command);
}
function selectSkin(skin) {
  if (!SKINS.includes(skin)) return;
  void config.save({ skin }).catch(error => log('preferences-error', error.message));
  showPlayer(); player?.webContents.send('player:set-skin', skin); buildMenu();
}
async function openFiles(stationId) {
  if (stationId !== undefined && (typeof stationId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(stationId))) throw new Error('Choose a local genre station.');
  if (!local) throw new Error('Local audio import is unavailable for this connection.');
  if (openingFiles) throw new Error('An audio import is already open.');
  openingFiles = (async () => {
    const options = { title: 'Open audio files', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio files', extensions: ['mp3', 'flac', 'wav', 'm4a', 'ogg', 'opus', 'aac'] }] };
    const picked = player ? await dialog.showOpenDialog(player, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths.length) return { cancelled: true, imported: 0, errors: [] };
    if (picked.filePaths.length > 50) throw new Error('Open up to 50 audio files at a time.');
    const result = await local.importFiles(picked.filePaths, stationId);
    const imported = Number.isInteger(result?.added) && result.added >= 0 && result.added <= 50 ? result.added : 0;
    const errors = Array.isArray(result?.errors) ? result.errors.filter(value => typeof value === 'string').slice(0, 50) : [];
    log('local-files-imported', String(imported)); return { cancelled: false, imported, errors };
  })();
  try { return await openingFiles; } finally { openingFiles = null; }
}
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Player', submenu: [
      { label: 'Show player', accelerator: 'CommandOrControl+1', click: () => showPanel(null) },
      { label: 'Open audio files…', accelerator: 'CommandOrControl+O', enabled: !!local, click: () => {
        showPanel('library');
        playerCommand('open-files');
      } },
      { type: 'separator' },
      { label: 'Play / Stop', accelerator: 'CommandOrControl+Space', enabled: !!local, click: () => playerCommand('toggle-playback') },
      { label: 'Next track', accelerator: 'CommandOrControl+Right', enabled: !!local, click: () => playerCommand('next') },
      { label: 'Mute / Unmute', accelerator: 'CommandOrControl+M', enabled: !!local, click: () => playerCommand('toggle-mute') },
      { type: 'separator' },
      { label: 'Library', accelerator: 'CommandOrControl+L', click: () => showPanel('library') },
      { label: 'New playlist…', accelerator: 'CommandOrControl+N', enabled: !!local, click: () => playerCommand('new-playlist') },
      { label: 'Genre stations', accelerator: 'CommandOrControl+G', click: () => showPanel('stations') },
      { label: 'YouTube downloads', accelerator: 'CommandOrControl+J', click: () => showPanel('youtube') },
      { label: 'Settings', accelerator: 'CommandOrControl+,', click: () => showPanel('settings') },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
    ] },
    { label: 'Skin', submenu: [
      { label: 'Original', type: 'radio', checked: config.value.skin === 'classic', accelerator: 'CommandOrControl+Shift+1', click: () => selectSkin('classic') },
      { label: 'Enochian', type: 'radio', checked: config.value.skin === 'enochian', accelerator: 'CommandOrControl+Shift+2', click: () => selectSkin('enochian') },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [
      { label: 'Open music folder', enabled: !!local, click: () => { void shell.openPath(musicDir); } },
      { label: 'Open desktop logs', click: () => { void shell.openPath(logPath); } },
      { label: 'About Subwave', click: () => dialog.showMessageBox(player, { type: 'info', title: 'Subwave', message: 'Subwave for Linux',
        detail: `Desktop ${app.getVersion()}\nOriginal + Enochian\n\nYour local music, genre stations and YouTube downloads start with the player.\nYour Enochian controls run from their original source code.` }) },
    ] },
  ]));
}
function registerIpc() {
  ipcMain.handle('player:skin', event => { if (!trusted(event)) throw new Error('Unavailable'); return config.value.skin; });
  ipcMain.on('player:skin-changed', (event, skin) => {
    if (!trusted(event) || !SKINS.includes(skin)) return;
    log('skin-ready', skin);
    if (config.value.skin === skin) return;
    void config.save({ skin }).catch(error => log('preferences-error', error.message)); buildMenu();
  });
  ipcMain.handle('player:initial-panel', event => { if (!trusted(event)) throw new Error('Unavailable'); return currentPanel; });
  ipcMain.handle('player:open-files', (event, stationId) => { if (!trusted(event)) throw new Error('Unavailable'); return openFiles(stationId); });
  ipcMain.handle('player:open-music-folder', async event => {
    if (!trusted(event) || !local) throw new Error('Unavailable');
    const error = await shell.openPath(musicDir); if (error) throw new Error(error);
  });
}
async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve)); return port;
}
async function startWeb() {
  const webRoot = app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '../runtime/web');
  if (!existsSync(join(webRoot, 'server.js'))) throw new Error('The desktop interface is missing. Build the desktop package first.');
  const port = await freePort(), station = remoteStation || local?.origin;
  const env = { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), SUBWAVE_WEB_ROOT: webRoot,
    NEXT_TELEMETRY_DISABLED: '1', CONTROLLER_INTERNAL_URL: apiOverride || `${station}/api` };
  delete env.NODE_OPTIONS; delete env.ELECTRON_RUN_AS_NODE;
  runtime = utilityProcess.fork(join(__dirname, 'web-runtime.cjs'), [], { env, cwd: webRoot, stdio: 'pipe', serviceName: 'Subwave interface' });
  let exited = false;
  runtime.stdout?.on('data', chunk => log('web', String(chunk).trim()));
  runtime.stderr?.on('data', chunk => log('web-error', String(chunk).trim()));
  runtime.on('error', (type, location) => log('web-process-error', `${type} ${location || ''}`));
  runtime.once('exit', code => {
    exited = true; log('web-exited', String(code));
    if (!quitting && !shutdownStarted && player) { dialog.showErrorBox('Subwave stopped', 'The desktop interface stopped. Close and reopen Subwave. Your saved music is unchanged.'); app.quit(); }
  });
  const origin = `http://127.0.0.1:${port}`, deadline = Date.now() + 45_000;
  while (Date.now() < deadline && !shutdownStarted) {
    if (exited) throw new Error('The desktop interface could not start. See desktop.log.');
    try { if ((await fetch(`${origin}/manifest.webmanifest`, { signal: AbortSignal.timeout(1000) })).ok) return origin; }
    catch { /* server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('The desktop interface took too long to start. See desktop.log.');
}
async function boot() {
  await config.load();
  // Explicit QA overrides apply only to this launch. Old stored connection
  // preferences never block normal local startup.
  if (process.env.SUBWAVE_DESKTOP_STATION_URL) remoteStation = stationUrl(process.env.SUBWAVE_DESKTOP_STATION_URL);
  if (process.env.SUBWAVE_DESKTOP_API_URL) {
    apiOverride = stationUrl(process.env.SUBWAVE_DESKTOP_API_URL);
    if (!remoteStation) remoteStation = new URL(apiOverride).origin;
  }
  musicDir = join(app.getPath('music'), 'Subwave');
  if (!remoteStation) {
    local = new LocalService({ utilityProcess, serviceRoot: app.isPackaged ? join(process.resourcesPath, 'service') : join(__dirname, '../runtime/service'),
      stateDir: join(dataDir, 'local-station'), musicDir, executable: process.execPath, iconPath: asset('icon.png'), log,
      onImportProgress: progress => { if (player && !player.isDestroyed()) player.webContents.send('player:import-progress', progress); },
      onFatal: error => { if (!shutdownStarted) { dialog.showErrorBox('Local station stopped', error.message); app.quit(); } } });
    await local.start();
  }
  if (shutdownStarted) return;
  const web = await startWeb(); if (shutdownStarted) return;
  gateway = await startGateway({ port: config.value.port, getStation: () => remoteStation || local?.origin || '',
    getLocal: () => local?.endpoint(), web, apiOverride, localThemes: require('../assets/themes.json') });
  await config.save({ port: gateway.port }); registerIpc();
  player = new BrowserWindow({ title: 'Subwave', ...config.value.bounds, minWidth: 800, minHeight: 620, show: false,
    backgroundColor: '#f3eee4', icon: asset('icon.png'),
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, webSecurity: true } });
  guardWindow(player, url => { try { return new URL(url).origin === gateway.origin; } catch { return false; } });
  if (process.env.SUBWAVE_DESKTOP_DATA_DIR) player.on('page-title-updated', event => { event.preventDefault(); player.setTitle('Subwave — Test library'); });
  player.webContents.session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save MP3', defaultPath: join(app.getPath('music'), item.getFilename()), filters: [{ name: 'MP3 audio', extensions: ['mp3'] }] });
  });
  player.on('close', () => {
    if (!player.isMaximized() && !player.isFullScreen()) void config.save({ bounds: { width: player.getBounds().width, height: player.getBounds().height } }).catch(error => log('preferences-error', error.message));
  });
  player.on('closed', () => { player = null; });
  player.once('ready-to-show', () => { player.show(); log('window-ready', gateway.origin); });
  player.webContents.on('did-finish-load', () => log('page-loaded', new URL(player.webContents.getURL()).pathname));
  buildMenu(); await player.loadURL(`${gateway.origin}/listen`); log('player-started', gateway.origin);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, args) => { const panel = panelFromArgs(args); if (panel) showPanel(panel); else showPlayer(); });
  app.whenReady().then(boot).catch(error => { if (!shutdownStarted) { log('startup-failed', error.message); dialog.showErrorBox('Could not open Subwave', error.message); app.quit(); } });
}
app.on('login', (event, _contents, _details, _authInfo, callback) => { event.preventDefault(); callback(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); if (shutdownStarted) return; shutdownStarted = true;
  void (async () => {
    try {
      if (player && !player.isDestroyed() && !player.isMaximized() && !player.isFullScreen()) {
        const { width, height } = player.getBounds(); await config.save({ bounds: { width, height } }).catch(() => {});
      }
      await config.pending.catch(() => {}); await gateway?.close(); await local?.close();
      if (runtime) {
        const stopped = new Promise(resolve => runtime.once('exit', resolve)); runtime.kill();
        await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 1500))]);
      }
    } catch (error) { log('shutdown-error', error.message); }
    finally { quitting = true; log('player-stopped'); app.quit(); }
  })();
});
process.on('SIGTERM', () => app.quit());
process.on('SIGINT', () => app.quit());
