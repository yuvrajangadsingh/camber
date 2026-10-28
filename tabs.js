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

// closes today tabs not activated for `hours` (0 = never) and returns their ids. The tabs on
// screen (the active one, and both panes of its split) are kept however old they are; a tab with no lastActive yet (state from an older camber,
// a fresh import) starts its clock now instead of going at once.
function prune(state, now, hours) {
  if (!hours) return []
  const gone = []
  const a = state.spaces[state.active]
  const shown = a?.split?.includes(a.activeId) ? a.split : [a?.activeId]
  for (const s of state.spaces) {
    const out = []
    s.today = s.today.filter((t) => {
      t.lastActive ??= now
      const keep = shown.includes(t.id) || now - t.lastActive < hours * 3600000
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

// what a tab, peek or little window may load at all: web pages plus extension pages
const loadable = (url) => web(url) || /^chrome-extension:\/\/[a-z]+\//.test(url)

// where a page may take itself (a link, location.href, a server redirect): also a blob: it made, such
// as a generated PDF, and about:blank with a fragment. Never accepted as outside input.
const navigable = (url) => loadable(url) || /^(blob:|about:blank#)/.test(url)

// site permissions: these are asked once per origin and remembered in `perms`
// ({ [origin]: { [key]: true | false } }); fullscreen and copy-to-clipboard just work; the rest is denied.
// HID, USB, serial, Bluetooth and screen sharing need device pickers camber doesn't have, so they are denied too.
const ASK = ['media', 'geolocation', 'notifications', 'clipboard-read', 'midi', 'midiSysex', 'idle-detection', 'pointerLock']
const FREE = ['fullscreen', 'clipboard-sanitized-write']
// the keys a request is remembered under: a camera + mic request is two, so each is answered on its own
const permKeys = (name, media) => {
  const keys = name === 'media' ? (media || []).map((m) => ({ audio: 'microphone', video: 'camera' })[m] || m) : [name]
  return keys.length ? keys : [name]
}
// true, false, or undefined when the user has to be asked. An extension gets its own requests.
function permission(perms, origin, name, keys) {
  if (String(origin).startsWith('chrome-extension:') || FREE.includes(name)) return true
  if (!ASK.includes(name) || !/^https?:/.test(origin)) return false
  const got = keys.map((k) => perms?.[origin]?.[k])
  if (got.includes(false)) return false
  if (got.every((x) => x === true)) return true
}
// a site checking before it asks (Notification.permission, permissions.query) must not read "denied" while
// undecided; only these two, since showing a notification or opening a device still goes through the dialog
const checked = (perms, origin, name, keys) => (permission(perms, origin, name, keys) ?? ['media', 'notifications'].includes(name)) === true

// the origin a permission is asked and kept for: the frame's security origin when Electron gives one,
// else its url's; a blob: url carries its creator's origin and an about: main frame inherits the page's.
// A nested about: frame with no given origin gets none (so it is denied): it may belong to an embedded site,
// and keying it to the top page would hand it that page's answers.
function permOrigin(frameOrigin, url, pageUrl, main = true) {
  const of = (u) => { try { const x = new URL(u); return x.protocol === 'blob:' ? of(x.pathname) : x.host ? x.protocol + '//' + x.host : '' } catch { return '' } }
  return of(frameOrigin) || (/^about:/.test(url) ? (main ? of(pageUrl) : '') : of(url))
}

// permission dialogs: one on screen at a time, a request for an answer already being asked shares it,
// and past `max` waiting the rest are refused without a dialog
function asker(max = 8) {
  const waiting = new Map()
  let last = Promise.resolve()
  return (key, ask) => {
    if (waiting.has(key)) return waiting.get(key)
    if (waiting.size >= max) return Promise.resolve(false)
    const p = last.then(ask)
    waiting.set(key, p)
    last = p.catch(() => {}).then(() => { waiting.delete(key) })
    return p
  }
}

// Air Traffic Control rules ({ host, spaceId }): a rule for github.com covers gist.github.com
// but not notgithub.com
const covers = (rule, host) => host === rule.host || host.endsWith('.' + rule.host)

// the space a link from outside opens in, or undefined; the most specific rule whose space
// (one of `spaceIds`) still exists wins
function route(routes, url, spaceIds) {
  let host
  try { host = new URL(url).hostname } catch { return }
  return (routes || []).filter((r) => covers(r, host) && spaceIds.includes(r.spaceId)).sort((a, b) => b.host.length - a.host.length)[0]?.spaceId
}

// a space's split ([left, right]) holds two different tabs of that space (`ids`: its pinned,
// today and favorites); a restored one that points elsewhere is dropped
const pairOk = (split, ids) => Array.isArray(split) && split.length === 2 && split[0] !== split[1] && split.every((id) => ids.includes(id))

module.exports = { nodes, detach, move, touch, forget, afterClose, prune, web, loadable, navigable, permKeys, permission, checked, permOrigin, asker, covers, route, pairOk }
