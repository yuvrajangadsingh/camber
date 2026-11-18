# Changelog

Newest first. Installers and the full notes are on the
[releases page](https://github.com/yuvrajangadsingh/camber/releases).

## 0.6.0 (2026-11-19)

The browser basics camber was missing, and spaces that switch the way Arc's do.

- Right-click a page for the usual menu: open a link in a new tab or a little window,
  copy a link or an image, save an image, cut, copy and paste in a text field, search
  for selected text, spelling suggestions, extensions' own items, and Inspect. Before,
  right-clicking a page did nothing.
- Find in page: Cmd+F opens a find box at the top right of the page with a "2 of 3"
  count; Enter or Cmd+G for the next match, Shift for the previous, Esc to close.
- Zoom (Cmd+=, Cmd+-, Cmd+0) and print (Cmd+P).
- Spaces switch like Arc: Cmd+Option+Left/Right on a Mac (was Cmd+Ctrl), Ctrl+1 to
  Ctrl+9 to jump to a space, and a two-finger swipe across the sidebar.
- Tried on macOS (Apple Silicon) with test pages. The keys were checked through the
  menu, not pressed; a real trackpad swipe, Windows and Linux are untested.

## 0.5.1 (2026-11-17)

Sign-in popups, and a crash when a page closes itself.

- A site's popup (a "Sign in with Google" or Apple window, a card check) opens in a
  little window and can answer the page that opened it. Before, it became a tab the
  page couldn't reach, so those sign-ins never finished. Tried with a test page on
  macOS (Apple Silicon); a real third-party sign-in is untested.
- A page that closes itself now closes its tab, peek or little window. Before, the tab
  stayed with nothing in it and camber showed a JavaScript error over the window.
- Links, shift-clicks and bare new windows from a tab still open as tabs.

## 0.5.0 (2026-11-16)

DRM video, Boosts, renaming, reopening closed tabs, password import, and getting into
Google and 1Password.

- Widevine: camber now runs on castLabs' Electron 45.2.1, which has the Widevine
  module, signed for streaming on macOS and Windows. Google's Widevine test stream
  plays on macOS (Apple Silicon). Netflix, Prime Video, Disney+ and Spotify are untested.
- Chromium 156.0.8078.75, a few upstream fixes behind 0.4.1's 156.0.8078.96: castLabs
  hasn't shipped its Electron 45.3 yet. camber moves to it when they do.
- Boosts: Tab > Boost This Site… (or "boost" in the command bar) edits the site's own
  CSS in the sidebar, and the page changes as you type.
- Double-click a tab or folder to rename it.
- Cmd+Shift+T reopens the last closed tab; Tab > Archived Tabs… lists the closed and
  archived ones to search and reopen.
- Drag a tab or folder onto another space to move it there.
- File > Passwords > Import from CSV… takes a password export from Chrome, Arc, Edge,
  Brave, Firefox, Safari, 1Password or Bitwarden.
- Google sign-in gets past "This browser or app may not be secure" to the account.
  Finishing a sign-in is untested.
- 1Password: installing it opens its sign-in page, and its extension can open and close
  camber's tabs. Signing in with a real account is untested.
- Tried on macOS (Apple Silicon). Windows and Linux only start in CI.

Known gaps: nothing is signed by Apple or Microsoft; Netflix and other streaming sites
untested; Apple Passwords doesn't work; no Windows arm64 build, no sync or Live Folders.

## 0.4.1 (2026-11-11)

Electron 45.3.0, and a first fix for password manager extensions.

- Chromium 156.0.8078.96, with Chromium, Dawn and V8 fixes from upstream.
- In an extension's background and its own pages, `browser` now has the API groups
  camber adds to `chrome` that it was missing, such as windows. 1Password's extension
  no longer crashes on start, but its popup still stays on the loading screen, so it doesn't
  work yet.
- Apple Passwords: macOS starts the helper behind the iCloud Passwords extension only
  for browsers on Apple's list. camber has to be signed before it can be added.
- Tried on macOS (Apple Silicon): the saved-password tests and the 1Password and
  Bitwarden extensions. Windows and Linux only start in CI.

Known gaps: nothing is signed; no Widevine; 1Password and Apple Passwords don't work
yet; no password import; no Windows arm64 build, no sync, Boosts or Live Folders.

## 0.4.0 (2026-11-09)

camber saves your passwords and fills them in.

- Sign in to a site and camber asks whether to save the password: Save, Not Now or
  Never for This Site. It asks once the sign-in went through, so a wrong password
  isn't offered. Next time the form comes up filled in, and a changed password is
  offered as an update.
- More than one login for a site: the last used one is filled, and typing another
  saved username brings its password.
- File > Passwords lists the saved logins with Copy Password and Delete, and has the
  switch to stop asking.
- Passwords are sealed with the system keychain and stay in `passwords.json` on your
  computer. Only https pages and local http count, and a site only gets its own logins.
- macOS: the builds are unsigned, so after each camber update macOS should ask for
  your login password before camber can read its keychain entry again. Linux: needs
  GNOME Keyring or KWallet; without one nothing is saved.
- A sign-in form in an embedded frame or a web component, or one sent over a
  WebSocket, is not seen. camber never saves without asking.
- Tried on macOS (Apple Silicon). On Windows and Linux the save and fill have not
  been run yet, beyond the app starting in CI.

Known gaps: nothing is signed; no Widevine; 1Password doesn't work yet; no password
import; no Windows arm64 build, no sync, Boosts or Live Folders.

## 0.3.2 (2026-11-09)

Windows and Linux get their menus.

- The window on Windows and Linux has no menu bar, so File, Tab and Help were out of
  reach there: Import Arc File, the Chrome Web Store, making camber the default browser,
  and the routing, unload and archive options. On Linux that meant no practical way to
  import from Arc. A ≡ button at the top left of the sidebar now opens them.

Known gaps: nothing is signed; no Widevine; 1Password doesn't work yet; no Windows
arm64 build, no sync, Boosts or Live Folders.

## 0.3.1 (2026-11-08)

camber says it's a beta, and reporting a bug takes one click.

- A card in the sidebar on first launch (and once after this update) says camber is
  in beta and links to the bug form. Feedback in the sidebar, and Help > Report a
  Bug on macOS, open GitHub's issue form in your browser with camber's version and
  your OS filled in. GitHub gets those two when the page opens; nothing is posted
  until you submit. Ideas are welcome there too.
- Homebrew on macOS: `brew install yuvrajangadsingh/tap/camber`. The cask clears the
  quarantine flag, so the app opens without the unsigned-app prompt.
- Releases are now built, checked and drafted by CI from a tag, the Apple Silicon DMG
  included, so fixes can ship sooner. From the next release on, Windows updates
  download only the parts that changed.

Known gaps: nothing is signed; no Widevine; 1Password doesn't work yet; no Windows
arm64 build, no sync, Boosts or Live Folders.

## 0.3.0 (2026-11-04)

Idle tabs give their memory back, and Windows and Linux builds can update themselves.

- Tab unload: tabs you haven't looked at for an hour give their memory back and stay
  in the sidebar; clicking one loads it again (Tab > Unload After: 30m, 1h, 3h, Off).
  The tab on screen, both halves of a split, tabs playing sound and tabs with a
  picture-in-picture video stay loaded. 23 loaded tabs took 4.9 GB, 0.85 GB after the
  unload (summed RSS of every camber process, from source on an M5 Air). Form input
  on an unloaded page is lost, like a reload.
- A tab's archive and unload clock starts when it leaves the screen, so reading one
  page for two hours doesn't make it look idle. A today tab playing sound is never
  archived.
- Updates: on Windows and the AppImage, camber downloads a newer release in the
  background and offers Restart in the sidebar; it never restarts by itself. macOS
  and the .deb keep the note that links to the release. 0.3.0 is the first release
  with the files the updater reads, so this shows from the next release on.
- The update note only opens this repo's release pages.
- Electron 45.2.1.

Known gaps: nothing is signed; no Widevine; 1Password doesn't work yet; no Windows
arm64 build, no sync, Boosts or Live Folders.

## 0.2.0 (2026-11-01)

The Arc features people said they would miss most, plus tab hygiene.

- Little window: links from other apps open in a small window over whatever you
  are doing (Cmd+Shift+N opens one too). Open in camber (Cmd+O) moves the page
  into the current space.
- Default browser: File > Make camber the Default Browser. On Linux,
  `xdg-settings set default-web-browser camber.desktop` if it doesn't stick.
- Air Traffic Control: Tab > Always Open Links to This Site in This Space. Links
  to that site and its subdomains from other apps land in that space. Rules
  survive a re-import from Arc.
- Split view: Tab > Split with… (or "split" in the command bar) puts two tabs of
  the space side by side. Cmd+Shift+\ closes it.
- Peek: Shift+click a favorite, or Cmd+Shift+click a pinned tab, to look at it
  over the page. Esc or a click outside closes it, Open as tab keeps it.
- Auto picture-in-picture: a playing video pops out when you leave its tab and
  goes back when you return.
- Per-site permissions: sites ask before they get the camera, microphone,
  location, notifications and the rest, once per site.
- Tab hygiene: drag to reorder (drop among the pinned ones to pin), hover close
  button, closing a tab returns to the one you came from, unpinned tabs unused
  for 12 hours are closed (Tab > Archive After), double-click a space to rename it.
- Tabs only load web and extension pages; nothing can point a tab at a local file.

Known gaps: a site that never asked reads camera, microphone and notifications as
"granted" until it asks; no Widevine; 1Password doesn't work yet; no auto-update,
no Windows arm64 build, no sync, Boosts or Live Folders. Nothing is signed.

## 0.1.0 (2026-10-28)

First build: Arc's sidebar, spaces, pinned tabs and command bar on Electron 45
(Chromium 156), for macOS, Windows and Linux. No AI features.

- Import from Arc (File > Import from Arc, or Import Arc File… for a copied file):
  spaces with names and colors, Arc's profiles (spaces that shared a profile
  share logins), favorites per profile, pinned tabs with their names, nested
  folders, today tabs. Importing again replaces the earlier import.
- Not imported: history, passwords, bookmarks, extensions, Boosts, Easels. Split
  views and tab groups become plain tabs.
- Chrome Web Store extensions, with their buttons in the sidebar.
- A sidebar note when a newer release is out.

Nothing is signed: macOS is ad-hoc signed and not notarized, Windows shows a
SmartScreen warning.
