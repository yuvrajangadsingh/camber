const test = require('node:test')
const assert = require('node:assert')
const { convert, merge } = require('../arc')

test('imports spaces, pinned tabs and folders from an Arc sidebar file', () => {
  let n = 0
  const { spaces, favorites } = convert(require('./arc-fixture.json'), () => 'id' + n++)

  assert.deepStrictEqual(spaces.map((s) => s.name), ['Work', 'Leisure', 'Side'])
  // the Arc model: two spaces on one Arc profile share one camber profile (one cookie jar)
  assert.deepStrictEqual(spaces.map((s) => s.profile), ['default', 'arc-profile-2', 'arc-profile-2'])
  assert.deepStrictEqual(spaces[2].pinned.map((t) => t.url), ['https://side.example.com/'])
  assert.strictEqual(spaces[0].color, '#ff8000')

  const [work, home] = spaces
  // tab, folder, and the two halves of a split view
  assert.deepStrictEqual(work.pinned.map((it) => it.title), ['Renamed Inbox', 'Docs', 'Left', 'Right'])
  // a renamed Arc tab keeps its Arc name as a fixed label
  assert.strictEqual(work.pinned[0].name, 'Renamed Inbox')
  // unpinned tabs come over as unpinned tabs
  assert.deepStrictEqual(work.today.map((t) => t.url), ['https://today.example.com/'])
  assert.strictEqual(home.today.length, 0)
  assert.strictEqual(home.pinned.length, 1)

  // favorites per profile; for a synced profile, this machine's container wins
  assert.deepStrictEqual(favorites.default.map((t) => t.name), ['Calendar', 'Chat'])
  assert.deepStrictEqual(favorites['arc-profile-2'].map((t) => t.url), ['https://music.example.com/'])

  // folders keep their full depth: Docs > Old > Older
  const docs = work.pinned[1]
  assert.deepStrictEqual(docs.children.map((t) => t.url || t.title), ['https://docs.example.com/a', 'https://docs.example.com/b', 'Old'])
  const old = docs.children[2]
  assert.deepStrictEqual(old.children.map((t) => t.url || t.title), ['https://old.example.com/', 'Older'])
  assert.deepStrictEqual(old.children[1].children.map((t) => t.url), ['https://older.example.com/'])
})

test('re-importing replaces spaces from the same Arc space instead of duplicating', () => {
  let n = 0
  const uid = () => 'id' + n++
  const fixture = require('./arc-fixture.json')
  const state = { spaces: [{ id: 'mine', name: 'Mine', pinned: [], today: [] }], favorites: {} }

  assert.deepStrictEqual(merge(state, convert(fixture, uid)), [])
  const first = state.spaces.map((s) => s.id)
  const gone = merge(state, convert(fixture, uid))

  assert.deepStrictEqual(state.spaces.map((s) => s.name), ['Mine', 'Work', 'Leisure', 'Side'])
  assert.notDeepStrictEqual(state.spaces.map((s) => s.id), first)
  assert.strictEqual(state.favorites.default.length, 2)
  // every tab of the first import is reported gone: 7 pinned + 1 today in Work, 1 in Leisure, 1 in Side, 3 favorites
  assert.strictEqual(gone.length, 13)
})
