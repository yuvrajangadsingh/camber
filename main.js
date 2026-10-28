const { app, BaseWindow, WebContentsView, Menu, dialog, ipcMain, session, nativeTheme, net } = require('electron')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')
const { installChromeWebStore } = require('electron-chrome-web-store')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const arc = require('./arc')
const tabs = require('./tabs')
const { nodes, detach } = tabs
const updates = require('./update')

const SIDEBAR = 248
const GAP = 8
const views = new Map() // tab id -> WebContentsView, only for tabs opened this run
let win, ui
let sidebarOpen = true
let paletteOpen = false

let state = {
  active: 0,
  spaces: [{ id: 's1', name: 'Space 1', color: '#5b6ee1', profile: 'default', activeId: null, pinned: [], today: [] }],
}
const COLORS = ['#5b6ee1', '#d9485f', '#2f9e77', '#e8890c', '#7b52c7', '#3d8fd1']

const uid = () => Math.random().toString(36).slice(2, 10)
const space = () => state.spaces[state.active]

// favorites belong to the profile, so every space on that profile sees them
const favoritesOf = (s) => state.favorites?.[s.profile] || []

function* tabsOf(s) {
  for (const it of nodes([...s.pinned, ...s.today, ...favoritesOf(s)])) if (!it.children) yield it
}

// the active space first, so a favorite shared by several spaces stays in the current one
function find(id) {
  for (const s of [space(), ...state.spaces].filter(Boolean)) for (const t of tabsOf(s)) if (t.id === id) return { s, t }
}

const statePath = () => path.join(app.getPath('userData'), 'state.json')

function load() {
  try {
    state = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return
    // keep the unreadable file for the user instead of overwriting it with defaults
    fs.renameSync(statePath(), statePath() + '.bad')
  }
}

function save() {
  const tmp = statePath() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, statePath())
}

// --demo: throwaway profile and a synthetic Arc file, safe to screen-record.
// Chromium keeps writing to the profile until exit, so old ones are cleared on the next start.
const DEMO = process.argv.includes('--demo')
if (DEMO) {
  for (const d of fs.readdirSync(os.tmpdir())) {
    if (d.startsWith('camber-demo-')) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true })
  }
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'camber-demo-')))
}

// CAMBER_ARC_FILE points the importer at a copy instead of Arc's live file
const arcPath = () => process.env.CAMBER_ARC_FILE ||
  (DEMO ? path.join(__dirname, 'demo', 'arc-demo.json')
    : arc.arcFile(process.platform, { appData: app.getPath('appData'), localAppData: process.env.LOCALAPPDATA }, fs.readdirSync))

// for a StorableSidebar.json copied over from another machine, e.g. a Mac to Linux
async function pickArcFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Arc sidebar', extensions: ['json'] }] })
  if (!canceled) importArc(filePaths[0])
}

function importArc(file = arcPath()) {
  if (!file) return pickArcFile()
  let spaces, favorites
  try {
    ({ spaces, favorites } = arc.convert(JSON.parse(fs.readFileSync(file, 'utf8')), uid))
  } catch (e) {
    dialog.showErrorBox('Import from Arc', `Could not read ${file}\n\n${e.message}`)
    return
  }
  state.importedArc = true
  // a fresh install's single starter space just gets in the way
  const [only] = state.spaces
  if (state.spaces.length === 1 && !only.pinned.length && only.today.length <= 1) {
    only.today.forEach((t) => dropView(t.id))
    state.spaces = []
  }
  arc.merge(state, { spaces, favorites }).forEach(dropView)
  showSpace(state.spaces.findIndex((s) => s.arcId === spaces[0]?.arcId))
}

// a newer release on GitHub, shown as a dismissible banner; never downloaded or installed
let update = null
async function checkUpdate() {
  update = await updates.check(app.getVersion(), net.fetch, process.env.CAMBER_UPDATE_URL || undefined)
  render()
}

