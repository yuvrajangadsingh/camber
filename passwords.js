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
  vault.logins = [{ origin, username, secret, used: now }, ...vault.logins.filter((l) => l !== match(vault, origin, username))]
}

// a site's logins, the one used last first. Only the exact origin: a subdomain or another port gets nothing.
const forSite = (vault, origin) => vault.logins.filter((l) => l.origin === origin).sort((a, b) => b.used - a.used)

module.exports = { site, match, put, forSite }
