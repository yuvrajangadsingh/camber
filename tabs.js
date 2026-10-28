// Pure helpers for a space's tabs, kept out of main.js so they can be tested without Electron.

// pinned holds tabs and folders ({ title, open, children: [tab or folder] }), today holds tabs
function* nodes(list) {
  for (const it of list) {
    yield it
    if (it.children) yield* nodes(it.children)
  }
}

// every list a tab can sit in: pinned, today, and each folder's children
const lists = (s) => [s.pinned, s.today, ...[...nodes(s.pinned)].filter((f) => f.children).map((f) => f.children)]

// removes a tab from wherever it sits in its space and returns it
function detach(s, id) {
  for (const list of lists(s)) {
    const i = list.findIndex((t) => t.id === id)
    if (i >= 0) return list.splice(i, 1)[0]
  }
}

// moves tab `id` before or after `target`, or into folder `target` with where 'inside'.
// target 'pinned' is the end of the pinned list, 'today' the top of today; landing in
// pinned pins a today tab and landing in today unpins. Folders and favorites don't move.
function move(s, id, target, where) {
  const find = (x) => [...nodes([...s.pinned, ...s.today])].find((it) => it.id === x)
  const t = find(id)
  if (!t || t.children || id === target || !(target === 'pinned' || target === 'today' || find(target))) return false
  detach(s, id)
  let list = target === 'today' ? s.today : s.pinned
  let i = target === 'today' ? 0 : s.pinned.length
  if (target !== 'pinned' && target !== 'today') {
    list = lists(s).find((l) => l.some((it) => it.id === target))
    i = list.findIndex((it) => it.id === target)
    if (where === 'inside' && list[i].children) {
      list[i].open = true
      list = list[i].children
      i = list.length
    } else if (where === 'after') i++
  }
  list.splice(i, 0, t)
  return true
}

// most recently used first; capped so state.json doesn't grow with long-gone ids
const touch = (mru, id) => [id, ...(mru || []).filter((x) => x !== id)].slice(0, 50)

// the tab to show after `closed`: the last one used that is still there, then the first
// today tab, then any loaded tab, then any tab at all
function afterClose(closed, mru, ids, today, loaded) {
  const ok = (id) => id !== closed && ids.includes(id)
  return (mru || []).find(ok) || today.find(ok) || loaded.find(ok) || ids.find(ok)
}

module.exports = { nodes, detach, move, touch, afterClose }