let saveTimer
function render() {
  const file = arcPath()
  const offerArc = !state.importedArc && !!file && fs.existsSync(file)
  const wc = current()
  const nav = { back: !!wc?.navigationHistory.canGoBack(), forward: !!wc?.navigationHistory.canGoForward(), loading: !!wc?.isLoading() }
  const notice = update && state.dismissedUpdate !== update.version ? update : null
  ui.webContents.send('state', { state, sidebarOpen, offerArc, tabId: wc?.id, extensionsVersion, nav, platform: process.platform, update: notice })
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 500)
}

// macOS draws traffic lights over the sidebar; Windows and Linux get native caption buttons
// (titleBarOverlay) in a strip across the top, so the page starts below that strip
const MAC = process.platform === 'darwin'
const CAPTION = 40

const contentBounds = () => {
  const { width, height } = win.getContentBounds()
  const x = sidebarOpen ? SIDEBAR : GAP
  const y = MAC ? GAP : CAPTION
  return { x, y, width: width - x - GAP, height: height - y - GAP }
}

// the caption buttons sit on the space's tint, roughly where the sidebar gradient starts
function tintCaption() {
  if (MAC) return
  const dark = nativeTheme.shouldUseDarkColors
  const mix = (hex, to, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k + to * (1 - k)).toString(16).padStart(2, '0')).join('')
  win.setTitleBarOverlay({ color: mix(space().color, dark ? 20 : 255, dark ? 0.42 : 0.58), symbolColor: dark ? '#f2f2f4' : '#1d1d1f', height: CAPTION })
}

// the ui view fills the window behind the tabs (sidebar + tinted frame) and
// moves on top only while the command bar is open
function layout() {
  win.setBackgroundColor(space().color)
  tintCaption()
  const { width, height } = win.getContentBounds()
  ui.setBounds({ x: 0, y: 0, width, height })
  for (const [id, v] of views) {
    v.setVisible(id === space().activeId)
    v.setBounds(contentBounds())
  }
}

// chrome.* extension APIs and the Web Store, set up once per profile session
const extensions = new Map()
let extensionsVersion = 0
function extensionsFor(profile) {
  if (extensions.has(profile)) return extensions.get(profile)
  const ses = session.fromPartition('persist:' + profile)
  const ext = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: ses,
    createTab({ url }) {
      newTab(url || 'about:blank')
      return [current(), win]
    },
    selectTab(wc) {
      const id = [...views].find(([, v]) => v.webContents === wc)?.[0]
      if (id) select(id)
    },
  })
  installChromeWebStore({ session: ses }).catch((e) => console.error('web store:', e))
  // the toolbar element doesn't notice installs, so the ui rebuilds it when this changes
  const bump = () => { extensionsVersion++; if (ui) render() }
  ses.extensions.on('extension-loaded', bump)
  ses.extensions.on('extension-unloaded', bump)
  extensions.set(profile, ext)
  return ext
}

function viewFor(t) {
  if (views.has(t.id)) return views.get(t.id)
  // each space's profile is its own cookie jar, like Arc's profile-per-space
  const { profile } = find(t.id).s
  const v = new WebContentsView({ webPreferences: { partition: 'persist:' + profile } })
  v.setBorderRadius(10)
  const wc = v.webContents
  wc.on('page-title-updated', (_, title) => { t.title = title; render() })
  wc.on('page-favicon-updated', (_, icons) => { t.favicon = icons[0]; render() })
  wc.on('did-navigate', (_, url) => { t.url = url; render() })
  wc.on('did-navigate-in-page', (_, url, main) => { if (main) { t.url = url; render() } })
  wc.on('did-start-loading', render)
  wc.on('did-stop-loading', render)
  wc.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' } })
  extensionsFor(profile).addTab(wc, win)
  win.contentView.addChildView(v)
  wc.loadURL(t.url)
  views.set(t.id, v)
  return v
}

