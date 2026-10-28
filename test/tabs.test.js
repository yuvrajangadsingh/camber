const test = require('node:test')
const assert = require('node:assert')
const { touch, forget, afterClose, move, prune, web, loadable, permKeys, permission, checked, asker, pairOk, route: tabsRoute } = require('../tabs')

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

  // 50 closed tabs don't push a live one out of the history
  let s = { activeId: 'a', mru: ['a', 'p'] }
  for (let i = 0; i < 50; i++) {
    s.mru = touch(s.mru, 't' + i)
    forget(s, ['t' + i])
    s.mru = touch(s.mru, 'a')
  }
  assert.deepStrictEqual(s.mru, ['a', 'p'])
  assert.strictEqual(afterClose('a', s.mru, ['p', 'a', 'x'], ['x'], ['p', 'a']), 'p')
  // a selected tab that goes is replaced by the one before it, or nothing
  forget(s, ['a'])
  assert.deepStrictEqual(s, { activeId: 'p', mru: ['p'] })
  forget(s, ['p'])
  assert.deepStrictEqual(s, { activeId: null, mru: [] })
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

  // an old pinned tab unpinned (Cmd+D or drag) counts as just used, so the next archive keeps it
  s = { activeId: 'x', pinned: [{ id: 'old', lastActive: 0 }], today: [] }
  move(s, 'old', 'today', undefined, 100 * 3600000)
  assert.deepStrictEqual(prune({ active: 0, spaces: [s] }, 100 * 3600000, 12), [])

  // nothing changes for folders, unknown ids, or a tab dropped on itself
  s = space()
  for (const [id, target] of [['f', 'today'], ['nope', 'p1'], ['t1', 'nope'], ['t1', 't1']]) assert.strictEqual(move(s, id, target, 'before'), false)
  assert.deepStrictEqual(s, space())
})

test('archives today tabs that sat unused past the limit', () => {
  const h = 3600000, now = 100 * h
  const state = () => ({
    active: 0,
    spaces: [
      { activeId: 'shown', pinned: [{ id: 'pin', lastActive: 0 }], today: [{ id: 'shown', lastActive: 0 }, { id: 'old', lastActive: now - 13 * h }, { id: 'fresh', lastActive: now - 11 * h }, { id: 'new' }] },
      { activeId: 'old2', pinned: [], today: [{ id: 'old2', lastActive: now - 30 * h }, { id: 'mid', lastActive: now - 20 * h }] },
    ],
  })

  let s = state()
  assert.deepStrictEqual(prune(s, now, 12), ['old', 'old2', 'mid'])
  assert.deepStrictEqual(s.spaces[0].today.map((t) => t.id), ['shown', 'fresh', 'new'])
  assert.strictEqual(s.spaces[0].today[2].lastActive, now)
  assert.strictEqual(s.spaces[0].pinned.length, 1)
  // the background space's selected tab went: no dangling selection or history left behind
  assert.strictEqual(s.spaces[1].activeId, null)
  assert.deepStrictEqual(s.spaces[1].mru, [])

  // the other pane of the shown split is on screen too; a split the active tab isn't in is not
  s = state()
  s.spaces[0].split = ['shown', 'old']
  s.spaces[1].split = ['old2', 'mid']
  assert.deepStrictEqual(prune(s, now, 12), ['old2', 'mid'])

  s = state()
  assert.deepStrictEqual(prune(s, now, 24), ['old2'])
  s = state()
  assert.deepStrictEqual(prune(s, now, 0), [])
  assert.deepStrictEqual(s, state())
})

test('links route to a space by host, subdomains included, never by substring', () => {
  const routes = [{ host: 'github.com', spaceId: 'work' }, { host: 'gist.github.com', spaceId: 'side' }, { host: 'news.ycombinator.com', spaceId: 'fun' }]
  const route = (r, url, ids = ['work', 'side', 'fun']) => tabsRoute(r, url, ids)
  assert.strictEqual(route(routes, 'https://github.com/a/b'), 'work')
  assert.strictEqual(route(routes, 'https://www.github.com/'), 'work')
  assert.strictEqual(route(routes, 'https://GITHUB.com/x'), 'work')
  assert.strictEqual(route(routes, 'https://gist.github.com/x'), 'side')
  assert.strictEqual(route(routes, 'https://a.gist.github.com/x'), 'side')
  assert.strictEqual(route(routes, 'https://notgithub.com/'), undefined)
  assert.strictEqual(route(routes, 'https://github.com.evil.io/'), undefined)
  assert.strictEqual(route(routes, 'https://ycombinator.com/'), undefined)
  assert.strictEqual(route(routes, 'not a url'), undefined)
  assert.strictEqual(route(undefined, 'https://github.com/'), undefined)
  // a rule for a space that is gone is skipped, so it can't hide a broader rule that still works
  assert.strictEqual(route(routes, 'https://gist.github.com/x', ['work']), 'work')
  assert.strictEqual(route(routes, 'https://github.com/', []), undefined)
})

