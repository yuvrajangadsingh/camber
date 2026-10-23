const { contextBridge, ipcRenderer } = require('electron')
const { injectBrowserAction } = require('electron-chrome-extensions/browser-action')

injectBrowserAction()

contextBridge.exposeInMainWorld('camber', {
  send: (name, ...args) => ipcRenderer.send('cmd', name, ...args),
  onState: (fn) => ipcRenderer.on('state', (_, s) => fn(s)),
  onPalette: (fn) => ipcRenderer.on('palette', (_, p) => fn(p)),
})
