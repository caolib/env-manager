# CLAUDE.md

> 开发与发布流程见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)（版本号、CHANGELOG 格式、`pnpm publish:ztools`、CLI 已知问题）。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Windows environment variable manager plugin for ZTools. Provides a graphical interface to view, add, edit, and delete system and user environment variables with features like search/filtering, Path variable line-by-line editing, admin privilege detection, and import/export functionality.

## Common Development Commands

```bash
# Install dependencies
pnpm install

# Development server (hot reload on http://localhost:5173)
pnpm dev

# Production build (outputs to web/)
pnpm build
```

## Architecture Overview

### ZTools Integration Architecture

This is a ZTools plugin with a special two-process architecture:

1. **Renderer Process (Vue 3 Frontend)**
   - All Vue components run in the ZTools sandbox
   - Access to ZTools API via `window.ztools`
   - Cannot directly access Node.js or system APIs
   - Files: `src/App.vue`, `src/components/`, `src/stores/`

2. **Preload Process (Node.js Backend)**
   - Runs with system access via Node.js
   - Injected into renderer process as `window.services`
   - Handles registry operations, file I/O, and system commands
   - File: `preload/services.js`

**Critical Requirement:** The preload script (`window.services`) is the ONLY way to access system-level operations. Vue components must call `window.services.*` methods to interact with environment variables and the Windows registry.

### Core Data Flow

1. User interacts with Vue component (HomeView.vue, ConfigView.vue)
2. Component calls `window.services.*` API from preload script
3. Preload script executes registry queries (`reg query`, `reg add`, `reg delete`) via Node.js
4. Result returned to component, updates Pinia store
5. UI re-renders reactively

### Plugin Configuration

Entry point: `plugin.json` (project root)
- Main file: `web/index.html` (served by Vite in dev mode)
- Preload script: `preload/services.js`
- Keywords: `环境变量`, `环境变量管理`, `env`, `environment`

## Directory Structure

```
src/
├── App.vue                          # Root component with menu navigation (home/config)
├── main.js                          # Vue app entry point
├── components/
│   ├── HomeView.vue                 # Main environment variable management interface
│   ├── EnvVarCard.vue               # Reusable card component for each env var
│   └── ConfigView.vue               # Settings page (theme, export defaults)
├── stores/
│   └── settings.js                  # Pinia store for user settings (uses ZTools dbStorage)
└── utils/
    └── store.js                     # ZTools dbStorage wrapper (getData/setData/removeData)

plugin.json                          # ZTools plugin manifest (load/package the project root)
logo.png
preload/
└── services.js                      # Node.js preload script with registry/file APIs
web/                                 # Vite build output (committed; cannot be named "dist")
```

## Key Implementation Details

### Environment Variable Operations (preload/services.js)

All registry operations use Windows `reg` command through `execSync`:

- **getEnvVars()** - Queries both `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment` (system) and `HKCU\Environment` (user), returns parsed key-value pairs
- **setEnvVar(name, value, isSystem)** - Writes to registry with type `REG_EXPAND_SZ`
- **deleteEnvVar(name, isSystem)** - Removes registry entry
- **checkAdminPrivileges()** - Test-writes to system registry to verify admin access
- **exportEnvVars/importEnvVars** - JSON serialization for backup/restore

### State Management (src/stores/settings.js)

- Uses Vue 3 Composition API with computed properties (not Pinia stores)
- Wraps ZTools `dbStorage` API via `src/utils/store.js`
- Settings automatically persist on change via deep watchers
- Current settings: theme (`system`/`light`/`dark`)

### Theme System (src/App.vue)

- Local theme variables applied through the root `data-theme` attribute
- Respects system preference via `window.matchMedia('(prefers-color-scheme: dark)')`
- Synchronizes with `data-theme` attribute on document element
- User override available in ConfigView

## Common Tasks

### Adding a New Environment Variable Operation

1. Add method to `window.services` in `preload/services.js`
2. Use `execSync` to run registry commands (Windows `reg` command)
3. Parse output or handle errors (check for permission errors: "Access is denied" / "拒绝访问")
4. Call from Vue component via `window.services.methodName()`
5. Update the calling component's error handling

### Adding a New Setting

1. Add property to `defaultSettings` object in `src/stores/settings.js`
2. Add getter/setter computed property in `useSettingsStore()` function
3. Call `setData()` in watcher to persist
4. Use in component via `const settings = useSettingsStore()` then `settings.propertyName`

### Modifying the UI

- UI controls are provided by local Vue components registered from `src/ui`
- Icons currently come from `@ant-design/icons-vue`
- Responsive design already in place for collapsible panels
- Search/filter logic in HomeView.vue uses `filteredSystemVars` and `filteredUserVars` computed properties

## Admin Privilege Detection

The plugin detects admin status via `window.services.checkAdminPrivileges()`:
- Returns `true` if test write to system registry succeeds
- System operations are disabled/read-only when admin = false
- User environment variables always accessible without admin rights

## Build Output

`pnpm build` generates:
- `web/index.html` - Bundled Vue app
- `web/assets/` - Bundled assets
- Install in ZTools by loading the project root (where `plugin.json` lives)

## Important Notes

- Path variables (semicolon-separated) are parsed line-by-line in EnvVarCard.vue for user-friendly editing
- Error messages handle both English and Chinese registry error messages
- Modified environment variables only take effect in newly-opened applications
- Test each admin/non-admin operation path (system vs user variables)
