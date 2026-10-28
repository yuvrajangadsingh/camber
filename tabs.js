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
// A moved tab counts as used at `now`, so an old pinned tab unpinned into today isn't archived at once.
function move(s, id, target, where, now) {
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
  t.lastActive = now
  return true
}

// most recently used first; capped so state.json doesn't grow with long-gone ids
const touch = (mru, id) => [id, ...(mru || []).filter((x) => x !== id)].slice(0, 50)

// tabs `ids` left the space for good (closed or archived): they leave its history, and if one
// was selected, the last used tab still there takes its place (null when none)
function forget(s, ids) {
  s.mru = (s.mru || []).filter((id) => !ids.includes(id))
  if (ids.includes(s.activeId)) s.activeId = s.mru[0] ?? null
}

// the tab to show after `closed`: the last one used that is still there, then the first
// today tab, then any loaded tab, then any tab at all
function afterClose(closed, mru, ids, today, loaded) {
  const ok = (id) => id !== closed && ids.includes(id)
  return (mru || []).find(ok) || today.find(ok) || loaded.find(ok) || ids.find(ok)
}

// closes today tabs not activated for `hours` (0 = never) and returns their ids. The tab on
// screen is kept however old it is; a tab with no lastActive yet (state from an older camber,
// a fresh import) starts its clock now instead of going at once.
function prune(state, now, hours) {
  if (!hours) return []
  const gone = []
  const shown = state.spaces[state.active]?.activeId
  for (const s of state.spaces) {
    const out = []
    s.today = s.today.filter((t) => {
      t.lastActive ??= now
      const keep = t.id === shown || now - t.lastActive < hours * 3600000
      if (!keep) out.push(t.id)
      return keep
    })
    forget(s, out)
    gone.push(...out)
  }
  return gone
}

// the only URLs camber loads from outside input (other apps, page popups, the little window's
// address): http and https, plus about:blank. file:, javascript:, data:, chrome: and the rest don't pass.
function web(url) {
  if (url === 'about:blank') return true
  try { return ['http:', 'https:'].includes(new URL(url).protocol) } catch { return false }
}

// Air Traffic Control rules ({ host, spaceId }): a rule for github.com covers gist.github.com
// but not notgithub.com
const covers = (rule, host) => host === rule.host || host.endsWith('.' + rule.host)

// the space a link from outside opens in, or undefined; the most specific rule wins
function route(routes, url) {
  let host
  try { host = new URL(url).hostname } catch { return }
  return (routes || []).filter((r) => covers(r, host)).sort((a, b) => b.host.length - a.host.length)[0]?.spaceId
}

module.exports = { nodes, detach, move, touch, forget, afterClose, prune, web, covers, route }
