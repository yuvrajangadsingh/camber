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

// links from other apps: macOS sends open-url, Windows and Linux start a second camber with
// the URL in argv, which hands it over here and quits. Links that come before the ui is up wait.
const solo = app.requestSingleInstanceLock()
if (!solo) app.quit()
let ready = false
const waiting = []
const linksIn = (argv) => argv.filter(tabs.web)
// outside input that isn't http(s) is dropped here, before it can reach a loadURL
const allowed = (url) => tabs.web(url) || void console.warn('camber: dropped a non-web URL:', String(url).slice(0, 80))
// window.open from a page never makes a window; an allowed URL goes to `open` instead
const popups = (open) => ({ url }) => { if (allowed(url)) open(url); return { action: 'deny' } }
// the one gate for every page camber loads (typed, restored, imported, extension-made) and for a
// page's own top-level navigations: no file:, data:, javascript: or chrome: page ever loads
const loadable = (url) => tabs.loadable(url) || void console.warn('camber: did not load', String(url).slice(0, 80))
const guard = (wc) => wc.on('will-navigate', (e, url) => { if (!loadable(url)) e.preventDefault() })
function openLink(url) {
  if (!allowed(url)) return
  if (!ready) return waiting.push(url)
  const ids = state.spaces.map((s) => s.id)
  const i = ids.indexOf(tabs.route(state.routes, url, ids))
  if (i < 0) return little(url)
  state.active = i
  newTab(url)
  if (win.isMinimized()) win.restore()
  win.focus()
}
app.on('open-url', (e, url) => { e.preventDefault(); openLink(url) })
app.on('second-instance', (_, argv) => linksIn(argv).forEach(openLink))

// no window or dialog on success, the OS settings pane shows the result
function makeDefault() {
  const ok = ['http', 'https'].map((p) => app.setAsDefaultProtocolClient(p))
  if (!ok.every(Boolean)) dialog.showErrorBox('Default browser', 'The system did not let camber register for http and https links.')
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
  const gone = arc.merge(state, { spaces, favorites })
  gone.forEach(dropView)
  for (const s of state.spaces) tabs.forget(s, gone) // replaced favorites
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
  const pane = pair() && paneBounds(space().activeId)
  ui.webContents.send('state', { state, sidebarOpen, offerArc, tabId: wc?.id, extensionsVersion, nav, platform: process.platform, update: notice, pane, peek: peek && { url: peek.url, ...peekBounds() } })
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

// split view: while the active tab is one of the space's pair (s.split = [left, right]), both
// share the content area half and half
const pair = () => {
  const s = space()
  if (s.split && !tabs.pairOk(s.split, [...tabsOf(s)].map((t) => t.id))) s.split = null
  return s.split?.includes(s.activeId) ? s.split : null
}
function paneBounds(id) {
  const b = contentBounds()
  const p = pair()
  if (!p?.includes(id)) return b
  const w = Math.floor((b.width - GAP) / 2)
  return p[0] === id ? { ...b, width: w } : { ...b, x: b.x + w + GAP, width: b.width - w - GAP }
}

// the caption buttons sit on the space's tint, roughly where the sidebar gradient starts
function tintCaption() {
  if (MAC) return
  const dark = nativeTheme.shouldUseDarkColors
  const mix = (hex, to, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k + to * (1 - k)).toString(16).padStart(2, '0')).join('')
  win.setTitleBarOverlay({ color: mix(space().color, dark ? 20 : 255, dark ? 0.42 : 0.58), symbolColor: dark ? '#f2f2f4' : '#1d1d1f', height: CAPTION })
}

