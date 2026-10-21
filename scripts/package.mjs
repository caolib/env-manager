#!/usr/bin/env node
/**
 * 生成可分发的插件压缩包（只含运行必需文件）。
 * 用法：node scripts/package.mjs [--out <dir>]
 * 产物：<out>/env-manager-<version>.zip
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const KEEP_ENTRIES = ['plugin.json', 'preload', 'logo.png', 'web', 'CHANGELOG.md', 'README.md'];

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = path.resolve(root, outIndex >= 0 ? args[outIndex + 1] : 'release');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
if (!manifest.version) {
  console.error('✖ plugin.json 缺少 version');
  process.exit(1);
}
if (!fs.existsSync(path.join(root, 'web', 'index.html'))) {
  console.error('✖ 缺少 web/index.html，请先执行 pnpm build');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ztools-package-'));
const pkgDir = tmp; // 打包根目录，plugin.json 必须直接位于压缩包根

for (const entry of KEEP_ENTRIES) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(pkgDir, entry), { recursive: true });
}

fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, `env-manager-${manifest.version}.zip`);
fs.rmSync(zipPath, { force: true });

// 用 git archive 生成 zip，避免依赖系统压缩工具
execFileSync('git', ['init', '-q', tmp], { stdio: 'inherit' });
execFileSync('git', ['-C', tmp, 'add', '-A'], { stdio: 'inherit' });
execFileSync('git', ['-C', tmp, '-c', 'user.name=ztools', '-c', 'user.email=ztools@local',
  'commit', '-q', '-m', `package v${manifest.version}`], { stdio: 'inherit' });
// 注意：plugin.json 必须在压缩包根目录，不能多套一层文件夹
execFileSync('git', ['-C', tmp, 'archive', '--format=zip', '-o', zipPath, 'HEAD'], { stdio: 'inherit' });

const size = (fs.statSync(zipPath).size / 1024).toFixed(0);
const files = [];
const walk = (dir, prefix = '') => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === '.git') continue;
    if (item.isDirectory()) walk(path.join(dir, item.name), prefix + item.name + '/');
    else files.push(prefix + item.name);
  }
};
walk(pkgDir);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n✓ 生成: ${zipPath} (${size} KB)`);
console.log('  内容: ' + files.join(', '));
