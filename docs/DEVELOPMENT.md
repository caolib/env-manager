# 开发与发布流程

## 环境

- Node.js ≥ 20、pnpm 12
- ZTools 客户端（Windows）
- 首次发布需 GitHub 账号；CLI 会把 OAuth token 存到 `~/.config/ztools/cli-config.json`

```bash
pnpm install
```

## 目录约定

```
plugin.json          # 插件清单：main 指向 web/index.html
preload/services.js  # Node 侧能力（注册表读写、文件操作）
web/                 # 构建产物（提交进仓库，发布时上传）
src/                 # Vue 3 源码
scripts/publish.mjs  # 精简发布脚本
```

构建产物目录必须叫 `web`，不能叫 `dist`：`ztools publish` 会跳过任何名为 `dist` 的目录。

## 日常开发

```bash
pnpm dev        # http://localhost:5173，热更新
pnpm lint
```

在 ZTools 里加载**项目根目录**（`plugin.json` 所在位置），不要加载子目录。开发者模式下入口会指向 `development.main`（localhost:5173）。

## 构建

```bash
pnpm build      # 输出到 web/（会清空旧产物，assets 文件名带 hash）
```

改动源码后要提交最新的 `web/`，否则发布出去的还是旧界面。

## 本地打包（自用 / 分发 / 备份）

```bash
pnpm package:ztools
```

脚本会依次执行：`pnpm build` → 读取 `plugin.json` 的版本号 → 只收集运行必需文件 → 生成 `release/env-manager-<版本>.zip`（约 120 KB）。

包内结构（`plugin.json` 必须位于压缩包根，不能多套一层文件夹）：

```
plugin.json
logo.png
preload/{services.js, package.json}
web/index.html + web/assets/*
CHANGELOG.md
README.md
```

注意：

- 自定义输出目录：`node scripts/package.mjs --out <dir>`
- `release/` 已加入 `.gitignore`，不会误提交
- 不要直接压缩项目根目录：`node_modules` 有 140 MB，压出来约 24 MB，且会触发「缺少 plugin.json」（多了一层目录或打包内容不对）
- 如需确认包内容：`python -c "import zipfile;print(zipfile.ZipFile('release/env-manager-0.0.8.zip').namelist())"` 或解压后查看

## 发版步骤

1. 改版本号（两处必须一致）
   - `plugin.json` 的 `version`
   - `package.json` 的 `version`
2. 在 `CHANGELOG.md` 增加版本节，标题格式必须严格为：
   ```markdown
   ## 0.0.9 - 2026-10-22
   
   ### 变更
   - ...
   ```
   （CLI 会校验标题格式与正文非空，格式不对直接拒绝发布）
3. 构建并提交
   ```bash
   pnpm build
   git add -A && git commit -m "chore(release): v0.0.9"
   ```
4. 发布
   ```bash
   pnpm publish:ztools          # 使用已提交的 web/ 产物
   pnpm publish:ztools -- --build   # 先构建；产物有变化会要求先提交
   ```

脚本会：校验版本一致与工作区干净 → 克隆临时副本 → 只保留 `plugin.json`、`preload/`、`logo.png`、`web/`、`CHANGELOG.md`、`README.md` → 提交 → 执行 `ztools publish` → 清理副本并把本地 `ztools-last-publish` 标签对齐 HEAD。

可选参数：`--dry-run` 只准备副本不发布，`--keep` 保留副本目录。

## PR 收尾（每次发版都要做）

打开 CLI 输出的 PR 链接，手动完成三件事，否则维护者不会审核：

1. 上传 1–2 张界面截图到 PR 描述
2. 勾选「自检清单」5 项
3. 点 **Ready for review**

## 已知问题

### 1. CLI 在 Windows 下 fetch 报 could not find remote ref

现象：`ztools publish` 在同步上游时报
`fatal: couldn't find remote ref 'plugin/env-manager'`。

原因：CLI 用 POSIX 单引号拼接 git 命令，`cmd.exe` 不识别，引号被当成 ref 名的一部分。

处理：给全局包打补丁（升级 CLI 后需重打）
```bash
# 文件：%APPDATA%\npm\node_modules\@ztools-center\plugin-cli\dist\upstream.js
# 把 shellQuote(value) 的实现改为：
function shellQuote(value) {
    return String(value);
}
```

### 2. 发布可能 force push

CLI 的推送带 `--force-with-lease`。当 `upstream/main` 前进时，它会基于最新上游重建 `plugin/<id>` 分支，导致历史被覆盖。旧 commit 仍可按 SHA 访问；只要 PR 还没人评论就无实际影响。

### 3. 网络

直连 GitHub 失败时使用系统代理（默认 `127.0.0.1:7890`）：
```bash
git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 push
```

## 发布产物检查

发布后可在 fork 缓存里确认内容：

```bash
cd ~/.config/ztools/ZTools-plugins
git ls-tree -r --name-only origin/plugin/env-manager plugins/env-manager
```

正常只有 9 个文件：`plugin.json`、`logo.png`、`preload/` 两个、`web/` 三个、`CHANGELOG.md`、`README.md`。
