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
  assert.strictEqual(work.today.length, 0)
  assert.strictEqual(home.pinned.length, 1)

  // one folder level: the nested "Old" folder's tab lands in "Docs"
  const docs = work.pinned[1]
  assert.deepStrictEqual(docs.children.map((t) => t.url), [
    'https://docs.example.com/a',
    'https://docs.example.com/b',
    'https://old.example.com/',
  ])
  assert.ok(docs.children.every((t) => !t.children))
})
