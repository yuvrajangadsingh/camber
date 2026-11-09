// Password save and fill, in the top frame of every page. This runs in the preload's own world: the
// page can't see these functions or reach the ipc, and main.js takes the site from the frame, not from here.
const { ipcRenderer } = require('electron')

const TEXT = ['text', 'email', 'tel']
const shown = (el) => el.getClientRects().length > 0
// a password-type box that holds no password: a card's security code, a one-time code, a short PIN.
// Saving one would put a card number or a throwaway code in the list, and filling one would hand a
// saved password to the wrong field, so this is asked every time, also of a box seen before.
// ponytail: a site whose password is a PIN of six or less, or is called "pin", is left alone too
const other = (i) => /\bcc-|one-time-code/.test(i.autocomplete) || (i.maxLength > 0 && i.maxLength <= 6) ||
  /cvv|cvc|csc|card|otp|totp|mfa|2fa|(?<![a-z])pin(?![a-z])/i.test(i.name + ' ' + i.id)
// a box that was of type password stays a password box after a "show password" button makes it text
const known = new WeakSet()
const isBox = (i) => !other(i) && (known.has(i) || (i.type === 'password' && !!known.add(i)))
const boxes = () => [...document.querySelectorAll('input')].filter((i) => isBox(i) && shown(i))
// main.js asks this, in this world, to see whether a sign-in went through
window.camberBoxShown = () => boxes().length > 0
const named = (i) => i.type === 'email' || /username|email/.test(i.autocomplete) ||
  [i.name, i.id].some((n) => /^(user(_?name)?|e-?mail|login(_?(id|field))?|identifier)$/i.test(n))

// the username box that goes with a password box, among the inputs before it in its form (or on the
// page): one shown and marked as a username, else the last text box shown, else a hidden one that a
// sign-in asking for the name first carries along
function nameBox(pw) {
  // by form owner, not by nesting: an input outside the form can be tied to it with a form attribute
  const all = [...document.querySelectorAll('input')].filter((i) => !pw.form || i.form === pw.form)
  const before = all.slice(0, all.indexOf(pw)).filter((i) => !isBox(i))
  const text = before.filter((i) => TEXT.includes(i.type) && shown(i))
  return text.filter(named).pop() || text.pop() || before.filter((i) => [...TEXT, 'hidden'].includes(i.type) && named(i)).pop()
}

// Fill: a sign-in form that shows up empty gets the saved login. With several saved for the site the
// last used one goes in, and typing another saved username brings its password.
let saved = null // this site's logins, kept so a change of name can swap the password without a wait
let typed // the name for a form with no name box: what this page last sent off, else what main.js kept from the page before
let asking = null
const ask = () => ipcRenderer.invoke('logins').then((r) => { saved = r.logins; typed ??= r.typed })
// a box that holds a password camber put there is matched to the name on its form once more
const recheck = () => { const pw = saved && signIn(); if (pw?.value && !taken(pw)) put(pw) }
// a login saved, changed or deleted in main.js: a page that holds the list gets the new one, and a
// password it filled in from the old list is put right
ipcRenderer.on('logins-changed', () => { if (asking) asking = asking.then(ask).then(recheck) })
const tried = new WeakSet()
const mine = new WeakMap() // password box -> the password put there
const set = (el, value) => { el.value = value; for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true })) }
const taken = (pw) => pw.value && pw.value !== mine.get(pw) // the user or the page put a password there
// the sign-in box: alone in its form (two are a sign-up or a change of password) and not asking for a new password
function signIn() {
  const all = boxes()
  return all.find((b) => !/new-password/.test(b.autocomplete) && all.filter((o) => o.form === b.form).length === 1)
}
// puts the login that goes with the name on the form into `pw`, and takes a filled one back out as soon
// as the name stops matching. `typing`: the user is editing the name, so the name box is left alone
function put(pw, typing) {
  if (signIn() !== pw || taken(pw)) return
  const name = nameBox(pw)
  // the name on the form, or with no name box on it the one typed a page earlier
  const want = name && shown(name) ? name.value : name?.value || typed
  const login = want ? saved.find((l) => l.username === want) : typing ? null : saved[0]
  if (!login) {
    if (pw.value) { set(pw, ''); last = null } // another name over a filled login: its password must not go along
    return
  }
  if (login.password === pw.value) return
  if (name && shown(name) && !name.value) set(name, login.username)
  mine.set(pw, login.password)
  set(pw, login.password)
  last = { el: pw, username: login.username, password: login.password } // sending it counts as using this login
}
async function fill() {
  const pw = signIn()
  // not into a box that shows its text: a saved password doesn't go on screen unasked
  if (!pw || pw.type !== 'password' || tried.has(pw)) return
  tried.add(pw)
  if (taken(pw)) return
  await (asking ||= ask())
  // looked at again: the answer can take as long as a keychain prompt, and the box may show its text by now
  if (pw.type === 'password') put(pw)
}

