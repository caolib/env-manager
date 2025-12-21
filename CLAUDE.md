# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Windows environment variable manager plugin for uTools. Provides a graphical interface to view, add, edit, and delete system and user environment variables with features like search/filtering, Path variable line-by-line editing, admin privilege detection, and import/export functionality.

## Common Development Commands

```bash
# Install dependencies
pnpm install

# Development server (hot reload on http://localhost:5173)
pnpm dev

# Production build (outputs to dist/)
pnpm build
```

## Architecture Overview

### uTools Integration Architecture

This is a uTools plugin with a special two-process architecture:

1. **Renderer Process (Vue 3 Frontend)**
   - All Vue components run in the uTools sandbox
   - Access to uTools API via `window.utools`
   - Cannot directly access Node.js or system APIs
   - Files: `src/App.vue`, `src/components/`, `src/stores/`

2. **Preload Process (Node.js Backend)**
   - Runs with system access via Node.js
   - Injected into renderer process as `window.services`
   - Handles registry operations, file I/O, and system commands
   - File: `public/preload/services.js`

**Critical Requirement:** The preload script (`window.services`) is the ONLY way to access system-level operations. Vue components must call `window.services.*` methods to interact with environment variables and the Windows registry.

### Core Data Flow

1. User interacts with Vue component (HomeView.vue, ConfigView.vue)
2. Component calls `window.services.*` API from preload script
3. Preload script executes registry queries (`reg query`, `reg add`, `reg delete`) via Node.js
4. Result returned to component, updates Pinia store
5. UI re-renders reactively

### Plugin Configuration

Entry point: `public/plugin.json`
- Main file: `index.html` (served by Vite in dev mode)
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
│   └── settings.js                  # Pinia store for user settings (uses uTools dbStorage)
└── utils/
    └── store.js                     # uTools dbStorage wrapper (getData/setData/removeData)

public/
├── plugin.json                      # uTools plugin configuration
├── preload/
│   └── services.js                  # Node.js preload script with registry/file APIs
└── index.html                       # HTML entry point
```

## Key Implementation Details

### Environment Variable Operations (public/preload/services.js)

All registry operations use Windows `reg` command through `execSync`:

- **getEnvVars()** - Queries both `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment` (system) and `HKCU\Environment` (user), returns parsed key-value pairs
- **setEnvVar(name, value, isSystem)** - Writes to registry with type `REG_EXPAND_SZ`
- **deleteEnvVar(name, isSystem)** - Removes registry entry
- **checkAdminPrivileges()** - Test-writes to system registry to verify admin access
- **exportEnvVars/importEnvVars** - JSON serialization for backup/restore

### State Management (src/stores/settings.js)

- Uses Vue 3 Composition API with computed properties (not Pinia stores)
- Wraps uTools `dbStorage` API via `src/utils/store.js`
- Settings automatically persist on change via deep watchers
- Current settings: theme (`system`/`light`/`dark`)

### Theme System (src/App.vue)

- Ant Design Vue integration with ConfigProvider
- Respects system preference via `window.matchMedia('(prefers-color-scheme: dark)')`
- Synchronizes with `data-theme` attribute on document element
- User override available in ConfigView

## Common Tasks

### Adding a New Environment Variable Operation

1. Add method to `window.services` in `public/preload/services.js`
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

- Components use Ant Design Vue components (imported from `ant-design-vue`)
- Icons from `@ant-design/icons-vue`
- Responsive design already in place for collapsible panels
- Search/filter logic in HomeView.vue uses `filteredSystemVars` and `filteredUserVars` computed properties

## Admin Privilege Detection

The plugin detects admin status via `window.services.checkAdminPrivileges()`:
- Returns `true` if test write to system registry succeeds
- System operations are disabled/read-only when admin = false
- User environment variables always accessible without admin rights

## Build Output

`pnpm build` generates:
- `dist/index.html` - Bundled Vue app
- `dist/` - All assets ready to be packaged as uTools plugin
- Install in uTools by adding the plugin directory via uTools UI

## Important Notes

- Path variables (semicolon-separated) are parsed line-by-line in EnvVarCard.vue for user-friendly editing
- Error messages handle both English and Chinese registry error messages
- Modified environment variables only take effect in newly-opened applications
- Test each admin/non-admin operation path (system vs user variables)
