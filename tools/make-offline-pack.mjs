// Build the "no internet at all" pack: the site plus a double-clickable launcher.
//
//   npm run pack
//
// The result is a zip a teacher can carry on a USB stick. It contains no runtime
// to install — the launcher is a PowerShell script using only what Windows ships
// with — because the audience has a locked-down school laptop, not a development
// environment.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const packRoot = path.join(root, '.pack');
const packName = 'cell-atelier-offline';

const LAUNCHER = `@echo off
chcp 65001 >nul
title Cell Atelier
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 pause
`;

const README = `Cell Atelier · 离线使用说明
================================

这是一个可以直接运行的高中生物细胞标本室，不需要安装任何东西，也不需要联网。

怎么打开
--------
1. 把整个文件夹解压到任意位置（桌面即可）。
2. 双击「启动.bat」。
3. 浏览器会自动打开 http://localhost:8173/
   关掉那个黑色窗口就是停止。

为什么不能直接双击 index.html
-----------------------------
因为它是现代网页应用（ES 模块），浏览器出于安全限制不允许从本地文件直接加载，
必须经由一个地址访问。启动.bat 就是在你本机起一个小小的服务，只监听本机。

关于离线
--------
本页面在本机运行，Service Worker 与缓存全部可用：第一次打开后，
即使拔掉网线、关掉这个窗口再重开，浏览器里已缓存的版本依然能打开。
如果浏览器提示可以「安装」，装完就是一个带图标的桌面应用。

给学生看什么
------------
· 建议从「对比」开始：动物细胞与叶肉细胞按同一真实比例并排。
· 「辨认练习」可以出题，答错会说明你点到了什么。
· 左下角标尺与页面的同尺度对比图说明这些细胞真实有多小。

更多课堂用法见页面下方「上课怎么用这一页」。`;

async function main() {
  const dist = path.join(root, 'dist');
  if (!existsSync(dist)) {
    console.error('先运行 npm run build 再打包。');
    process.exit(2);
  }

  await rm(packRoot, { recursive: true, force: true });
  const target = path.join(packRoot, packName);
  await mkdir(target, { recursive: true });

  await cp(dist, path.join(target, 'site'), { recursive: true });
  // Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI, which turns every
  // Chinese message in the launcher into mojibake; the BOM is what tells it the
  // file is UTF-8.
  const server = await readFile(path.join(here, 'offline-pack', 'server.ps1'), 'utf8');
  await writeFile(path.join(target, 'server.ps1'), `\uFEFF${server}`, 'utf8');
  await writeFile(path.join(target, '启动.bat'), LAUNCHER.replace(/\n/g, '\r\n'), 'utf8');
  await writeFile(path.join(target, '使用说明.txt'), `\uFEFF${README}`.replace(/\n/g, '\r\n'), 'utf8');

  // the zip is what actually gets copied to a stick or sent through chat
  const archive = path.join(packRoot, `${packName}.zip`);
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('powershell', [
    '-NoProfile', '-Command',
    `Compress-Archive -Path '${target}' -DestinationPath '${archive}' -Force`,
  ], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('打包 zip 失败；文件夹本身已经生成，可直接复制。');
    process.exit(1);
  }

  const { statSync } = await import('node:fs');
  const mb = (statSync(archive).size / 1e6).toFixed(1);
  console.log(`\n  ${path.relative(root, target)}/`);
  console.log(`  ${path.relative(root, archive)}  ${mb} MB`);
  console.log('  解压后双击「启动.bat」即可，无需安装任何运行时。');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
