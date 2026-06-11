/**
 * Electron Preload Script
 * Safely bridges renderer (React app) with main process IPC calls
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // MPV Native Player
  mpvPlay: (options) => ipcRenderer.invoke('mpv:play', options),
  mpvStop: () => ipcRenderer.invoke('mpv:stop'),
  mpvCheck: () => ipcRenderer.invoke('mpv:check'),
  showMpvMissing: () => ipcRenderer.invoke('dialog:showMpvMissing'),

  // Shell utilities
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Platform info
  platform: process.platform,
  isElectron: true,
});
