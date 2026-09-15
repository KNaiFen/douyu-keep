# Windows Desktop

## Build And Run

Requirements: Windows 10/11 x64, Node.js 24, npm, Git.

```sh
npm ci
npm run dev:desktop
npm run dist:win
```

`release/win-unpacked/douyu-keep.exe` is the unpacked application. Distribute
the entire ZIP, not that executable alone. The NSIS installer and ZIP are built
for x64. Local builds are unsigned; no signing certificate is configured.
`npm run start:desktop` reuses an existing build.

## Runtime

The Electron main process hosts the existing Node backend. Its Vue WebUI uses
an ephemeral loopback HTTP port and a process-local random authentication token
injected by the Electron session. The renderer has no Node integration or preload
bridge. Token values are not placed in URLs, config files, HTML, or logs.
External HTTP(S) links open in the default browser; other navigation is rejected.
Desktop mode hides the server-password logout button; Douyu credential management
is unchanged. Docker retains its normal password/session authentication.

Configuration is `%APPDATA%/douyu-keep/config.json`. `DOUYU_KEEP_DATA_DIR` may
override the data directory for isolated testing. Corrupt config stops startup
instead of replacing existing data. Windows startup uses the current executable
path with `--hidden` and is opt-in through the tray menu. Uninstall removes this
startup entry and keeps user configuration.

Closing the window hides it in the tray. Exit stops cron, stops accepting HTTP
connections, and waits for queued/running tasks, with a 30-second process timeout.
Sleep/offline time is not backfilled. In-memory logs retain the upstream lifetime.

## Reviewed Fixes

- Planned gifts 1, 2, 3 with the first two rooms failing now attempt 1, 3, 6,
  without changing the allocation objects.
- Unsent final gifts, invalid credentials, backpack fetches, double-card queries,
  and allocation errors propagate to the task/API instead of reporting success.
- Once a gift request has been attempted, credential recovery cannot replay the
  entire task. A lost response can leave the remote result uncertain; inspect
  status before manually retrying.
- Collect, keepalive, double-card, and expiring tasks share a FIFO inventory queue;
  same-type duplicate requests remain blocked. Yuba remains independent.
- A single eligible double-card room follows fixed counts, zero, and explicit
  remainder `-1`. Weighted mode continues to distribute by eligible weights.
- Cookie diagnostics say whether required fields are present, not that remote
  authentication has passed.
- fnOS contract tests normalize checkout newlines and verify executable Git modes
  on Windows while preserving POSIX filesystem checks on Linux.

## Repository

Public fork: https://github.com/KNaiFen/douyu-keep

Base: tophtab/douyu-keep-just-works at b9f6f52 (3.10.0).
Windows branch: `codex/windows-desktop`. Original desktop history and the initial
comparison remain on local `archive/original-desktop`; the comparison report is
also present on the Windows branch. `.materials` and `.codegraph` are local only.

The Windows workflow builds artifacts without publishing a GitHub Release.
The inherited Docker workflow cannot publish the upstream image from this fork.

## Verification

The local Windows run passed lint, all three TypeScript checks, 58 offline
contract tests, Vite/backend/desktop builds, and Electron packaging. The packaged
application was exercised through Playwright from an unrelated working directory:
all eight pages, asset loading, local auth isolation, persisted theme, 390-pixel
layout, window-to-tray hiding, second-instance activation, and hidden startup.
Screenshots are local under `output/playwright/` and contain no account data.
NSIS installation/uninstallation also passed in a path containing spaces.
The installed executable launched, startup toggled on/off, uninstall removed its
startup entry and program files, and user configuration survived uninstall.

`scripts/smoke-desktop.cjs` and `scripts/smoke-installer.cjs` use Playwright's
Electron driver. Set `PLAYWRIGHT_MODULE` to an installed Playwright module path
when it is not a project dependency. Installer smoke uses a temporary directory
and the current user's registry; it refuses to replace an existing startup entry.
No real Douyu login or gift mutation is part of these checks.
