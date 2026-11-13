// Chromium 156 gives extensions a `browser` object of its own, without what
// electron-chrome-extensions adds to `chrome`: whole APIs (windows) and functions of native
// ones (tabs.create, the tabs.query that knows camber's tabs). 1Password calls `browser`, so
// it crashed on start and then never opened its sign-in page. `browser` gets the APIs it
// lacks and the functions the library added or replaced, set on the native objects, which
// Chromium keeps writing runtime.lastError to. Events stay native (the library's can't
// hasListener), and so do storage and webRequest, where the library's are stand-ins
// (storage.sync is local storage). `browser` stays an ordinary, assignable global.
//
// Electron never fires runtime.onInstalled, where extensions set themselves up and open their
// first-run page (1Password's sign-in). A worker asks camber once whether its extension was just
// installed (main.js), and if so each of its onInstalled listeners hears { reason: 'install' }
// once, also one added later in that first run, since a module worker may get to addListener
// only after an await.
// Runs after the library's own preload, which electron-chrome-extensions registers first.
const { contextBridge, ipcRenderer } = require('electron')
if (process.type === 'service-worker' || location.href.startsWith('chrome-extension://')) {
  contextBridge.executeInMainWorld({
    func: () => {
      const b = globalThis.browser, c = globalThis.chrome
      if (location.protocol !== 'chrome-extension:') return
      const ev = c?.runtime?.onInstalled
      if (typeof ServiceWorkerGlobalScope !== 'undefined' && ev) {
        const add = ev.addListener.bind(ev), heard = [], told = new Set()
        let installed = false
        const tell = (fn) => setTimeout(() => { if (!told.has(fn) && ev.hasListener(fn)) { told.add(fn); fn({ reason: 'install' }) } })
        ev.addListener = (fn) => { add(fn); installed ? tell(fn) : heard.push(fn) }
        globalThis[Symbol.for('camber.installed')] = () => { installed = true; heard.forEach(tell) }
      }
      if (!b || b === c) return
      for (const k of Object.keys(c)) {
        if (!(k in b)) b[k] = c[k]
        else if (k !== 'storage' && k !== 'webRequest' && b[k] && c[k] && typeof c[k] === 'object') {
          // a native function is the same on both, so a different one is the library's
          for (const m of Object.keys(c[k])) if (typeof c[k][m] === 'function' && c[k][m] !== b[k][m]) b[k][m] = c[k][m]
        }
      }
    },
  })
}
if (process.type === 'service-worker') {
  ipcRenderer.invoke('camber-installed').then((fresh) => fresh && contextBridge.executeInMainWorld({ func: () => globalThis[Symbol.for('camber.installed')]?.() }))
}
