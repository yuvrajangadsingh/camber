const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('camber', {
  send: (name, ...args) => ipcRenderer.send('cmd', name, ...args),
  onState: (fn) => ipcRenderer.on('state', (_, s) => fn(s)),
})
