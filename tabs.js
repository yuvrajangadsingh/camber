// Pure helpers for a space's tabs, kept out of main.js so they can be tested without Electron.

// most recently used first; capped so state.json doesn't grow with long-gone ids
const touch = (mru, id) => [id, ...(mru || []).filter((x) => x !== id)].slice(0, 50)

// the tab to show after `closed`: the last one used that is still there, then the first
// today tab, then any loaded tab, then any tab at all
function afterClose(closed, mru, ids, today, loaded) {
  const ok = (id) => id !== closed && ids.includes(id)
  return (mru || []).find(ok) || today.find(ok) || loaded.find(ok) || ids.find(ok)
}

module.exports = { touch, afterClose }
