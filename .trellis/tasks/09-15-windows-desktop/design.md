# Design

Add a thin Electron host in src/desktop. Reuse DockerRuntime through explicit lifecycle and loopback listen options. Serve the existing WebUI through an ephemeral localhost port. Authenticate the desktop session with a random process-local credential, keep Node disabled in the renderer, and reject untrusted navigation. Store business config under the Windows user data directory. Keep Docker entry points compatible.

Electron owns the single-instance lock, native tray, optional login startup, and graceful exit. electron-builder packages x64 unpacked and NSIS artifacts. Windows packaging stays separate from Docker builds; all shared build cleanup uses Node filesystem APIs.

Gift changes preserve planned allocations, serialize inventory-consuming tasks, report incomplete sending, and avoid retrying a whole task after a possibly completed gift mutation. Cookie diagnostics describe field completeness, not live authentication.
