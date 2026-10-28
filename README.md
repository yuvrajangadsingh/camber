# camber

An open-source browser with Arc's sidebar, spaces, pinned tabs and command bar.

Made by [Yuvraj Angad Singh](https://github.com/yuvrajangadsingh)

![camber demo: importing Arc spaces, switching spaces, and the command bar](docs/demo.gif)

## Why

Arc is being sunset on Dec 22 2026. It was closed source, so nobody can fork it.
camber keeps the parts people liked: a vertical sidebar, spaces with their own
logins, pinned tabs and folders, and a keyboard command bar. No AI features.

Why Electron: it ships the same Chromium as Chrome (156 today), and Electron
already runs on macOS, Linux and Windows, so camber does too from day one with
no Chromium fork to port. A new Chromium is an Electron version bump
(Dependabot opens the PR), not a Chromium build.

## Download

Get the installer for your system from the
[releases page](https://github.com/yuvrajangadsingh/camber/releases) and check it
against `SHA256SUMS.txt`.

| OS | File | Tested |
| --- | --- | --- |
| macOS, Apple Silicon | `camber-<version>-arm64.dmg` | launched from the DMG on a Mac |
| macOS, Intel | `camber-<version>-x64.dmg` | launched in CI (GitHub's Intel macOS runner) |
| Windows, x64 | `camber-<version>-x64.exe` | installed silently and launched in CI |
| Linux, x64 | `.deb`, `.AppImage` | both launched in CI (Ubuntu, virtual display) |
| Linux, arm64 | `.deb`, `.AppImage` | deb launched in CI; AppImage not run yet |
| Windows, arm64 | not built yet | |

"Launched" means the app started, imported a sample Arc file and showed it in the
sidebar. Nothing is signed yet:

- macOS: the app is not notarized, so the first open is refused. Right click
  camber.app, Open, then Open again. On macOS 15 and later: try to open it once,
  then System Settings > Privacy & Security > Open Anyway. Or run
  `xattr -dr com.apple.quarantine /Applications/camber.app`.
- Windows: SmartScreen warns about an unknown publisher; More info, Run anyway.
- Linux: `sudo apt install ./camber-*.deb`, or `chmod +x camber-*.AppImage` and
  run it. If it complains about FUSE, add `--appimage-extract-and-run`.

## Run from source

```sh
npm install && npm start
```

Builds land in `dist/`: `npm run dist` (macOS), `npm run dist:linux` and
`npm run dist:win` (on Linux or in the electron-builder Docker image), or
`npm run dist:all` for everything (needs Docker).

`npm run demo` starts with a throwaway profile, and its Import from Arc reads
`demo/arc-demo.json` (three made-up spaces of public sites) instead of your Arc
data. Use it for screenshots and recordings.

## Use

Cmd on macOS, Ctrl on Linux and Windows.

| Keys | Does |
| --- | --- |
| Cmd+T | command bar: URL, DuckDuckGo search, or jump to an open tab |
| Cmd+L | edit the current tab's URL |
| Cmd+W | close tab (pinned tabs just unload) |
| Cmd+D | pin or unpin |
| Cmd+R, Cmd+[, Cmd+] | reload, back, forward |
| Cmd+S | toggle sidebar |
| Cmd+Shift+N | little window |
| Cmd+O | move the little window's page into the current space |
| Cmd+Ctrl+Left/Right (Ctrl+Alt on Linux/Windows) | previous/next space |

Drag tabs to reorder them; dropping a tab among the pinned ones pins it, and
dropping a pinned tab under New Tab unpins it. Double-click a space's name to
rename it. Closing a tab takes you back to the tab you were on before it.
Unpinned tabs you haven't opened for 12 hours are closed (Tab > Archive After:
12h, 24h or Off).

File > Make camber the Default Browser sends links from other apps to camber.
On Linux, if that doesn't stick, run
`xdg-settings set default-web-browser camber.desktop`. A link from outside opens
in a little window; Open in camber (Cmd+O) moves it into the current space.

Each space has a profile, and each profile is its own session, so logins stay
apart. Spaces can share a profile, like in Arc.

## Moving from Arc

File > Import from Arc reads Arc's sidebar file where Arc keeps it on macOS and
on Windows. On Linux, or to bring a file from another machine, copy
`StorableSidebar.json` over and use File > Import Arc File….

What comes over:

- spaces with their names and colors
- Arc's profiles: spaces that shared a profile in Arc share logins in camber
- favorites (the icon grid at the top), per profile
- pinned tabs with the names you gave them in Arc
- folders, nested as deep as you had them
- unpinned (today) tabs

Importing again replaces the spaces from the earlier import instead of adding
copies. Not imported: history, passwords, bookmarks, extensions, Boosts and
Easels. Split views and tab groups become plain tabs. You sign in to sites again.

Air Traffic Control: on a site, Tab > Always Open Links to This Site in This
Space, and links to it (and its subdomains) from other apps open in that space.
Tab > Forget Routing Rule for This Site undoes it.

State lives in `state.json` in the app's user data folder.

Extensions: install from the Chrome Web Store (File > Chrome Web Store), and their
buttons show up in the sidebar.

## Known gaps

- 1Password doesn't work yet. Bitwarden installs and opens; autofill with a
  logged-in vault is untested.
- No auto-update, no code signing, no Windows arm64 build.
- No Widevine: Netflix, Prime Video, Disney+ and Spotify web do not play (stock
  Electron ships no DRM module).
- No sync, split view, Peek, Boosts or Live Folders.

## Remote debugging

Off by default. To turn it on for one run:

```sh
npx electron . --remote-debugging-port=9333
```

Anything on your machine can then drive the browser, so leave it off normally.

## Status

v0. Works for daily poking around, not yet for daily driving: builds are
unsigned and there is no auto-update. camber asks GitHub for the latest release
at startup and every 6 hours, and shows a small note in the sidebar when a newer
one is out. That request is the only thing it sends; it never downloads or
installs anything by itself.

## License

Copyright (C) 2026 Yuvraj Angad Singh. Licensed under GPL-3.0-only, see LICENSE.