// auto picture-in-picture: a tab that goes off screen with a video playing pops it out, and
// coming back puts it back. Top-level <video> only; one inside an iframe (most embeds) stays.
const autoPip = () => state.autoPip ?? true
// The scripts run in their own world, so a page's own querySelectorAll or pictureInPictureElement
// never runs inside them, and the user gesture goes only to a page with a video to pop out.
const WORLD = 1001
const PLAYING = `document.pictureInPictureEnabled && [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended && v.readyState > 2 && !v.disablePictureInPicture)`
const POP = `(async () => {
  try {
    const v = [...document.querySelectorAll('video')].find((v) => !v.paused && !v.ended && v.readyState > 2 && !v.disablePictureInPicture)
    if (v) await v.requestPictureInPicture()
  } catch (e) { console.warn('camber pip:', e.message) }
})()`
const UNPOP = `document.pictureInPictureElement && document.exitPictureInPicture().catch((e) => console.warn('camber pip:', e.message))`
const run = (wc, code, gesture) => wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }], gesture)
// one request at a time per page: coming back waits for a pop-out still in flight, then undoes it.
// Coming back undoes a pop-out even with the setting off, so turning it off never leaves one stuck,
// and a pop-out still waiting when the setting goes off doesn't happen.
const pipQueue = new WeakMap()
function pip(wc, pop) {
  if ((pop && !autoPip()) || wc.isDestroyed() || !/^https?:/.test(wc.getURL())) return
  const job = async () => {
    if (wc.isDestroyed()) return
    if (!pop) await run(wc, UNPOP, false)
    else if (await run(wc, PLAYING, false) && autoPip()) await run(wc, POP, true)
  }
  pipQueue.set(wc, (pipQueue.get(wc) || Promise.resolve()).then(job).catch(() => {}))
}

// the ui view fills the window behind the tabs (sidebar + tinted frame) and
// moves on top only while the command bar is open. Leaving a space ends its split and its peek.
let shownSpace
let onScreen = new Set()
function layout() {
  if (shownSpace && shownSpace !== space()) { shownSpace.split = null; closePeek() }
  shownSpace = space()
  win.setBackgroundColor(space().color)
  tintCaption()
  const { width, height } = win.getContentBounds()
  ui.setBounds({ x: 0, y: 0, width, height })
  const p = pair()
  // both panes count as in use, so the one that isn't active doesn't age into the archive
  p?.forEach((id) => { const { t } = find(id); t.lastActive = Date.now(); viewFor(t) })
  const shown = new Set([...views.keys()].filter((id) => p ? p.includes(id) : id === space().activeId))
  for (const [id, v] of views) {
    if (onScreen.has(id) !== shown.has(id)) pip(v.webContents, !shown.has(id))
    v.setVisible(shown.has(id))
    v.setBounds(paneBounds(id))
  }
  onScreen = shown
  // a tab view loaded just now goes on top, so the ui and the peek are put back over it
  if (peek) { win.contentView.addChildView(ui); win.contentView.addChildView(peek.view); fitPeek() }
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

// `adopt` is an already loaded view (a peek) that becomes this tab's page as it is
function viewFor(t, adopt) {
  if (views.has(t.id)) return views.get(t.id)
  // each space's profile is its own cookie jar, like Arc's profile-per-space
  const { profile } = find(t.id).s
  const v = adopt || new WebContentsView({ webPreferences: { partition: 'persist:' + profile } })
  v.setBorderRadius(10)
  const wc = v.webContents
  wc.on('page-title-updated', (_, title) => { t.title = title; render() })
  wc.on('page-favicon-updated', (_, icons) => { t.favicon = icons[0]; render() })
  wc.on('did-navigate', (_, url) => { t.url = url; render() })
  wc.on('did-navigate-in-page', (_, url, main) => { if (main) { t.url = url; render() } })
  wc.on('did-start-loading', render)
  wc.on('did-stop-loading', render)
  // clicking the other pane of a split makes it the active tab
  wc.on('before-mouse-event', (_, m) => { if (m.type === 'mouseDown' && pair()?.includes(t.id) && space().activeId !== t.id) select(t.id) })
  wc.setWindowOpenHandler(popups(newTab))
  guard(wc)
  extensionsFor(profile).addTab(wc, win)
  win.contentView.addChildView(v)
  // a tab whose url can't load stays in the sidebar with its url, on a blank page
  if (!adopt && loadable(t.url)) wc.loadURL(t.url)
  views.set(t.id, v)
  return v
}

function select(id) {
  const found = find(id)
  if (!found) return
  state.active = state.spaces.indexOf(found.s)
  found.s.activeId = id
  found.s.mru = tabs.touch(found.s.mru, id)
  found.t.lastActive = Date.now()
  const v = viewFor(found.t)
  extensionsFor(found.s.profile).selectTab(v.webContents)
  layout()
  render()
  v.webContents.focus()
}

function newTab(url, adopt) {
  const t = { id: uid(), url, title: adopt?.webContents.getTitle() || url }
  space().today.unshift(t)
  if (adopt) viewFor(t, adopt)
  select(t.id)
}

function dropView(id) {
  for (const s of state.spaces) if (s.split?.includes(id)) s.split = null
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
  const shown = id === s.activeId
  dropView(id)
  if (s.today.some((t) => t.id === id)) { detach(s, id); tabs.forget(s, [id]) }
  if (!shown) { layout(); return render() } // a split's other pane takes the full width
  closePeek() // it was over the page that just went
  s.activeId = null
  const ids = [...tabsOf(s)].map((t) => t.id)
  const next = tabs.afterClose(id, s.mru, ids, s.today.map((t) => t.id), ids.filter((i) => views.has(i)))
  if (next) select(next)
  else { layout(); render() }
}

// Cmd+D and drag both go through tabs.move; favorites stay favorites
function moveTab(id, target, where) {
  if (tabs.move(space(), id, target, where, Date.now())) render()
}
function togglePin() {
  const s = space()
  if (s.activeId) moveTab(s.activeId, s.today.some((t) => t.id === s.activeId) ? 'pinned' : 'today')
}

function splitWith(id) {
  const s = space()
  if (!s.activeId || id === s.activeId || ![...tabsOf(s)].some((t) => t.id === id)) return
  s.split = [s.activeId, id]
  layout()
  render()
}
const closeSplit = () => { space().split = null; layout(); render() }

// Air Traffic Control: links from other apps to this site open in this space.
// www. is dropped so a rule made on www.github.com also covers github.com.
// With a little window in front, its page is the site meant.
const siteOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch {} }
function frontSite() {
  const l = littles.get(focusedLittle())
  return siteOf(l ? l.page.webContents.getURL() || l.url : find(space().activeId)?.t.url)
}
function routeHere() {
  const host = frontSite()
  if (!host) return
  state.routes = [...(state.routes || []).filter((r) => r.host !== host), { host, spaceId: space().id }]
  render()
}
function forgetRoute() {
  const host = frontSite()
  if (host) { state.routes = (state.routes || []).filter((r) => !tabs.covers(r, host)); render() }
}

