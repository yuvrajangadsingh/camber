const test = require('node:test')
const assert = require('node:assert')
const { convert } = require('../arc')

test('imports spaces, pinned tabs and folders from an Arc sidebar file', () => {
  let n = 0
  const spaces = convert(require('./arc-fixture.json'), () => 'id' + n++)

  assert.deepStrictEqual(spaces.map((s) => s.name), ['Work', 'Leisure'])
  assert.deepStrictEqual(spaces.map((s) => s.profile), ['default', 'arc-profile-2'])
  assert.strictEqual(spaces[0].color, '#ff8000')

  const [work, home] = spaces
  // tab, folder, and the two halves of a split view; unpinned tabs are not imported
  assert.deepStrictEqual(work.pinned.map((it) => it.title), ['Renamed Inbox', 'Docs', 'Left', 'Right'])
  // a renamed Arc tab keeps its Arc name as a fixed label
  assert.strictEqual(work.pinned[0].name, 'Renamed Inbox')
  assert.strictEqual(work.today.length, 0)
  assert.strictEqual(home.pinned.length, 1)

  // folders keep their full depth: Docs > Old > Older
  const docs = work.pinned[1]
  assert.deepStrictEqual(docs.children.map((t) => t.url || t.title), ['https://docs.example.com/a', 'https://docs.example.com/b', 'Old'])
  const old = docs.children[2]
  assert.deepStrictEqual(old.children.map((t) => t.url || t.title), ['https://old.example.com/', 'Older'])
  assert.deepStrictEqual(old.children[1].children.map((t) => t.url), ['https://older.example.com/'])
})