function select(id) {
  const found = find(id)
  if (!found) return
  state.active = state.spaces.indexOf(found.s)
  found.s.activeId = id
  found.s.mru = tabs.touch(found.s.mru, id)
  const v = viewFor(found.t)
  extensionsFor(found.s.profile).selectTab(v.webContents)
  layout()
  render()
  v.webContents.focus()
}

function newTab(url) {
  const t = { id: uid(), url, title: url }
  space().today.unshift(t)
  select(t.id)
}

function dropView(id) {
  const v = views.get(id)
  if (!v) return
  win.contentView.removeChildView(v)
  v.webContents.close()
  views.delete(id)
}

// closing a pinned tab only unloads it, like Arc; closing a today tab removes it.
// The space then goes back to the tab used before, not to the top of the list.
function closeTab(id = space().activeId) {
  const s = find(id)?.s
  if (!s) return
  dropView(id)
  if (s.today.some((t) => t.id === id)) detach(s, id)
  if (id !== s.activeId) return render()
  s.activeId = null
  const ids = [...tabsOf(s)].map((t) => t.id)
  const next = tabs.afterClose(id, s.mru, ids, s.today.map((t) => t.id), ids.filter((i) => views.has(i)))
  if (next) select(next)
  else { layout(); render() }
}

function togglePin() {
  const s = space()
  const id = s.activeId
  if (!id) return
  const pinned = !s.today.some((t) => t.id === id)
  const t = detach(s, id)
  if (!t) return // favorites stay favorites
  if (pinned) s.today.unshift(t)
  else s.pinned.push(t)
  render()
}

// a space with tabs never shows an empty content area: last active tab, else its first tab
function showSpace(i) {
  state.active = i
  const s = space()
  const id = find(s.activeId) ? s.activeId : [...tabsOf(s)][0]?.id
  if (id) return select(id)
  layout()
  render()
}

const moveSpace = (d) => showSpace((state.active + d + state.spaces.length) % state.spaces.length)

function newSpace() {
  const n = state.spaces.length
  state.spaces.push({ id: uid(), name: `Space ${n + 1}`, color: COLORS[n % COLORS.length], profile: 'default', activeId: null, pinned: [], today: [] })
  showSpace(n)
}

function toURL(text) {
  text = text.trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/\s/.test(text)) return text
  if (!/\s/.test(text) && (text.includes('.') || text.startsWith('localhost'))) return 'https://' + text
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(text)
}

// css blur can't see into another view, so the backdrop is a snapshot of the page
async function openPalette(mode) {
  if (paletteOpen) return
  paletteOpen = true
  const shot = await current()?.capturePage().catch(() => null)
  win.contentView.addChildView(ui) // re-adding moves it to the top
  const t = find(space().activeId)?.t
  ui.webContents.send('palette', {
    mode,
    url: mode === 'edit' ? t?.url || '' : '',
    backdrop: shot && !shot.isEmpty() ? { src: shot.resize({ width: 640 }).toDataURL(), ...contentBounds() } : null,
  })
  ui.webContents.focus()
}

function closePalette() {
  if (!paletteOpen) return
  paletteOpen = false
  win.contentView.removeChildView(ui)
  win.contentView.addChildView(ui, 0)
  current()?.focus()
}

const current = () => views.get(space().activeId)?.webContents
const back = () => current()?.navigationHistory.goBack()
const forward = () => current()?.navigationHistory.goForward()
const reload = () => { const wc = current(); if (wc?.isLoading()) wc.stop(); else wc?.reload() }
const toggleSidebar = () => { sidebarOpen = !sidebarOpen; layout(); render() }

