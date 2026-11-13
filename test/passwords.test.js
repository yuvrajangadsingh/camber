const test = require('node:test')
const assert = require('node:assert')
const { site, match, put, forSite, csv, fromCsv } = require('../passwords')

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

test('reads quoted CSV fields with commas, quotes and line breaks', () => {
  assert.deepStrictEqual(csv('a,b\r\n"x,1","say ""hi"""\n"two\nlines",\n\n'), [['a', 'b'], ['x,1', 'say "hi"'], ['two\nlines', '']])
  assert.deepStrictEqual(csv(''), [])
})

test('imports logins from Chrome, Firefox, Safari and Bitwarden exports', () => {
  const chrome = '\uFEFFname,url,username,password,note\n' +
    'a,https://a.example/login?next=1,ann,"p,w""1",\n' +
    'dev,http://localhost:3000/,dev,devpw,\n' +
    'plain,http://insecure.example/,x,y,\n' +
    'empty,https://nopass.example/,z,,\n' +
    'app,android://abc@com.example/,q,r,\n' +
    'multi,https://m.example/,"two\nlines",pw,"a note\nover lines"\n'
  const got = fromCsv(chrome)
  assert.deepStrictEqual(got.logins, [
    { origin: 'https://a.example', username: 'ann', password: 'p,w"1' },
    { origin: 'http://localhost:3000', username: 'dev', password: 'devpw' },
    { origin: 'https://m.example', username: 'two\nlines', password: 'pw' },
  ])
  assert.strictEqual(got.skipped, 3)
  const firefox = '"url","username","password","httpRealm","formActionOrigin","guid"\n"https://f.example","fox","fpw","","https://f.example","{1}"\n'
  assert.deepStrictEqual(fromCsv(firefox).logins, [{ origin: 'https://f.example', username: 'fox', password: 'fpw' }])
  const safari = 'Title,URL,Username,Password,Notes,OTPAuth\nS,https://s.example/,sam,spw,,\n'
  assert.deepStrictEqual(fromCsv(safari).logins, [{ origin: 'https://s.example', username: 'sam', password: 'spw' }])
  const bitwarden = 'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n,,login,B,,,0,https://b.example/,bo,bpw,\n,,note,N,,,0,,,,\n'
  assert.deepStrictEqual(fromCsv(bitwarden), { logins: [{ origin: 'https://b.example', username: 'bo', password: 'bpw' }], skipped: 1 })
  // no username column: logins with an empty name; no url or password column: not an export
  assert.deepStrictEqual(fromCsv('url,password\nhttps://n.example,npw\n').logins, [{ origin: 'https://n.example', username: '', password: 'npw' }])
  assert.strictEqual(fromCsv('name,email\nx,y\n'), null)
  assert.strictEqual(fromCsv(''), null)
})

test('a CSV with broken quoting is refused, never read with its columns shifted', () => {
  assert.throws(() => csv('url,username,password\nhttps://a.example,al"ice,SECRET1\nhttps://b.example,"bob,SECRET2\n'), /quote that doesn't close/)
  assert.throws(() => csv('a,"b"c,d\n'), /text after a closing quote/)
  assert.throws(() => fromCsv('url,username,password\nhttps://a.example,"ann"x,pw\n'), /row 2/)
  // a quote inside a field that didn't start with one is kept as it is
  assert.deepStrictEqual(csv('a,al"ice,"x""y"\n'), [['a', 'al"ice', 'x"y']])
  assert.deepStrictEqual(csv('"a","",b'), [['a', '', 'b']])
})

test('saving thousands of logins stays quick', () => {
  const vault = { logins: [], never: [] }
  const t0 = Date.now()
  for (let i = 0; i < 5000; i++) put(vault, 'https://s' + i + '.example', 'u', 's', i)
  put(vault, 'https://s1.example', 'u', 'new', 9999)
  assert.strictEqual(vault.logins.length, 5000)
  assert.strictEqual(match(vault, 'https://s1.example', 'u').secret, 'new')
  assert.ok(Date.now() - t0 < 2000, 'took ' + (Date.now() - t0) + ' ms')
})
