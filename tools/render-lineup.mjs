// Render the same-scale lineup: one image per specimen, all at one ortho scale.
//
//   npm run lineup
//
// Reads the declared sizes straight out of specimens.js so the renders and the
// page cannot disagree about how big anything is. Needs the .blend files, which
// the build scripts produce — run those first, as with npm run check:models.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { specimens } from '../specimens.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const DEFAULT_BLENDER = 'D:\\code\\_tools\\blender-5.2.1-windows-x64\\blender.exe';
const blender = process.env.BLENDER ?? DEFAULT_BLENDER;

if (!existsSync(blender)) {
  console.error(`Blender not found at ${blender}. Set BLENDER to the executable.`);
  process.exit(2);
}

await mkdir(path.join(root, 'public', 'lineup'), { recursive: true });

let rendered = 0;
for (const [id, cell] of Object.entries(specimens)) {
  if (!cell.size) continue;
  const blend = path.join(root, `${id}.blend`);
  if (!existsSync(blend)) {
    console.log(`  skip ${id}: no ${id}.blend (build it first)`);
    continue;
  }
  const result = spawnSync(blender, [
    '--background', '--factory-startup',
    '--python', path.join(here, 'render_lineup.py'),
    '--', `${id}.blend`, cell.size.structure, String(cell.size.real),
    path.join('public', 'lineup', `${id}.png`),
  ], { stdio: 'inherit', cwd: root });
  if (result.status !== 0) {
    console.error(`  ${id}: render failed`);
    process.exit(1);
  }
  rendered += 1;
}
console.log(`\n  ${rendered} lineup image(s) in public/lineup/`);