const commands = {
  select(id) { closePalette(); select(id) },
  newSpace,
  closeTab: (id) => closeTab(id),
  importArc: () => importArc(), // never a renderer-supplied path
  closePalette,
  openPalette: (mode) => openPalette(mode === 'edit' ? 'edit' : 'new'),
  go(text, mode) {
    closePalette()
    const url = toURL(String(text))
    const wc = current()
    if (mode === 'edit' && wc) wc.loadURL(url)
    else newTab(url)
  },
  showSpace: (i) => state.spaces[i] && showSpace(i),
  back,
  forward,
  reload,
  toggleSidebar,
  openUpdate: () => update && newTab(update.url),
  dismissUpdate() { if (update) { state.dismissedUpdate = update.version; render() } },
  // drag and drop in the sidebar; a today tab dropped among the pinned ones is pinned, and back
  moveTab(id, target, where) {
    if (tabs.move(space(), id, target, where)) render()
  },
  renameSpace(id, name) {
    const s = state.spaces.find((s) => s.id === id)
    name = String(name).trim().slice(0, 60)
    if (s && name) { s.name = name; render() }
  },
  toggleFolder(id) {
    const f = [...nodes(space().pinned)].find((f) => f.id === id)
    if (f?.children) { f.open = !f.open; render() }
  },
}

ipcMain.on('cmd', (e, name, ...args) => {
  if (e.sender === ui.webContents && Object.hasOwn(commands, name)) commands[name](...args)
})

function menu() {
  const item = (label, accelerator, click) => ({ label, accelerator, click })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        item('Import from Arc…', undefined, () => importArc()),
        item('Import Arc File…', undefined, pickArcFile),
        item('Chrome Web Store', undefined, () => newTab('https://chromewebstore.google.com/')),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Tab',
      submenu: [
        item('New Tab', 'CmdOrCtrl+T', () => openPalette('new')),
        item('Open Location', 'CmdOrCtrl+L', () => openPalette('edit')),
        item('Close Tab', 'CmdOrCtrl+W', () => closeTab()),
        item('Reload', 'CmdOrCtrl+R', reload),
        item('Back', 'CmdOrCtrl+[', back),
        item('Forward', 'CmdOrCtrl+]', forward),
        item('Pin / Unpin', 'CmdOrCtrl+D', togglePin),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Next Space', MAC ? 'Cmd+Ctrl+Right' : 'Ctrl+Alt+Right', () => moveSpace(1)),
        item('Previous Space', MAC ? 'Cmd+Ctrl+Left' : 'Ctrl+Alt+Left', () => moveSpace(-1)),
        item('Toggle Sidebar', 'CmdOrCtrl+S', toggleSidebar),
        { role: 'toggleDevTools' },
      ],
    },
  ]))
}

// Google refuses sign-in from user agents that mention Electron, so look like plain Chrome
const cleanUA = (ua) => ua.replace(/ Electron\/\S+/, '').replace(new RegExp(` ${app.getName()}\\/\\S+`), '')
app.userAgentFallback = cleanUA(app.userAgentFallback)
app.on('session-created', (s) => s.setUserAgent(cleanUA(s.getUserAgent())))

app.whenReady().then(() => {
  load()
  // the sidebar's nav row is laid out around this exact traffic light position
  win = new BaseWindow(MAC
    ? { width: 1280, height: 820, titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 }, backgroundColor: space().color }
    : { width: 1280, height: 820, titleBarStyle: 'hidden', titleBarOverlay: { height: CAPTION }, backgroundColor: space().color })
  // the extension toolbar element needs a non-sandboxed preload; ui.html is local and trusted
  ui = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false } })
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession)
  extensionsFor(space().profile) // registers the ipc handlers the toolbar calls on load
  ui.setBackgroundColor('#00000000')
  win.contentView.addChildView(ui)
  ui.webContents.loadFile('ui.html')
  ui.webContents.once('did-finish-load', () => {
    if (!DEMO || process.env.CAMBER_UPDATE_URL) {
      checkUpdate()
      setInterval(checkUpdate, 6 * 60 * 60 * 1000)
    }
    if ([...tabsOf(space())].length) showSpace(state.active)
    else if (!DEMO) newTab('https://duckduckgo.com')
    else render() // demo starts empty, ready for Import from Arc
  })
  win.on('resize', layout)
  win.on('closed', () => { clearTimeout(saveTimer); if (!DEMO) save(); app.quit() })
  menu()
  layout()
})
