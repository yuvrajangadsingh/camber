const test = require('node:test')
const assert = require('node:assert')
const { site, match, put, forSite } = require('../passwords')

test('passwords are only for https pages and local http', () => {
  assert.strictEqual(site('https://github.com'), 'https://github.com')
  assert.strictEqual(site('https://github.com:8443'), 'https://github.com:8443')
  assert.strictEqual(site('http://localhost:3000'), 'http://localhost:3000')
  assert.strictEqual(site('http://127.0.0.1:8080'), 'http://127.0.0.1:8080')
  assert.strictEqual(site('http://example.com'), null)
  assert.strictEqual(site('http://localhost.example.com'), null)
  assert.strictEqual(site('file://'), null)
  assert.strictEqual(site('chrome-extension://abcdefgh'), null)
  // an opaque origin (sandboxed frame, data: page) reads as the string null
  assert.strictEqual(site('null'), null)
  assert.strictEqual(site(undefined), null)
})

test('saving a login again replaces its password and keeps the others', () => {
  const vault = { logins: [], never: [] }
  put(vault, 'https://a.example', 'ann', 's1', 1)
  put(vault, 'https://a.example', 'bob', 's2', 2)
  put(vault, 'https://b.example', 'ann', 's3', 3)
  put(vault, 'https://a.example', 'ann', 's4', 4)
  assert.strictEqual(vault.logins.length, 3)
  assert.deepStrictEqual(match(vault, 'https://a.example', 'ann'), { origin: 'https://a.example', username: 'ann', secret: 's4', used: 4 })
  assert.strictEqual(match(vault, 'https://b.example', 'ann').secret, 's3')
  assert.strictEqual(match(vault, 'https://a.example', 'Ann'), undefined)
})

test('a site gets its own logins only, the last used first', () => {
  const vault = { logins: [], never: [] }
  put(vault, 'https://a.example', 'old', 's1', 1)
  put(vault, 'https://a.example', 'new', 's2', 5)
  put(vault, 'https://login.a.example', 'sub', 's3', 9)
  put(vault, 'http://localhost:3000', 'dev', 's4', 9)
  assert.deepStrictEqual(forSite(vault, 'https://a.example').map((l) => l.username), ['new', 'old'])
  assert.deepStrictEqual(forSite(vault, 'http://localhost:3001'), [])
  assert.deepStrictEqual(forSite(vault, 'https://evil.example'), [])
})
