const test = require('node:test')
const assert = require('node:assert')
const { isNewer, check } = require('../update')

test('compares release versions', () => {
  assert.strictEqual(isNewer('v0.2.0', '0.1.0'), true)
  assert.strictEqual(isNewer('0.1.10', '0.1.9'), true)
  assert.strictEqual(isNewer('v1.0.0', '0.9.9'), true)
  assert.strictEqual(isNewer('v1.0.0', '1.0.0-beta.2'), true)
  assert.strictEqual(isNewer('v0.1.0', '0.1.0'), false)
  assert.strictEqual(isNewer('v0.0.9', '0.1.0'), false)
  assert.strictEqual(isNewer('v1.0.0-beta.1', '1.0.0'), false)
  assert.strictEqual(isNewer('nightly', '0.1.0'), false)
  assert.strictEqual(isNewer(undefined, '0.1.0'), false)
})

test('checks GitHub quietly', async () => {
  const reply = (status, body) => async () => ({ ok: status === 200, status, json: async () => body })
  const page = 'https://github.com/yuvrajangadsingh/camber/releases/tag/v0.2.0'
  assert.deepStrictEqual(await check('0.1.0', reply(200, { tag_name: 'v0.2.0', html_url: page })), { version: '0.2.0', url: page })
  assert.strictEqual(await check('0.2.0', reply(200, { tag_name: 'v0.2.0', html_url: page })), null)
  // private repo or no release yet
  assert.strictEqual(await check('0.1.0', reply(404, { message: 'Not Found' })), null)
  // no network
  assert.strictEqual(await check('0.1.0', async () => { throw new TypeError('fetch failed') }), null)
  // a release page anywhere else is never offered
  assert.strictEqual(await check('0.1.0', reply(200, { tag_name: 'v9.0.0', html_url: 'https://example.com/x' })), null)
})
