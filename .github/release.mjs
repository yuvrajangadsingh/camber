// Release assembly: node .github/release.mjs <tag> <artifacts dir> <out dir>
// Run by the release job on a v* tag. Finds every installer the build jobs made, checks the
// updater files (latest*.yml) against them by size and sha512, writes SHA256SUMS.txt and takes the
// release notes from CHANGELOG.md. Exits non-zero on anything missing or mismatched, so a draft
// is never made from an incomplete set.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [tag, from, out] = process.argv.slice(2)
const fail = (msg) => { console.error('release:', msg); process.exit(1) }
if (!tag || !from || !out) fail('usage: release.mjs <tag> <artifacts dir> <out dir>')

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
if (tag !== 'v' + version) fail(`tag ${tag} does not match package.json version ${version}`)
// a draft is made as a normal release, and the updater would hand a published 1.0.0-beta.1 to everyone
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`${version}: only plain x.y.z versions are released by this job`)

const installers = ['arm64.dmg', 'x64.dmg', 'x64.exe', 'x86_64.AppImage', 'arm64.AppImage', 'amd64.deb', 'arm64.deb'].map((s) => `camber-${version}-${s}`)
// latest-mac.yml is left out: macOS builds are ad hoc signed and do not update themselves
const updaterFiles = ['latest.yml', 'latest-linux.yml', 'latest-linux-arm64.yml']
// lets the Windows updater download only the changed blocks next time
const extras = [`camber-${version}-x64.exe.blockmap`]

const found = new Map()
for (const f of fs.readdirSync(from, { recursive: true })) {
  const name = path.basename(f)
  if (![...installers, ...updaterFiles, ...extras].includes(name)) continue
  if (found.has(name)) fail(`${name} came out of more than one build job`)
  found.set(name, path.join(from, f))
}
const missing = [...installers, ...updaterFiles, ...extras].filter((n) => !found.has(n))
if (missing.length) fail('missing: ' + missing.join(', '))

const digest = (file, algo, enc) => createHash(algo).update(fs.readFileSync(file)).digest(enc)

// each latest*.yml is electron-builder's own output: a version line and "- url / sha512 / size" entries
for (const y of updaterFiles) {
  const text = fs.readFileSync(found.get(y), 'utf8')
  if (!new RegExp(`^version: ${version.replace(/\./g, '\\.')}$`, 'm').test(text)) fail(`${y} is not for ${version}`)
  const entries = [...text.matchAll(/- url: (\S+)\n\s+sha512: (\S+)\n\s+size: (\d+)/g)]
  if (!entries.length) fail(`${y} lists no files`)
  for (const [, url, sha512, size] of entries) {
    const file = found.get(url)
    if (!file) fail(`${y} points at ${url}, which is not in this release`)
    if (fs.statSync(file).size !== +size) fail(`${y}: ${url} size differs`)
    if (digest(file, 'sha512', 'base64') !== sha512) fail(`${y}: ${url} sha512 differs`)
  }
}

const notes = fs.readFileSync('CHANGELOG.md', 'utf8').split(/^## /m).find((s) => s.startsWith(version + ' '))
if (!notes) fail(`CHANGELOG.md has no "## ${version} (date)" section`)

fs.mkdirSync(out, { recursive: true })
for (const [name, file] of found) fs.copyFileSync(file, path.join(out, name))
const sums = installers.map((n) => `${digest(found.get(n), 'sha256', 'hex')}  ${n}`).join('\n') + '\n'
fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), sums)
fs.writeFileSync(path.join(path.dirname(out), 'notes.md'), notes.slice(notes.indexOf('\n') + 1).trim() + '\n')
console.log(sums)
