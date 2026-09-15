# Windows Desktop

Restore Windows 10/11 x64 support on top of tophtab/douyu-keep-just-works.

- Public fork: KNaiFen/douyu-keep; development branch: codex/windows-desktop.
- Preserve the backend, normalized config format, task types, and Vue WebUI.
- Deliver a double-clickable local application, followed by tray, optional login startup, and an installer.
- Fix the reviewed gift carry-over, swallowed failures, inventory concurrency, misleading cookie diagnostics, and single-room fixed allocation issues.
- Preserve upstream history and the comparison report; keep local materials out of Git.
- Validate without using real account credentials or sending gifts.

Acceptance: quality gates pass, Windows executable launches its WebUI, repeated launch reuses the same instance, tray can reopen/quit, startup can be toggled, and x64 portable/installer artifacts are produced.
