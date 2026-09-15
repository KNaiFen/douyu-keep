# Windows Desktop

## Build And Run

Build requirements: Windows 10/11 x64, Node.js 24, npm, Git, and the Windows
.NET Framework compiler. Full installer builds also require NSIS; set
`MAKENSIS_PATH` when it is not installed in `C:/Program Files (x86)/NSIS`.
End users need neither Node.js nor Docker: Node is included in the package.

```sh
npm ci
npm run pack:win
npm run dist:win
```

`release/windows-x64/douyu-keep.exe` is the unpacked application. Distribute
the entire ZIP, not that executable alone. The NSIS installer and ZIP are built
for x64. Local builds are unsigned; no signing certificate is configured.
`pack:win` builds the portable ZIP without requiring NSIS. `dist:win` also
builds `release/douyu-keep-<version>-windows-x64.exe`.

## Runtime

The native WinForms tray launcher starts the bundled Node backend with no console
window. Once ready, it opens the existing Vue WebUI in the default browser using
an ephemeral `127.0.0.1` HTTP port. No Electron or bundled browser is used.
A random token is passed to Node through the child environment and to the browser
through `#web-password=...`. The WebUI removes this fragment with `replaceState`
before exchanging it for its normal authenticated session cookie. The token does
not enter HTTP URL requests, HTML, config, or launcher logs. Browser extensions
and other software with access to the browser are outside this boundary.
Logout remains available; reopen from the tray to log in again. Docker retains
its normal password/session authentication, including legacy query auto-login.

Configuration is `%APPDATA%/douyu-keep/config.json`. `DOUYU_KEEP_DATA_DIR` may
override the data directory for isolated testing. Corrupt config stops startup
instead of replacing existing data. Windows startup uses the current executable
path with `--hidden` and is opt-in through the tray menu. Uninstall removes this
startup entry and keeps user configuration.

Closing the browser leaves the service running in the tray. Repeated launches
open the running service without starting another backend for the same data
directory. Manual launches open the browser; optional login startup uses
`--hidden` and leaves the browser closed. `douyu-keep.exe --stop` requests exit.

Exit stops cron, stops accepting HTTP
connections, and waits for queued/running tasks, with a 30-second process timeout.
Sleep/offline time is not backfilled. In-memory logs retain the upstream lifetime.
Launcher output is saved to `backend.log`, rotated at 2 MiB with one backup.
The child belongs to a Windows Job Object so terminating the launcher cannot
leave an orphaned scheduler. A failed HTTP stop request still waits for the
backend before the launcher forces termination. Shutdown/logoff can shorten
the available drain time.

Install and uninstall refuse to modify a running application. The installer
creates desktop/start-menu shortcuts for the current user without elevation;
uninstall keeps the user data directory and removes its autostart entry.

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

The follow-up [business logic audit](business-audit.md) covers uncertain gift
results, allocation and expiry validation, collection and Yuba failures,
account/cache isolation, concurrent config writes and queued credential changes.

## Repository

Public fork: https://github.com/KNaiFen/douyu-keep

Base: tophtab/douyu-keep-just-works at b9f6f52 (3.10.0).
Windows branch: `codex/windows-desktop`. Original desktop history and the initial
comparison remain on local `archive/original-desktop`; the comparison report is
also present on the Windows branch. `.materials` and `.codegraph` are local only.

The Windows workflow builds artifacts without publishing a GitHub Release.
The inherited Docker workflow cannot publish the upstream image from this fork.

## Verification

Quality checks are `npm run lint`, `npm run type-check`, and
`npm run test:contracts` (87 offline cases). `npm run dist:win` builds the
WebUI/backend, native launcher, portable ZIP, and NSIS installer.

After building, `npm run test:windows` uses Playwright with installed Chrome.
Set `PLAYWRIGHT_MODULE` to an installed Playwright module path when it is not
a project dependency. It checks all eight pages, asset loading, automatic auth,
URL cleanup, persisted theme, 390-pixel layout, logout/relogin, stop authorization,
native hidden startup, process cleanup, install/uninstall running guards,
installation in a path containing spaces, retained configuration, delayed-ready
shutdown, and equivalent data-directory instance keys.
Installer smoke changes the current user's install registration and shortcuts;
run it in a development account without an existing installed copy.
Screenshots are local under `output/playwright/`. No real Douyu login or gift
mutation is part of these checks.

The local browser/native/installer smoke and quality gates passed. Manual launch
opened the system default Chrome. Native UI automation stopped because its
browser URL detection could not enforce its policy, so native tray-menu clicking
and startup toggling were not re-verified through the Windows UI.
