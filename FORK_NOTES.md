# Fork merge notes

This file records the intentionally small integration surface between the managed-services feature and `upstream/main`.

## Upstream files touched

| File | Lines | Reason |
| --- | ---: | --- |
| `src/main/index.ts` | 85, 1212 | Import and asynchronously initialize the isolated service registry after Electron is ready. All lifecycle, IPC, and process logic lives under `src/main/services/`. |
| `src/preload/index.ts` | 3, 77 | Import and spread the isolated, allow-listed managed-services preload API. |
| `src/renderer/src/lib/components/Main/Connections/StatusBar.svelte` | 6, 180 | Mount the dynamic managed-services status component inside the existing bottom status bar. |
| `src/renderer/src/lib/components/Main/Settings/General.svelte` | 6, 420 | Mount the isolated managed-services settings section where the previous fork-only OmniRoute toggle appeared. |

No upstream server database, migration, Python, or Open WebUI connection code is changed.

## Fork-only files

- `src/main/services/`: versioned registry persistence, legacy migration, encrypted secrets, validation, IPC, health and port checks, cross-platform process-tree lifecycle, bounded restarts, and log ring buffers.
- `src/preload/services.ts`: renderer-facing allow-list for managed-services IPC.
- `src/shared/services/types.ts`: shared data and IPC types.
- `src/renderer/src/lib/components/Main/Settings/Services.svelte`: dynamic service list and editor, import confirmation, export, logs, and mcpo integration details.
- `src/renderer/src/lib/services/`: status-bar and log-view components.

The old fork-only `src/main/utils/omniroute.ts`, fixed `omniRoute` config field, toggle markup, and OmniRoute translation keys were removed. Those files therefore match `upstream/main` again and should not create future merge conflicts.

## Extension rule

Adding another generic service or MCP server is a registry-data operation. It must not require a source-file change. Names and commands specific to bundled examples belong only in `src/main/services/defaults.ts`.

## Release versioning

Fork releases use the `omniroute` prerelease channel and a base version above the current upstream release (for this change: `v0.0.22-omniroute.1`). This avoids collision with upstream `v0.0.21` while keeping updates available to installations of `v0.0.21-omniroute.1` through the existing `nicoegerer/desktop` update feed.
