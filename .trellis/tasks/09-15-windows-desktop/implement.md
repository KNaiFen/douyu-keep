# Implementation

- [x] Create public fork and Windows development branch; preserve original history.
- [x] Fix reviewed gift execution/allocation and inventory locking with focused regressions.
- [x] Add reusable runtime lifecycle and desktop host, tray, login startup, packaging.
- [x] Correct cookie diagnostics copy and Windows test portability.
- [x] Replace Electron with the native tray launcher, bundled Node and automatic browser login.
- [x] Run lint, type checks and 63 offline contracts.
- [x] Verify browser/native smoke, NSIS install/uninstall, spaced paths and config retention.
- [x] Verify graceful early stop while waiting for ready and equivalent data-directory mutex keys.
- [x] Confirm manual launch opens the system default Chrome; native UI automation stopped because it could not determine the browser URL, so tray clicking was not re-verified.
- [x] Document Windows use, build commands, tested behavior and UI verification limitation.