// Arc-style archive: today tabs nobody activated for archiveHours (state.json, default 12, 0 = off) are closed
const archiveHours = () => state.archiveHours ?? 12
function archive() {
  const gone = tabs.prune(state, Date.now(), archiveHours())
  gone.forEach(dropView)
  return gone.length
}

function setArchiveHours(h) {
  state.archiveHours = h
  archive()
  layout()
  render()
}

// Little Arc: a link from outside with no routing rule opens in a small window of its own, on
// the current space's profile so logins work. Open in camber (Cmd+O) moves it into the space.
const littles = new Map() // BaseWindow -> { bar, page, url }
const BAR = 38
function little(url) {
  const w = new BaseWindow({ width: 900, height: 640, center: true, ...(MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 12 } } : { autoHideMenuBar: true }) })
  const bar = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false } })
  const page = new WebContentsView({ webPreferences: { partition: 'persist:' + space().profile } })
  w.contentView.addChildView(page)
  w.contentView.addChildView(bar)
  const fit = () => {
    const { width, height } = w.getContentBounds()
    bar.setBounds({ x: 0, y: 0, width, height: BAR })
    page.setBounds({ x: 0, y: BAR, width, height: height - BAR })
  }
  fit()
  w.on('resize', fit)
  const wc = page.webContents
  const l = { bar, page, url: url || 'about:blank' }
  littles.set(w, l)
  // a page that failed to load (bad host, offline) has no URL, so the one asked for stands in
  const sync = () => bar.webContents.send('state', { url: wc.getURL() || l.url, back: wc.navigationHistory.canGoBack(), mac: MAC })
  wc.on('did-navigate', sync)
  wc.on('did-navigate-in-page', sync)
  wc.on('page-title-updated', (_, title) => w.setTitle(title))
  // links that want a new window stay in this one
  wc.setWindowOpenHandler(popups((u) => wc.loadURL(u)))
  guard(wc)
  bar.webContents.loadFile('little.html')
  bar.webContents.once('did-finish-load', () => {
    sync()
    if (!url) { bar.webContents.focus(); bar.webContents.send('palette') }
  })
  wc.loadURL(l.url)
  w.on('closed', () => { littles.delete(w); wc.close(); bar.webContents.close() })
  return w
}

const focusedLittle = () => { const w = BaseWindow.getFocusedWindow(); return littles.has(w) ? w : null }

function intoCamber(w) {
  const l = littles.get(w)
  const url = l.page.webContents.getURL() || l.url
  w.close()
  if (!url || url === 'about:blank') return
  newTab(url)
  win.focus()
}

