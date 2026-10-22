// Converts Arc's StorableSidebar.json into camber spaces.
// Arc stores spaces and items as flat arrays alternating [id, object, id, object, ...];
// a space's containerIDs is ["pinned", <container id>, "unpinned", <container id>],
// and items link up through childrenIds. Only pinned items are imported.

const hex = (c) => '#' + [c.red, c.green, c.blue].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')

function color(space) {
  const c = space.customInfo?.windowTheme?.primaryColorPalette?.midTone
  return c ? hex(c) : '#5b6ee1'
}

function profile(space) {
  const dir = space.profile?.custom?._0?.directoryBasename
  return dir ? 'arc-' + dir.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'default'
}

function convert(json, uid) {
  const spaces = []
  for (const c of json.sidebar.containers) {
    if (!c.spaces || !c.items) continue
    const items = new Map(c.items.filter((x) => typeof x === 'object').map((x) => [x.id, x]))

    // tabs inside groups, split views and nested folders are flattened into the parent level
    const tabs = (ids) => ids.flatMap((id) => {
      const it = items.get(id)
      if (!it) return []
      const url = it.data.tab?.savedURL
      if (url) return [{ id: uid(), url, title: it.title || it.data.tab.savedTitle || url }]
      return tabs(it.childrenIds)
    })

    for (const s of c.spaces) {
      if (typeof s !== 'object') continue
      const root = items.get(s.containerIDs[s.containerIDs.indexOf('pinned') + 1])
      if (!s.containerIDs.includes('pinned') || !root) continue
      const pinned = root.childrenIds.flatMap((id) => {
        const it = items.get(id)
        if (!it) return []
        if (it.data.list) return [{ id: uid(), title: it.title || 'Folder', open: false, children: tabs(it.childrenIds) }]
        return tabs([id])
      })
      spaces.push({ id: uid(), name: s.title || 'Space', color: color(s), profile: profile(s), activeId: null, pinned, today: [] })
    }
  }
  return spaces
}

module.exports = { convert }