// Save: keep what the user last typed and tell main once the form is sent. That is a submit, or after
// Enter or a button the page leaving or the form going away, with a request the page made in between.
// main then looks whether the sign-in worked before it asks.
let last = null // { el, username, password }, or { el, username } on a page that asks for the name first
let pressed = 0 // when Enter or a button was pressed since the typing, on the performance clock; 0: not
let fetched = false // a request the page made on that press came back
const there = () => last.el.isConnected && shown(last.el)
function note(e) {
  const el = e.target
  // only real typing counts, so a script can't make camber offer or rewrite a password
  if (!e.isTrusted || !(el instanceof HTMLInputElement) || other(el)) return
  pressed = 0
  fetched = false
  if (isBox(el)) last = el.value ? { el, username: nameBox(el)?.value || '', password: el.value } : null
  else if (last?.password) last.username = nameBox(last.el)?.value || ''
  else if (el.value && TEXT.includes(el.type) && named(el) && !boxes().length) last = { el, username: el.value }
  const pw = saved && !isBox(el) && signIn()
  if (pw && nameBox(pw) === el) put(pw, true)
}
const formOf = (el) => el.form || el.closest?.('form') || null
function press(e) {
  if (!e.isTrusted) return
  const sends = e.type === 'keydown' ? e.key === 'Enter' : !!e.target.closest?.('button, input[type=submit], input[type=button], [role=button]')
  // the page may have put another name on a filled form since (an account picker): looked at before
  // the page's own handlers send it, so one account's password doesn't go out under another's name
  if (sends) recheck()
  if (!last) return
  // Enter or a button, in the form the box is in: a search form next to it sends nothing of this one
  if (sends && formOf(e.target) === formOf(last.el)) {
    pressed = performance.now()
    fetched = false
    // a button that only shows or hides the password sends nothing either
    const el = last.el, type = el.type
    if (e.type === 'click') setTimeout(() => { if (el.type !== type) pressed = 0 })
  // a try that came back and left its form up has failed. Esc or a click beside the buttons then closes
  // the form and sends nothing. While the request is still out the same click is left alone
  } else if ((e.type === 'click' || e.key === 'Escape') && fetched && there()) pressed = 0
}
function tell() {
  if (!last) return
  ipcRenderer.send('login-typed', { username: last.username, password: last.password })
  typed = last.password ? '' : last.username // what main.js now keeps for a form with no name box
  last = null
}
// a request made after the press and at most three seconds after the form was seen gone (a sign-in can
// hide its form first and ask a moment later). One already out at the press, or one made long after a
// form was closed, says nothing about a sign-in.
// ponytail: a Cancel button on a page that makes a request within those seconds still reads as a
// sign-in, a sign-in that waits longer behind its spinner (a puzzle to solve) is missed, and one sent
// some other way (a WebSocket) is not seen. main.js asks before it saves either way
const sent = (entries) => entries.some((r) => ['fetch', 'xmlhttprequest'].includes(r.initiatorType) &&
  r.startTime >= pressed && r.startTime <= (last.gone ? last.gone + 3000 : Infinity))

let timer = 0
const soon = () => { timer ||= setTimeout(look, 250) }
function look() {
  timer = 0
  const l = last
  if (l && there()) { l.gone = 0; clearTimeout(l.drop) }
  else if (l) {
    if (pressed && (fetched || !l.password)) tell()
    else if (!pressed) last = null // closed, not sent
    // the form can sit behind a spinner while the request is out, so the login waits half a minute for it
    else if (!l.gone) { l.gone = performance.now(); l.drop = setTimeout(() => { if (last === l) last = null }, 30000) }
  }
  fill()
}
addEventListener('input', note, true)
addEventListener('keydown', press, true)
addEventListener('click', press, true)
// the form the box is in, sent by the browser (not another form, not an event the page made up): told
// right away. A page that takes the form over to make its own request has cancelled the event by the
// time its handlers are done, and is then watched like any press, so a wrong password behind a spinner
// is not taken for a sign-in
addEventListener('submit', (e) => {
  if (!e.isTrusted || !last || e.target !== last.el.form) return
  const at = performance.now()
  setTimeout(() => { if (e.defaultPrevented) pressed ||= at; else tell() })
}, true)
// leaving: with the form still on the page, or gone a moment ago with its request back (looked up here,
// because the page can leave before the list of requests is handed over)
addEventListener('pagehide', () => { if (pressed && last && (there() || fetched || sent(requests.takeRecords()))) tell() })
addEventListener('DOMContentLoaded', look)
// forms drawn or hidden later (single-page sign-ins), looked at four times a second at most
new MutationObserver(soon).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'type'] })
const requests = new PerformanceObserver((list) => { if (pressed && last && sent(list.getEntries())) { fetched = true; soon() } })
requests.observe({ type: 'resource' })