const littleCommands = {
  back: (w) => littles.get(w).page.webContents.navigationHistory.goBack(),
  go(w, text) {
    const l = littles.get(w), url = toURL(String(text))
    if (!allowed(url)) return
    l.url = url
    l.page.webContents.loadURL(url)
  },
  open: intoCamber,
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
async function backdrop() {
  const shot = await current()?.capturePage().catch(() => null)
  return shot && !shot.isEmpty() ? { src: shot.resize({ width: 640 }).toDataURL(), ...paneBounds(space().activeId) } : null
}

async function openPalette(mode) {
  if (paletteOpen || peek) return
  paletteOpen = true
  const snap = await backdrop()
  win.contentView.addChildView(ui) // re-adding moves it to the top
  const t = find(space().activeId)?.t
  ui.webContents.send('palette', { mode, url: mode === 'edit' ? t?.url || '' : '', backdrop: snap })
  ui.webContents.focus()
}

// Peek: Shift+click a favorite (Cmd+Shift+click a pinned tab) opens it in a panel over the page,
// on the space's profile. ui.html draws the panel and its strip under the page view; Esc or a
// click outside closes it, Open as tab (Cmd+O) moves it to today.
let peek = null // { view, url, loading }; loading is set once its page has been asked for
const INSET = 48
const STRIP = 36
const peekBounds = () => {
  const b = contentBounds()
  return { x: b.x + INSET, y: b.y + INSET, width: b.width - 2 * INSET, height: b.height - 2 * INSET }
}
const fitPeek = () => {
  const b = peekBounds()
  peek.view.setBounds({ x: b.x + 1, y: b.y + STRIP, width: b.width - 2, height: b.height - STRIP - 1 })
}

async function openPeek(id) {
  const t = find(id)?.t
  if (!t || peek || paletteOpen || !allowed(t.url)) return
  const p = peek = { view: new WebContentsView({ webPreferences: { partition: 'persist:' + space().profile } }), url: t.url }
  const snap = await backdrop()
  if (peek !== p) return
  p.view.setBorderRadius(10)
  const wc = p.view.webContents
  wc.on('did-navigate', (_, url) => { p.url = url; render() })
  wc.on('did-navigate-in-page', (_, url, main) => { if (main) { p.url = url; render() } })
  wc.on('before-input-event', (e, i) => { if (peek === p && i.type === 'keyDown' && i.key === 'Escape') { e.preventDefault(); closePeek() } })
  wc.setWindowOpenHandler(popups((u) => wc.loadURL(u)))
  guard(wc)
  win.contentView.addChildView(ui)
  win.contentView.addChildView(p.view)
  ui.webContents.send('palette', { mode: 'peek', backdrop: snap })
  fitPeek()
  wc.loadURL(t.url)
  p.loading = true
  render()
  wc.focus()
}

// keep: the view lives on as a tab (peekToTab), so it is not closed
function closePeek(keep) {
  if (!peek) return
  if (!keep) { win.contentView.removeChildView(peek.view); peek.view.webContents.close() }
  peek = null
  win.contentView.removeChildView(ui)
  win.contentView.addChildView(ui, 0)
  render()
  current()?.focus()
}

// the peeked page moves into the tab with its form input, history and scroll. Before its
// page is asked for (the backdrop is still being taken) there is nothing to move, so it waits.
function peekToTab() {
  const p = peek
  if (!p?.loading) return
  closePeek(true)
  newTab(p.url, p.view)
}

function closePalette() {
  if (!paletteOpen) return
  paletteOpen = false
  win.contentView.removeChildView(ui)
  win.contentView.addChildView(ui, 0)
  current()?.focus()
}

const current = () => views.get(space().activeId)?.webContents
// the menu's back/forward/reload act on what is in front: a little window, else the peek
const target = () => littles.get(focusedLittle())?.page.webContents || peek?.view.webContents || current()
const back = () => target()?.navigationHistory.goBack()
const forward = () => target()?.navigationHistory.goForward()
const reload = () => { const wc = target(); if (wc?.isLoading()) wc.stop(); else wc?.reload() }
const toggleSidebar = () => { sidebarOpen = !sidebarOpen; layout(); render() }

const commands = {
  select(id) { closePalette(); select(id) },
  newSpace,
  closeTab: (id) => closeTab(id),
  importArc: () => importArc(), // never a renderer-supplied path
  closePalette,
  openPalette: (mode) => openPalette(['edit', 'split'].includes(mode) ? mode : 'new'),
  split(id) { closePalette(); splitWith(id) },
  peek: openPeek,
  closePeek: () => closePeek(), // never keep from the renderer
  peekToTab,
  go(text, mode) {
    closePalette()
    const url = toURL(String(text))
    if (!loadable(url)) return
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
  moveTab,
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
  if (e.sender === ui.webContents && Object.hasOwn(commands, name)) return commands[name](...args)
  const w = [...littles].find(([, l]) => l.bar.webContents === e.sender)?.[0]
  if (w && Object.hasOwn(littleCommands, name)) littleCommands[name](w, ...args)
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
        { type: 'separator' },
        item('Make camber the Default Browser', undefined, makeDefault),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Tab',
      submenu: [
        item('New Tab', 'CmdOrCtrl+T', () => openPalette('new')),
        item('Open Location', 'CmdOrCtrl+L', () => {
          const w = focusedLittle()
          if (!w) return openPalette('edit')
          littles.get(w).bar.webContents.focus()
          littles.get(w).bar.webContents.send('palette')
        }),
        item('Close Tab', 'CmdOrCtrl+W', () => { const w = focusedLittle(); if (w) w.close(); else if (peek) closePeek(); else closeTab() }),
        item('New Little Window', 'CmdOrCtrl+Shift+N', () => little()),
        item('Open in camber', 'CmdOrCtrl+O', () => { const w = focusedLittle(); if (w) intoCamber(w); else peekToTab() }),
        item('Reload', 'CmdOrCtrl+R', reload),
        item('Back', 'CmdOrCtrl+[', back),
        item('Forward', 'CmdOrCtrl+]', forward),
        item('Pin / Unpin', 'CmdOrCtrl+D', togglePin),
        item('Split with…', undefined, () => space().activeId && openPalette('split')),
        item('Close Split', 'CmdOrCtrl+Shift+\\', closeSplit),
        { type: 'separator' },
        item('Always Open Links to This Site in This Space', undefined, routeHere),
        item('Forget Routing Rule for This Site', undefined, forgetRoute),
        { type: 'separator' },
        { label: 'Pop out video when leaving a tab', type: 'checkbox', checked: autoPip(), click: (m) => { state.autoPip = m.checked; render() } },
        {
          label: 'Archive After',
          submenu: [[12, '12h'], [24, '24h'], [0, 'Off']].map(([h, label]) =>
            ({ label, type: 'radio', checked: archiveHours() === h, click: () => setArchiveHours(h) })),
        },
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
app.on('session-created', (s) => {
  s.setUserAgent(cleanUA(s.getUserAgent()))
  guardPermissions(s)
})

// without these handlers Electron grants every site whatever macOS has granted camber.
// Each origin is asked once per permission (camera and microphone separately) and the answer kept.
function guardPermissions(ses) {
  const originOf = (url) => { try { const u = new URL(url); return u.protocol + '//' + u.host } catch { return '' } }
  ses.setPermissionCheckHandler((_, name, origin, details) =>
    tabs.permission(state.permissions, originOf(origin), name, tabs.permKeys(name, [details.mediaType])) === true)
  ses.setPermissionRequestHandler(async (_, name, callback, details) => {
    const origin = originOf(details.requestingUrl), keys = tabs.permKeys(name, details.mediaTypes)
    const known = tabs.permission(state.permissions, origin, name, keys)
    if (known !== undefined) return callback(known)
    const { response } = await dialog.showMessageBox(BaseWindow.getFocusedWindow() || win, {
      message: `${new URL(origin).host} wants to use your ${keys.join(' and ')}`,
      buttons: ['Allow', 'Block'], defaultId: 1, cancelId: 1,
    })
    const ok = response === 0
    state.permissions ??= {}
    state.permissions[origin] = { ...state.permissions[origin], ...Object.fromEntries(keys.map((k) => [k, ok])) }
    render()
    callback(ok)
  })
}

app.whenReady().then(() => {
  if (!solo) return
  load()
  // the tab that was on screen at quit counts as just used, then the overnight backlog goes
  const shown = find(space().activeId)
  if (shown) shown.t.lastActive = Date.now()
  archive()
  setInterval(() => { if (archive()) { layout(); render() } }, 10 * 60 * 1000)
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
    ready = true
    ;[...linksIn(process.argv), ...waiting].forEach(openLink)
  })
  win.on('resize', () => { layout(); render() }) // render moves the split's focus ring
  win.on('closed', () => { clearTimeout(saveTimer); if (!DEMO) save(); app.quit() })
  menu()
  layout()
})
