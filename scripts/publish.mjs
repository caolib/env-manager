#!/usr/bin/env node
/**
 * 精简发布：在临时副本里只保留运行必需的文件，再执行 ztools publish。
 * 原仓库不做任何目录变换，也不会把 src/、docs/、.codebuddy 等带进 PR。
 *
 * 用法：
 *   node scripts/publish.mjs            使用已提交的 web/ 产物发布
 *   node scripts/publish.mjs --build    先 pnpm build，产物有变化则报错要求提交
 *   node scripts/publish.mjs --dry-run  只准备副本并打印内容，不真正发布
 *   node scripts/publish.mjs --keep     保留临时副本目录便于排查
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const flags = new Set(process.argv.slice(2));
const SHOULD_BUILD = flags.has('--build');
const DRY_RUN = flags.has('--dry-run');
const KEEP = flags.has('--keep');

const root = process.cwd();
const KEEP_ENTRIES = new Set(['plugin.json', 'preload', 'logo.png', 'web', 'CHANGELOG.md', 'README.md']);

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', ...options }).trim();
}

function fail(message) {
  console.error('\n✖ ' + message + '\n');
  process.exit(1);
}

// 1. 基本校验
if (!fs.existsSync(path.join(root, 'plugin.json'))) fail('未找到 plugin.json，请在项目根目录执行');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
if (pkg.version !== manifest.version) {
  fail(`版本不一致：package.json ${pkg.version} / plugin.json ${manifest.version}`);
}

const dirty = run('git', ['status', '--porcelain']);
if (dirty) fail('工作区有未提交改动，请先提交：\n' + dirty);

// 2. 构建产物
if (SHOULD_BUILD) {
  console.log('▸ pnpm build');
  execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit', shell: true });
  const changed = run('git', ['status', '--porcelain']);
  if (changed) fail('构建产物有变化，请先提交 web/ 后再发布：\n' + changed);
}

if (!fs.existsSync(path.join(root, 'web', 'index.html'))) {
  fail('缺少 web/index.html。请先执行 pnpm build 并提交产物');
}

// 3. 创建干净副本
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ztools-publish-'));
execFileSync('git', ['clone', '--quiet', root, tmp], { stdio: 'inherit' });

const removed = [];
for (const entry of fs.readdirSync(tmp)) {
  if (entry === '.git' || KEEP_ENTRIES.has(entry)) continue;
  fs.rmSync(path.join(tmp, entry), { recursive: true, force: true });
  removed.push(entry);
}

console.log(`▸ 发布副本: ${tmp}`);
console.log(`▸ 保留: ${[...KEEP_ENTRIES].join(', ')}`);
console.log(`▸ 移除: ${removed.join(', ') || '(无)'}`);

execFileSync('git', ['add', '-A'], { cwd: tmp, stdio: 'inherit' });
execFileSync('git', ['commit', '-m', `chore(release): 精简发布包 v${manifest.version}`], { cwd: tmp, stdio: 'inherit' });

if (DRY_RUN) {
  console.log('\n▸ --dry-run 结束，未执行 ztools publish');
  if (!KEEP) fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}

// 4. 发布
const result = spawnSync('ztools', ['publish'], { cwd: tmp, stdio: 'inherit', shell: true });
const code = result.status ?? 1;

if (code === 0) {
  // 让原仓库的增量基线对齐到当前 HEAD，避免下次把历史提交全部列进 PR
  try {
    execFileSync('git', ['tag', '-f', 'ztools-last-publish', 'HEAD'], { cwd: root, stdio: 'ignore' });
  } catch {
    console.warn('⚠ 未能更新本地 ztools-last-publish 标签，不影响发布结果');
  }
}

if (!KEEP) fs.rmSync(tmp, { recursive: true, force: true });
process.exit(code);
