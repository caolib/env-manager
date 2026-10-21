# uTools → ZTools 插件迁移笔记

以 `newapi-info`（NewAPI 多账号面板）为例，记录从 uTools 插件迁移到
[ZToolsCenter/ZTools](https://github.com/ZToolsCenter/ZTools) 的完整经验。

> 注意：本文的 ZTools 指 `ZToolsCenter/ZTools`（uTools 的开源实现，API 为 `window.ztools`）。
> 不要和 `ztools.cn`（声明式 UI、不允许插件写 DOM/CSS）混淆，两者是不同产品。

---

## 1. 结论先行

迁移成本主要不在 API 改名，而在 **三个 uTools 独有能力在 ZTools 中不存在**：

| 能力 | uTools | ZTools | 处理方式 |
| --- | --- | --- | --- |
| 加密键值存储 | `utools.dbCryptoStorage` | ❌ 只有 `dbStorage`（明文）、`db`（LMDB） | preload 自行加密 |
| 网络请求 | `utools.fetch` | ❌ 无 | preload 走 Node `http/https` |
| Electron 模块 | 完整 | ⚠️ preload 中可能不暴露 `safeStorage` | 运行时探测 + 降级 |

其余 API 基本是**前缀替换**，`utools.*` → `ztools.*`，签名一致。

---

## 2. API 映射表

| uTools | ZTools | 备注 |
| --- | --- | --- |
| `utools.onPluginEnter(cb)` | `ztools.onPluginEnter(cb)` | `cb({ code, type, payload })` |
| `utools.onPluginOut(cb)` | `ztools.onPluginOut(cb)` | |
| `utools.showNotification(body)` | `ztools.showNotification(body)` | |
| `utools.copyText(text)` | `ztools.copyText(text)` | |
| `utools.showOpenDialog(opts)` | `ztools.showOpenDialog(opts)` | 返回 `string[] \| undefined` |
| `utools.showSaveDialog(opts)` | `ztools.showSaveDialog(opts)` | 返回 `string \| undefined` |
| `utools.shellShowItemInFolder(p)` | `ztools.shellShowItemInFolder(p)` | |
| `utools.getPath(name)` | `ztools.getPath(name)` | |
| `utools.outPlugin()` | `ztools.outPlugin()` | 返回 Promise |
| `utools.dbCryptoStorage` | ❌ | 见 §3.1 |
| `utools.dbStorage` | `ztools.dbStorage` | 插件隔离，明文 |
| `utools.db` | `ztools.db` | LMDB 文档型，含 `.promises` |
| `utools.fetch` | ❌ | 见 §3.2 |

额外可用、值得知道的：

- `ztools.getNativeId()`：设备唯一标识，可用于派生本地密钥
- `ztools.getThemeInfo()` / `onThemeChange()`：主题联动
- `ztools.showToast(msg)`：应用内提示，比系统通知轻
- `ztools.getPathForFile(file)`：拖拽文件取真实路径

---

## 3. 三个必须处理的差异

### 3.1 加密存储

uTools 的 `dbCryptoStorage` 由宿主管理密钥，ZTools 没有对等能力。账号 token 这类数据
不能直接塞进 `dbStorage`（明文落盘）。

本项目采用 **两级加密**，实现在 `src-ztools/preload/services.js`：

```js
// 1) 优先 Electron safeStorage（Windows DPAPI / macOS Keychain）
// 2) 不可用时退化为 AES-256-GCM，密钥由设备 ID 派生
const key = crypto.scryptSync(ztools.getNativeId(), 'newapi-info.v1', 32)
```

要点：

- **必须运行时探测** `safeStorage`，不能解构后直接使用（见 §3.3）
- 密文结构带版本号与算法标记，便于以后升级
- 解密失败要返回 `null` 并记录日志，不要让插件崩溃
- 设备 ID 派生密钥意味着**换机后无法解密**，必须提供 JSON 导入导出

```js
// services.storage 对外只有三个同步方法
storage.getItem(key)   // -> string | null
storage.setItem(key, value)
storage.removeItem(key)
```

### 3.2 网络请求与 CORS

ZTools 没有 `utools.fetch`。渲染进程直接 `fetch` 会受 CORS 限制（插件页面多为本地源），
调用第三方 API 很容易被拦。

正确做法：**所有外部请求走 preload 的 Node 请求**。

```js
// preload
function httpRequest(url, options = {}) {
  // node:http / node:https，返回 { status, ok, headers, body }
}

// 前端
const res = await window.services.httpRequest(url, { headers })
const json = JSON.parse(res.body)
```

配套设计：

- 返回 `body` 字符串而非解析后的对象，让前端决定解析方式
- 设置默认超时（本项目 20s），避免请求悬挂
- 对非法 URL、非 2xx、非 JSON 分别给出明确错误

### 3.3 preload 中的 electron 模块

**实际踩到的坑**：ZTools 的 preload 里 `require('electron').safeStorage` 是 `undefined`，
最初的写法 `const { safeStorage } = require('electron')` 导致每次保存都抛
`Cannot read properties of undefined (reading 'isEncryptionAvailable')`，然后静默降级成明文。

修复模式：

```js
let safeStorage = null
try {
  safeStorage = require('electron').safeStorage || null
} catch {}

function hasSafeStorage() {
  try {
    return !!(safeStorage && safeStorage.isEncryptionAvailable())
  } catch {
    return false
  }
}
```

**原则：宿主能力一律视为可选，取不到就降级，但要在日志里说清楚。**

---

## 4. 目录与构建

uTools 常见结构是 `public/` 放 `plugin.json` / `preload` / `logo`，Vite 构建时复制进 `dist/`。
ZTools 的工具链（开发者模式加载、`ztools publish`）要求 **`plugin.json` 与其 `main` 的
相对路径保持一致**，否则会报「找不到 index.html」。

推荐结构与官方模板一致：

```
newapi-info/
├── src/                      源码
├── src-ztools/               ← 插件目录，开发/打包都指向这里
│   ├── plugin.json           main: "dist/index.html"
│   ├── logo.png
│   ├── preload/
│   │   ├── services.js       CommonJS，不可压缩/混淆
│   │   └── package.json      { "type": "commonjs" }
│   └── dist/                 构建产物（git 忽略）
└── vite.config.js            输出到 src-ztools/dist
```

```js
// vite.config.js
build: {
  outDir: fileURLToPath(new URL('./src-ztools/dist', import.meta.url)),
  emptyOutDir: true
}
```

关键点：

- **不要再把 `plugin.json` 放在 `public/`**，`public` 是静态资源源目录，不是插件目录
- `dist/preload/package.json` 声明 `commonjs`，保证 `require()` 可用
  （根 `package.json` 是 `"type": "module"` 时会冲突）
- `base: './'` 必须保留，插件以本地文件加载
- `development.main` 指向 `http://localhost:5173`，ZTools 开发模式下自动使用

**加载/打包目录永远是 `src-ztools`**，不是 `dist`，也不是项目根目录。

---

## 5. 数据迁移

uTools 的 `dbCryptoStorage` 与 ZTools 的存储使用不同密钥体系，**无法自动迁移**。

流程：

1. 在 uTools 版插件里使用「导出配置」生成 JSON
2. 在 ZTools 版插件里使用「导入配置」恢复
3. 导入后不会自动刷新，需要手动触发

本项目存储键加了 `newapi-info.` 前缀，避免与其他插件或宿主键冲突。

---

## 6. 迁移检查清单

- [ ] 全局搜索 `utools.`，确认只剩注释
- [ ] `plugin.json` 的 `main` / `preload` / `logo` 路径在插件目录内真实存在
- [ ] `preload` 保持 CommonJS 且未压缩
- [ ] 所有网络请求走 preload，不依赖渲染进程 `fetch`
- [ ] 敏感数据不再明文落盘
- [ ] `safeStorage` 等宿主能力有探测与降级
- [ ] 导入导出可用（跨设备恢复的唯一手段）
- [ ] `pnpm build` 后 `src-ztools/dist/index.html` 存在
- [ ] 在 ZTools 开发者模式加载 `src-ztools`，指令可正常触发

---

## 7. 本次踩坑记录

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `public 下面没有 index.html` | 把 `public/` 当成了插件目录，`main` 却相对 `dist/` | 改为 `src-ztools/` 结构 |
| `[newapi] 加密不可用，回退明文存储` | preload 中 `safeStorage` 为 `undefined` | 探测 + AES 降级 |
| 复制/新增账号自动发请求 | `duplicateAccount` / `saveAccount` 里内联了 `fetchAccount` | 全部移除，只保留手动刷新 |
| 加密存储无法读取旧数据 | 两套密钥体系 | 导出 JSON 再导入 |

---

## 8. 可复用的适配层骨架

`src-ztools/preload/services.js` 整体可分四块，迁移其他插件时按需裁剪：

1. **storage**：safeStorage / AES 双模加密 + `dbStorage`
2. **httpRequest**：Node `http/https` 封装，返回原始 body
3. **文件能力**：`readFile` / `writeFile` / `writeTextFile` / `writeImageFile`
4. **暴露**：统一挂到 `window.services`，前端不直接碰 `fs`

前端的调用约定：

- `window.ztools`：宿主能力（对话框、通知、剪贴板）
- `window.services`：本地能力（存储、网络、文件）

两者分离，便于在纯浏览器环境做 UI 调试时分别降级。
