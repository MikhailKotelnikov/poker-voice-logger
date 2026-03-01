const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherApi', {
  getState: () => ipcRenderer.invoke('launcher:get-state'),
  chooseFolder: () => ipcRenderer.invoke('launcher:choose-folder'),
  saveConfig: (payload) => ipcRenderer.invoke('launcher:save-config', payload),
  openWeb: () => ipcRenderer.invoke('launcher:open-web'),
  openFolder: (folderPath) => ipcRenderer.invoke('launcher:open-folder', folderPath),
  onState: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, state) => handler(state);
    ipcRenderer.on('launcher:state', listener);
    return () => ipcRenderer.removeListener('launcher:state', listener);
  }
});
