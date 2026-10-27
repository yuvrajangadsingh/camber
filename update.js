// Release check: tells the sidebar when GitHub has a newer camber. Nothing is downloaded.

const RELEASES = 'https://api.github.com/repos/yuvrajangadsingh/camber/releases/latest'
const PAGE = 'https://github.com/yuvrajangadsingh/camber/releases/'

// "v1.2.3" -> [1, 2, 3, prerelease?]; anything else -> null
function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(-\S+)?$/.exec(String(v).trim())
  return m && [+m[1], +m[2], +m[3], !!m[4]]
}

function isNewer(latest, current) {
  const a = parse(latest), b = parse(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return b[3] && !a[3] // 1.0.0 is newer than 1.0.0-beta
}

// Resolves to { version, url } when a newer release exists, else null. Never throws:
// a 404 (private repo, no releases), no network or odd JSON all mean "nothing to show".
async function check(current, fetchFn = fetch, url = RELEASES) {
  try {
    const res = await fetchFn(url, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return null
    const { tag_name: tag, html_url: page } = await res.json()
    // only ever link to this repo's release pages
    if (!isNewer(tag, current) || typeof page !== 'string' || !page.startsWith(PAGE)) return null
    return { version: String(tag).replace(/^v/, ''), url: page }
  } catch {
    return null
  }
}

module.exports = { isNewer, check }
