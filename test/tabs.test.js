const test = require('node:test')
const assert = require('node:assert')
const { touch, afterClose, move } = require('../tabs')

test('closing a tab goes back to the one used before it', () => {
  let mru = []
  for (const id of ['a', 'b', 'c', 'b', 'd']) mru = touch(mru, id)
  assert.deepStrictEqual(mru, ['d', 'b', 'c', 'a'])

  const ids = ['p1', 'a', 'b', 'c', 'd']
  assert.strictEqual(afterClose('d', mru, ids, ['a', 'b', 'c'], []), 'b')
  // b was closed earlier and is gone from the space
  assert.strictEqual(afterClose('d', mru, ['p1', 'a', 'c', 'd'], ['a', 'c'], []), 'c')
  // nothing in the history is left: first today tab, then a loaded tab, then anything
  assert.strictEqual(afterClose('d', [], ids, ['c', 'a'], ['b']), 'c')
  assert.strictEqual(afterClose('d', [], ['p1', 'p2', 'd'], [], ['p2']), 'p2')
  assert.strictEqual(afterClose('d', undefined, ['p1', 'd'], [], []), 'p1')
  assert.strictEqual(afterClose('d', ['d'], ['d'], [], ['d']), undefined)

  assert.strictEqual(touch(Array.from({ length: 60 }, (_, i) => 'x' + i), 'new').length, 50)
})

test('drag and drop moves tabs within and across pinned, folders and today', () => {
  const space = () => ({
    pinned: [{ id: 'p1' }, { id: 'f', open: false, children: [{ id: 'c1' }, { id: 'g', children: [{ id: 'g1' }] }] }, { id: 'p2' }],
    today: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
  })
  const ids = (list) => list.map((it) => it.id)
  let s = space()

  assert.strictEqual(move(s, 't3', 't1', 'before'), true)
  assert.deepStrictEqual(ids(s.today), ['t3', 't1', 't2'])
  move(s, 't3', 't2', 'after')
  assert.deepStrictEqual(ids(s.today), ['t1', 't2', 't3'])

  // today -> pinned pins it, pinned -> today unpins it
  move(s, 't1', 'p2', 'before')
  assert.deepStrictEqual(ids(s.pinned), ['p1', 'f', 't1', 'p2'])
  assert.deepStrictEqual(ids(s.today), ['t2', 't3'])
  move(s, 'p1', 'today')
  assert.deepStrictEqual(ids(s.today), ['p1', 't2', 't3'])
  move(s, 't3', 'pinned')
  assert.deepStrictEqual(ids(s.pinned), ['f', 't1', 'p2', 't3'])

  // into a folder (it opens), into a nested one, and back out
  move(s, 'p2', 'f', 'inside')
  assert.deepStrictEqual(ids(s.pinned[0].children), ['c1', 'g', 'p2'])
  assert.strictEqual(s.pinned[0].open, true)
  move(s, 't2', 'g1', 'after')
  assert.deepStrictEqual(ids(s.pinned[0].children[1].children), ['g1', 't2'])
  move(s, 'c1', 'f', 'before')
  assert.deepStrictEqual(ids(s.pinned), ['c1', 'f', 't1', 't3'])

  // nothing changes for folders, unknown ids, or a tab dropped on itself
  s = space()
  for (const [id, target] of [['f', 'today'], ['nope', 'p1'], ['t1', 'nope'], ['t1', 't1']]) assert.strictEqual(move(s, id, target, 'before'), false)
  assert.deepStrictEqual(s, space())
})
