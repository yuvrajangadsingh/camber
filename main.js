const { app, BaseWindow, WebContentsView, Menu, dialog, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const arc = require('./arc')

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

// pinned holds tabs and folders ({ title, open, children: [tab] }), today holds tabs
function* tabsOf(s) {
  for (const it of [...s.pinned, ...s.today]) {
    if (it.children) yield* it.children
    else yield it
  }
}

function find(id) {
  for (const s of state.spaces) for (const t of tabsOf(s)) if (t.id === id) return { s, t }
}

// removes a tab from wherever it sits in its space and returns it
function detach(s, id) {
  for (const list of [s.pinned, s.today, ...s.pinned.filter((f) => f.children).map((f) => f.children)]) {
    const i = list.findIndex((t) => t.id === id)
    if (i >= 0) return list.splice(i, 1)[0]
  }
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

// CAMBER_ARC_FILE points the importer at a copy instead of Arc's live file
const arcPath = () => process.env.CAMBER_ARC_FILE || path.join(app.getPath('appData'), 'Arc', 'StorableSidebar.json')

function importArc() {
  let spaces
  try {
    spaces = arc.convert(JSON.parse(fs.readFileSync(arcPath(), 'utf8')), uid)
  } catch (e) {
    dialog.showErrorBox('Import from Arc', `Could not read ${arcPath()}\n\n${e.message}`)
    return
  }
  state.importedArc = true
  state.spaces.push(...spaces)
  showSpace(state.spaces.length - spaces.length)
}

let saveTimer
function render() {
  const offerArc = !state.importedArc && fs.existsSync(arcPath())
  ui.webContents.send('state', { state, sidebarOpen, offerArc })
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 500)
}

const contentBounds = () => {
  const { width, height } = win.getContentBounds()
  const x = sidebarOpen ? SIDEBAR : GAP
  return { x, y: GAP, width: width - x - GAP, height: height - 2 * GAP }
}

// the ui view fills the window behind the tabs (sidebar + tinted frame) and
// moves on top only while the command bar is open
function layout() {
  win.setBackgroundColor(space().color)
  const { width, height } = win.getContentBounds()
  ui.setBounds({ x: 0, y: 0, width, height })
  for (const [id, v] of views) {
    v.setVisible(id === space().activeId)
    v.setBounds(contentBounds())
  }
}

function viewFor(t) {
  if (views.has(t.id)) return views.get(t.id)
  // each space's profile is its own cookie jar, like Arc's profile-per-space
  const v = new WebContentsView({ webPreferences: { partition: 'persist:' + find(t.id).s.profile } })
  v.setBorderRadius(10)
  const wc = v.webContents
  wc.on('page-title-updated', (_, title) => { t.title = title; render() })
  wc.on('page-favicon-updated', (_, icons) => { t.favicon = icons[0]; render() })
  wc.on('did-navigate', (_, url) => { t.url = url; render() })
  wc.on('did-navigate-in-page', (_, url, main) => { if (main) { t.url = url; render() } })
  wc.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' } })
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
  const v = viewFor(found.t)
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

// closing a pinned tab only unloads it, like Arc; closing a today tab removes it
function closeTab() {
  const s = space()
  const id = s.activeId
  if (!id) return
  dropView(id)
  if (s.today.some((t) => t.id === id)) detach(s, id)
  s.activeId = null
  const next = s.today[0] || [...tabsOf(s)].find((t) => views.has(t.id))
  if (next) select(next.id)
  else { layout(); render() }
}

function togglePin() {
  const s = space()
  const id = s.activeId
  if (!id) return
  const pinned = !s.today.some((t) => t.id === id)
  const t = detach(s, id)
  if (pinned) s.today.unshift(t)
  else s.pinned.push(t)
  render()
}

function showSpace(i) {
  state.active = i
  const v = views.get(space().activeId)
  layout()
  render()
  v?.webContents.focus()
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

const commands = {
  select(id) { closePalette(); select(id) },
  newSpace,
  importArc,
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
  toggleFolder(i) {
    const f = space().pinned[i]
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
    { label: 'File', submenu: [item('Import from Arc…', undefined, importArc)] },
    { role: 'editMenu' },
    {
      label: 'Tab',
      submenu: [
        item('New Tab', 'Cmd+T', () => openPalette('new')),
        item('Open Location', 'Cmd+L', () => openPalette('edit')),
        item('Close Tab', 'Cmd+W', closeTab),
        item('Reload', 'Cmd+R', () => current()?.reload()),
        item('Back', 'Cmd+[', () => current()?.navigationHistory.goBack()),
        item('Forward', 'Cmd+]', () => current()?.navigationHistory.goForward()),
        item('Pin / Unpin', 'Cmd+D', togglePin),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Next Space', 'Cmd+Ctrl+Right', () => moveSpace(1)),
        item('Previous Space', 'Cmd+Ctrl+Left', () => moveSpace(-1)),
        item('Toggle Sidebar', 'Cmd+S', () => { sidebarOpen = !sidebarOpen; layout(); render() }),
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
  win = new BaseWindow({ width: 1280, height: 820, titleBarStyle: 'hiddenInset', backgroundColor: space().color })
  ui = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.js') } })
  ui.setBackgroundColor('#00000000')
  win.contentView.addChildView(ui)
  ui.webContents.loadFile('ui.html')
  ui.webContents.once('did-finish-load', () => {
    const s = space()
    if (s.activeId && find(s.activeId)) select(s.activeId)
    else if (![...tabsOf(s)].length) newTab('https://duckduckgo.com')
    render()
  })
  win.on('resize', layout)
  win.on('closed', () => { clearTimeout(saveTimer); save(); app.quit() })
  menu()
  layout()
})
