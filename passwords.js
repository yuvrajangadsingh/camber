// Saved logins, kept in passwords.json: { logins: [{ origin, username, secret, used }], never: [origin] }.
// `secret` is the password after the OS keychain sealed it (main.js does that), so nothing here reads one.

// where a password may be saved or filled: https pages, and plain http only on this machine (local development)
function site(origin) {
  let u
  try { u = new URL(origin) } catch { return null }
  const local = u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  return u.protocol === 'https:' || local ? u.origin : null
}

const match = (vault, origin, username) => vault.logins.find((l) => l.origin === origin && l.username === username)

// one login per site and username: saving it again replaces the password
function put(vault, origin, username, secret, now) {
  const old = match(vault, origin, username)
  vault.logins = [{ origin, username, secret, used: now }, ...vault.logins.filter((l) => l !== old)]
}

// a site's logins, the one used last first. Only the exact origin: a subdomain or another port gets nothing.
const forSite = (vault, origin) => vault.logins.filter((l) => l.origin === origin).sort((a, b) => b.used - a.used)

// RFC 4180 CSV: a field that starts with a quote may hold commas, doubled quotes and line breaks; rows end
// in LF or CRLF. A quote that never closes, or text right after a closing quote, throws: read loosely, it
// would shift the columns and could put a password where a username goes, which isn't sealed.
// A quote inside a field that didn't start with one is just a character.
function csv(text) {
  const rows = [[]]
  let field = '', quoted = false, fresh = true
  const end = () => { rows.at(-1).push(field); field = ''; fresh = true }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') { field += '"'; i++ }
      else if (i + 1 < text.length && !',\r\n'.includes(text[i + 1])) throw new Error(`row ${rows.length}: text after a closing quote`)
      else quoted = false
    } else if (c === '"' && fresh) { quoted = true; fresh = false }
    else if (c === ',') end()
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      end()
      rows.push([])
    } else { field += c; fresh = false }
  }
  if (quoted) throw new Error(`row ${rows.length}: a quote that doesn't close`)
  end()
  return rows.filter((r) => r.some((f) => f !== ''))
}

// the logins in a password export. Chrome, Arc, Edge, Brave, Firefox, Safari, 1Password and Bitwarden all
// name the columns url (Bitwarden login_uri), username (login_username) and password (login_password), in
// any case. A row is kept for a site passwords can be saved for, with a password; null when the columns
// aren't there.
function fromCsv(text) {
  const [head = [], ...rows] = csv(text.replace(/^\uFEFF/, ''))
  const col = (...names) => head.findIndex((h) => names.includes(h.trim().toLowerCase()))
  const [u, n, p] = [col('url', 'login_uri'), col('username', 'login_username'), col('password', 'login_password')]
  if (u < 0 || p < 0) return null
  const logins = []
  for (const r of rows) {
    const origin = site(r[u]?.trim())
    if (origin && r[p]) logins.push({ origin, username: r[n] ?? '', password: r[p] })
  }
  return { logins, skipped: rows.length - logins.length }
}

module.exports = { site, match, put, forSite, csv, fromCsv }
