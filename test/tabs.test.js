const test = require('node:test')
const assert = require('node:assert')
const { touch, afterClose } = require('../tabs')

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
