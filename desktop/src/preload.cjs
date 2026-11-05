'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const panels = ['youtube', 'library', 'stations', 'settings'];

// Narrow capabilities only: no arbitrary IPC, paths, commands or filesystem.
contextBridge.exposeInMainWorld('desktopPlayer', {
  skin: () => ipcRenderer.invoke('player:skin'),
  skinChanged: skin => { if (['classic', 'enochian'].includes(skin)) ipcRenderer.send('player:skin-changed', skin); },
  onSkin: callback => {
    const listener = (_event, skin) => { if (['classic', 'enochian'].includes(skin)) callback(skin); };
    ipcRenderer.on('player:set-skin', listener);
    return () => ipcRenderer.removeListener('player:set-skin', listener);
  },
  openFiles: stationId => {
    if (stationId !== undefined && (typeof stationId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(stationId))) return Promise.reject(new Error('Choose a local genre station.'));
    return ipcRenderer.invoke('player:open-files', stationId);
  },
  openMusicFolder: () => ipcRenderer.invoke('player:open-music-folder'),
  onImportProgress: callback => {
    const listener = (_event, value) => {
      if (value && Number.isInteger(value.completed) && Number.isInteger(value.total) && value.total <= 50 && value.completed >= 0 && value.completed <= value.total && typeof value.name === 'string') callback(value);
    };
    ipcRenderer.on('player:import-progress', listener);
    return () => ipcRenderer.removeListener('player:import-progress', listener);
  },
  initialPanel: () => ipcRenderer.invoke('player:initial-panel'),
  onCommand: callback => {
    const listener = (_event, command) => { if (['open-files', 'new-playlist', 'toggle-playback', 'next', 'toggle-mute'].includes(command)) callback(command); };
    ipcRenderer.on('player:command', listener);
    return () => ipcRenderer.removeListener('player:command', listener);
  },
  onPanel: callback => {
    const listener = (_event, panel) => { if (panel === null || panels.includes(panel)) callback(panel); };
    ipcRenderer.on('player:panel', listener);
    return () => ipcRenderer.removeListener('player:panel', listener);
  },
});
