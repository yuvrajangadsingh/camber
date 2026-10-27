// CI smoke test: node .github/smoke.mjs <app executable> <screenshot.png> [extra app args]
// Starts the built app with the synthetic Arc fixture, imports it over CDP, checks the
// sidebar has spaces, and saves a screenshot of it. Exits non-zero on any failure.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [exe, out, ...extra] = process.argv.slice(2)
const port = 9334
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const app = spawn(exe, ['--demo', `--remote-debugging-port=${port}`, ...extra], {
  env: { ...process.env, CAMBER_ARC_FILE: resolve('test/arc-fixture.json') },
  stdio: 'inherit',
})
app.on('exit', (code) => console.log('app exited', code))

function fail(msg) {
  console.error('SMOKE FAIL:', msg)
  app.kill()
  process.exit(1)
}

let target
for (let i = 0; i < 90 && !target; i++) {
  await sleep(1000)
  if (app.exitCode !== null) fail('app exited before CDP came up')
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.url.includes('ui.html'))
  } catch {}
}
if (!target) fail('no ui.html target on CDP')

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0
const pending = new Map()
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id) }
const call = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value

await evaluate("camber.send('importArc')")
await sleep(3000)
const seen = await evaluate(`({
  platform: navigator.userAgent,
  spaces: (typeof current === 'undefined' ? [] : current.spaces).map((s) => s.name),
  favorites: document.querySelectorAll('#favs .fav').length,
  sidebar: document.getElementById('tabs').innerText.replace(/\\n/g, ' | '),
})`)
console.log(JSON.stringify(seen, null, 2))

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log('saved', out)

ws.close()
app.kill()
if (!seen?.spaces?.length) fail('sidebar has no spaces')
process.exit(0)
