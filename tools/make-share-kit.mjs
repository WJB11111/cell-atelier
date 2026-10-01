// Turn the curated deep links into things a teacher can put on a slide.
//
//   npm run share -- --base https://<user>.github.io/cell-atelier/
//
// Writes QR images plus a printable sheet into docs/share/, and copies the images
// into public/share/ so the page can show them. The base matters: a QR code on a
// projector has to point at the real deployment, so the build regenerates these
// for the Pages URL (see tools/vite-plugin-offline.js) and records which base it
// used, because an on-screen QR that points somewhere else is worse than none.

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import QRCode from 'qrcode';

import { DEMO_PATH, SHARE_LINKS } from '../share-links.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

export async function writeShareKit(base, { quiet = false, publicDir, docsDir } = {}) {
  const normalised = base.endsWith('/') ? base : `${base}/`;
  const imagesDir = publicDir ?? path.join(root, 'public', 'share');
  const sheetDir = docsDir === null ? null : (docsDir ?? path.join(root, 'docs', 'share'));
  await mkdir(imagesDir, { recursive: true });
  if (sheetDir) await mkdir(sheetDir, { recursive: true });

  const rows = [];
  for (const link of SHARE_LINKS) {
    const url = normalised + link.query;
    const png = await QRCode.toBuffer(url, {
      type: 'png',
      width: 720,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#3a3340', light: '#ffffff' },
    });
    await writeFile(path.join(imagesDir, `${link.id}.png`), png);
    if (sheetDir) await writeFile(path.join(sheetDir, `${link.id}.png`), png);
    rows.push({ ...link, url });
    if (!quiet) console.log(`  ${link.id.padEnd(14)} ${url}`);
  }

  // the page reads this to state which address its QR images point at
  await writeFile(path.join(imagesDir, 'base.json'), JSON.stringify({ base: normalised }), 'utf8');

  if (sheetDir) {
    const sheet = [
      '# Cell Atelier · 分享用链接与二维码',
      '',
      `生成基准：\`${normalised}\``,
      '',
      '每一行都是一条**直接打开就停在某个画面**的链接，用手机扫二维码即可。',
      '',
      '| | 打开后看到 | 链接 | 二维码 |',
      '| --- | --- | --- | --- |',
      ...rows.map((row) => `| **${row.title}** | ${row.note} | \`${row.url}\` | [图片](./${row.id}.png) |`),
      '',
      `## 30 秒演示路径：${DEMO_PATH.map((id) => rows.find((row) => row.id === id)?.title ?? id).join(' → ')}`,
      '',
      '先并排两个细胞（"原来植物细胞这么大"）→ 立刻做一道辨认练习（"原来它能考人"）→ 最后给标尺与同尺度图（"原来屏幕上看到的大小是假的"）。',
      '',
    ].join('\n');
    await writeFile(path.join(sheetDir, 'README.md'), sheet, 'utf8');
  }
  return { count: rows.length, base: normalised };
}

function parseBase(argv) {
  const index = argv.indexOf('--base');
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value) return null;
  return value.endsWith('/') ? value : `${value}/`;
}

async function main() {
  const base = parseBase(process.argv.slice(2));
  if (!base) {
    console.error('usage: npm run share -- --base https://<user>.github.io/<repo>/');
    console.error('The base is required: a QR code has to point at the real deployment.');
    process.exit(2);
  }
  const result = await writeShareKit(base);
  console.log(`\n  docs/share/README.md   ${result.count} 条链接 + 二维码`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

