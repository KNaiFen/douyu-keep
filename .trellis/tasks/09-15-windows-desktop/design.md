# Design

Use a native WinForms tray launcher in packaging/windows/Launcher.cs and a Node entry in src/desktop/server.ts. Reuse DockerRuntime through explicit lifecycle and loopback listen options. Serve the existing WebUI through an ephemeral localhost port and open the default browser when ready. Authenticate with a random process-local credential in the URL fragment, cleared before the existing session-login exchange. Store business config under the Windows user data directory. Keep Docker entry points compatible.

The launcher owns a per-user/data-directory instance mutex, activation/stop events, native tray, optional login startup, graceful exit, and a child Job Object. Package Node 24 x64 and production dependencies with the application. Use the .NET Framework compiler and NSIS for x64 ZIP/installer artifacts, with no Electron runtime. Refuse install/uninstall while the running-instance mutex exists. Windows packaging stays separate from Docker builds; all shared build cleanup uses Node filesystem APIs.

Gift changes preserve planned allocations, serialize inventory-consuming tasks, report incomplete sending, and avoid retrying a whole task after a possibly completed gift mutation. Cookie diagnostics describe field completeness, not live authentication.