test('only http, https and about:blank pass as outside input', () => {
  for (const u of ['https://github.com/', 'http://localhost:3000/x', 'HTTPS://Example.com', 'about:blank']) assert.strictEqual(web(u), true, u)
  for (const u of ['javascript:alert(1)', 'JavaScript:alert(1)', 'file:///etc/passwd', 'data:text/html,hi', 'chrome://settings', 'about:config',
    'chrome-extension://abc/x.html', 'ftp://x.com/', '/Applications/camber.app', '--flag', 'github.com', '', undefined, null]) assert.strictEqual(web(u), false, String(u))
})

test('tabs load web and extension pages, never local files or scripts', () => {
  for (const u of ['https://github.com/', 'about:blank', 'chrome-extension://abcdefgh/popup.html']) assert.strictEqual(loadable(u), true, u)
  for (const u of ['file:///etc/hosts', 'FILE:///etc/hosts', 'data:text/html,hi', 'javascript:alert(1)', 'chrome://settings', 'chrome-extension:x', 'view-source:https://a.com', undefined])
    assert.strictEqual(loadable(u), false, String(u))
})

test('a split is two different tabs of its own space', () => {
  const ids = ['a', 'b', 'fav']
  assert.strictEqual(pairOk(['a', 'b'], ids), true)
  assert.strictEqual(pairOk(['fav', 'a'], ids), true)
  // b moved to another space, a duplicate, the wrong length, junk from state.json
  for (const split of [['a', 'x'], ['a', 'a'], ['a'], ['a', 'b', 'fav'], null, 'ab', {}]) assert.strictEqual(pairOk(split, ids), false, JSON.stringify(split))
})

test('a site gets a permission only after its own approval', () => {
  const perms = { 'https://meet.example': { microphone: true, camera: false }, 'https://maps.example': { geolocation: true } }
  const ask = (origin, name, media) => permission(perms, origin, name, permKeys(name, media))
  assert.strictEqual(ask('https://meet.example', 'media', ['audio']), true)
  assert.strictEqual(ask('https://meet.example', 'media', ['video']), false)
  // one blocked device blocks the request; one unknown device means asking
  assert.strictEqual(ask('https://meet.example', 'media', ['audio', 'video']), false)
  assert.strictEqual(ask('https://maps.example', 'media', ['audio']), undefined)
  assert.strictEqual(ask('https://other.example', 'media', ['audio']), undefined)
  assert.strictEqual(ask('https://maps.example', 'geolocation'), true)
  assert.strictEqual(ask('https://meet.example', 'geolocation'), undefined)
  assert.strictEqual(ask('https://other.example', 'media', []), undefined)
  assert.strictEqual(ask('https://other.example', 'media', ['unknown']), undefined)
  assert.deepStrictEqual(permKeys('media', ['audio', 'video']), ['microphone', 'camera'])
  // not on the ask list, or not a web page: denied without asking
  assert.strictEqual(ask('https://maps.example', 'openExternal'), false)
  assert.strictEqual(ask('file://', 'media', ['audio']), false)
  assert.strictEqual(ask('', 'notifications'), false)
  assert.strictEqual(ask('https://other.example', 'fullscreen'), true)
  assert.strictEqual(ask('chrome-extension://abc', 'notifications'), true)
})

test('an undecided site reads notifications and media as askable, a blocked one as denied', () => {
  const perms = { 'https://a.example': { notifications: false, camera: false } }
  const look = (origin, name, media) => checked(perms, origin, name, permKeys(name, media))
  assert.strictEqual(look('https://b.example', 'notifications'), true)
  assert.strictEqual(look('https://b.example', 'media', ['video']), true)
  assert.strictEqual(look('https://b.example', 'media', ['unknown']), true)
  assert.strictEqual(look('https://a.example', 'notifications'), false)
  assert.strictEqual(look('https://a.example', 'media', ['video']), false)
  // the rest stays a plain no until asked, and never-asked names and non-web pages stay denied
  assert.strictEqual(look('https://b.example', 'geolocation'), false)
  assert.strictEqual(look('https://b.example', 'openExternal'), false)
  assert.strictEqual(look('file://', 'notifications'), false)
})

test('one permission dialog at a time, and the same question is asked once', async () => {
  const ask = asker(3), shown = [], answers = []
  const dialog = (name, ok) => () => { shown.push(name); return new Promise((r) => answers.push(() => r(ok))) }
  const tick = () => new Promise(setImmediate)
  const a1 = ask('a mic', dialog('a mic', false)), a2 = ask('a mic', dialog('a mic again', true))
  const b = ask('b mic', dialog('b mic', true))
  ask('c mic', dialog('c mic', true))
  assert.strictEqual(a1, a2)
  // a fourth question while three wait is refused without a dialog
  assert.strictEqual(await ask('d mic', dialog('d mic', true)), false)
  await tick()
  assert.deepStrictEqual(shown, ['a mic']) // b waits for a's dialog to close
  answers.shift()()
  assert.deepStrictEqual([await a1, await a2], [false, false])
  await tick()
  assert.deepStrictEqual(shown, ['a mic', 'b mic'])
  answers.shift()()
  assert.strictEqual(await b, true)
  // once answered, the same key can be asked again (the caller remembers answers, not this queue)
  await tick()
  answers.shift()()
  await tick()
  ask('a mic', dialog('a mic later', true))
  await tick()
  assert.deepStrictEqual(shown, ['a mic', 'b mic', 'c mic', 'a mic later'])
})
