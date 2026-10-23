# camber

An open-source browser with Arc's sidebar, spaces, pinned tabs and command bar.

Made by [Yuvraj Angad Singh](https://github.com/yuvrajangadsingh)

## Why

Arc is being sunset on Dec 22 2026. It was closed source, so nobody can fork it.
camber keeps the parts people liked: a vertical sidebar, spaces with their own
logins, pinned tabs and folders, and a keyboard command bar. No AI features.

It embeds Chromium through Electron instead of forking it, so a new Chromium is
an Electron version bump (Dependabot opens the PR), not a Chromium build.

## Download

macOS DMGs for Apple Silicon (`arm64`) and Intel (`x64`) are on the releases page.
v0 is not signed or notarized, so macOS will refuse to open it the first time.
Right click camber.app, choose Open, then Open again. Or clear the quarantine flag:

```sh
xattr -dr com.apple.quarantine /Applications/camber.app
```

## Run from source

```sh
npm install && npm start
```

Build the DMGs yourself with `npm run dist` (output in `dist/`).

macOS only for now.

`npm run demo` starts with a throwaway profile, and its Import from Arc reads
`demo/arc-demo.json` (three made-up spaces of public sites) instead of your Arc
data. Use it for screenshots and recordings.

## Use

| Keys | Does |
| --- | --- |
| Cmd+T | command bar: URL, DuckDuckGo search, or jump to an open tab |
| Cmd+L | edit the current tab's URL |
| Cmd+W | close tab (pinned tabs just unload) |
| Cmd+D | pin or unpin |
| Cmd+R, Cmd+[, Cmd+] | reload, back, forward |
| Cmd+S | toggle sidebar |
| Cmd+Ctrl+Left/Right | previous/next space |

Each space has a profile, and each profile is its own session, so logins stay
apart. File > Import from Arc reads Arc's sidebar file and brings in spaces,
pinned tabs and folders (nested folders are flattened to one level).

State lives in `state.json` in the app's user data folder.

## Remote debugging

Off by default. To turn it on for one run:

```sh
npx electron . --remote-debugging-port=9333
```

Anything on your machine can then drive the browser, so leave it off normally.

## Status

v0. Works for daily poking around, not yet for daily driving: no extensions,
no packaged or signed builds, no auto-update.

## License

Copyright (C) 2026 Yuvraj Angad Singh. Licensed under GPL-3.0-only, see LICENSE.
