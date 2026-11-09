# Changelog

Newest first. Installers and the full notes are on the
[releases page](https://github.com/yuvrajangadsingh/camber/releases).

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
