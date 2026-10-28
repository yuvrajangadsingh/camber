// Converts Arc's StorableSidebar.json into camber spaces.
// Arc stores spaces and items as flat arrays alternating [id, object, id, object, ...];
// a space's containerIDs is ["pinned", <container id>, "unpinned", <container id>],
// and items link up through childrenIds.

const hex = (c) => '#' + [c.red, c.green, c.blue].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')

function color(space) {
  const c = space.customInfo?.windowTheme?.primaryColorPalette?.midTone
  return c ? hex(c) : '#5b6ee1'
}

// Arc profile object -> camber profile name; spaces on the same Arc profile share one
function profile(p) {
  const dir = p?.custom?._0?.directoryBasename
  return dir ? 'arc-' + dir.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'default'
}

function convert(json, uid) {
  const spaces = []
  const favorites = {}
  for (const c of json.sidebar.containers) {
    if (!c.spaces || !c.items) continue
    const items = new Map(c.items.filter((x) => typeof x === 'object').map((x) => [x.id, x]))

    // folders keep their nesting; tab groups and split views flatten into the level they sit in
    const node = (id) => {
      const it = items.get(id)
      if (!it) return []
      const url = it.data.tab?.savedURL
      // name is the label Arc showed; title follows the live page once the tab loads
      if (url) {
        const name = it.title || it.data.tab.savedTitle || url
        return [{ id: uid(), url, name, title: name }]
      }
      if (it.data.list) return [{ id: uid(), title: it.title || 'Folder', open: false, children: it.childrenIds.flatMap(node) }]
      return it.childrenIds.flatMap(node)
    }

    for (const s of c.spaces) {
      if (typeof s !== 'object') continue
      const root = items.get(s.containerIDs[s.containerIDs.indexOf('pinned') + 1])
      if (!s.containerIDs.includes('pinned') || !root) continue
      const pinned = root.childrenIds.flatMap(node)
      // unpinned ("today") tabs come over as unpinned tabs; that list has no folders
      const flat = (list) => list.flatMap((it) => (it.children ? flat(it.children) : [it]))
      const today = flat(items.get(s.containerIDs[s.containerIDs.indexOf('unpinned') + 1])?.childrenIds.flatMap(node) || [])
      // the id comes from Arc's, so a re-import keeps it and routing rules still point at the space
      spaces.push({ id: 'arc-' + s.id, arcId: s.id, name: s.title || 'Space', color: color(s), profile: profile(s.profile), activeId: null, pinned, today })
    }

    // favorites ("top apps") belong to a profile. A synced profile can have one container per
    // machine; prefer the one whose machineID matches a space on that profile.
    const machines = new Set(c.spaces.filter((s) => typeof s === 'object').map((s) => s.profile?.custom?._0?.machineID).filter(Boolean))
    const tops = c.topAppsContainerIDs || []
    for (let i = 0; i + 1 < tops.length; i += 2) {
      const key = profile(tops[i]), root = items.get(tops[i + 1])
      if (!root) continue
      const local = !tops[i].custom || machines.has(tops[i].custom._0?.machineID)
      if (favorites[key] && !local) continue
      favorites[key] = root.childrenIds.flatMap(node).filter((t) => !t.children)
    }
  }
  return { spaces, favorites }
}

// Where Arc keeps its sidebar file. Windows Arc is a Store (MSIX) package, so the folder name
// carries a publisher hash: %LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_<hash>\LocalCache\Local\Arc.
// Arc never shipped on Linux. Returns null when there is nothing to look at.
function arcFile(platform, { appData, localAppData }, readdir) {
  const path = platform === 'win32' ? require('node:path').win32 : require('node:path').posix
  if (platform === 'darwin') return path.join(appData, 'Arc', 'StorableSidebar.json')
  if (platform !== 'win32' || !localAppData) return null
  let pkg
  try { pkg = readdir(path.join(localAppData, 'Packages')).find((n) => n.startsWith('TheBrowserCompany.Arc')) } catch { return null }
  return pkg ? path.join(localAppData, 'Packages', pkg, 'LocalCache', 'Local', 'Arc', 'StorableSidebar.json') : null
}

const tabIds = (list) => list.flatMap((it) => (it.children ? tabIds(it.children) : [it.id]))

// Puts an import into camber's state. A space already imported from the same Arc space is
// replaced in place (re-import never duplicates); favorites are replaced per profile.
// Returns the ids of tabs that went away, so their views can be closed.
function merge(state, { spaces, favorites }) {
  const gone = []
  for (const s of spaces) {
    const i = state.spaces.findIndex((x) => x.arcId && x.arcId === s.arcId)
    if (i < 0) { state.spaces.push(s); continue }
    gone.push(...tabIds([...state.spaces[i].pinned, ...state.spaces[i].today]))
    state.spaces[i] = s
  }
  for (const k of Object.keys(favorites)) gone.push(...tabIds(state.favorites?.[k] || []))
  state.favorites = { ...state.favorites, ...favorites }
  return gone
}

module.exports = { convert, merge, arcFile }
