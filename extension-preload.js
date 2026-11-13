// Chromium 156 gives extensions a `browser` object of its own, without what
// electron-chrome-extensions adds to `chrome`: whole APIs (windows) and functions of native
// ones (tabs.create, the tabs.query that knows camber's tabs). 1Password calls `browser`, so
// it crashed on start and then never opened its sign-in page. `browser` gets the APIs it
// lacks and the functions the library added or replaced, set on the native objects, which
// Chromium keeps writing runtime.lastError to. Events stay native (the library's can't
// hasListener), and so do storage and webRequest, where the library's are stand-ins
// (storage.sync is local storage). `browser` stays an ordinary, assignable global.
// Runs after the library's own preload, which electron-chrome-extensions registers first.
const { contextBridge } = require('electron')
if (process.type === 'service-worker' || location.href.startsWith('chrome-extension://')) {
  contextBridge.executeInMainWorld({
    func: () => {
      const b = globalThis.browser
      if (location.protocol !== 'chrome-extension:' || !b || b === globalThis.chrome) return
      const c = globalThis.chrome
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
