// Release check: no specimen may gain an interpenetration.
//
// tools/check_intersections.py reports what overlaps; this runs it over every
// built .blend and fails when one of them is worse than the recorded baseline. It
// needs the models on disk, so run the Blender build scripts first — the check is
// a pre-release gate, not part of `npm test` (which has to stay runnable without
// Blender).
//
//   node tools/check-models.mjs                 # check against the baseline
//   node tools/check-models.mjs --update        # re-record the baseline
//   node tools/check-models.mjs --allow-missing # skip cleanly when Blender is absent
//
// Set BLENDER to the executable if it is not at the default path.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const DEFAULT_BLENDER = 'D:\\code\\_tools\\blender-5.2.1-windows-x64\\blender.exe';
const BASELINE = path.join(here, 'intersection-baseline.json');

//: every specimen the build scripts produce a .blend for
const SPECIMENS = [
  'animal-cell',
  'plant-cell',
  'cyanobacterium',
  'white-blood-cell',
  'neuron',
  'red-blood-cell',
  'sperm-cell',
];

const args = process.argv.slice(2);
const update = args.includes('--update');
const allowMissing = args.includes('--allow-missing');
const blender = process.env.BLENDER ?? DEFAULT_BLENDER;

if (!existsSync(blender)) {
  const message = `Blender not found at ${blender}. Set BLENDER to the executable.`;
  if (allowMissing) {
    console.log(`skip: ${message}`);
    process.exit(0);
  }
  console.error(message);
  process.exit(2);
}

const built = SPECIMENS.filter((id) => existsSync(path.join(root, `${id}.blend`)));
const absent = SPECIMENS.filter((id) => !built.includes(id));
if (absent.length) {
  console.log(`note: no .blend for ${absent.join(', ')} — build them first to include them`);
}

if (!built.length) {
  console.error('no .blend files found; run the Blender build scripts first');
  process.exit(2);
}

const failed = [];
for (const id of built) {
  const tail = update
    ? ['--update-baseline', BASELINE]
    : ['--baseline', BASELINE];
  const result = spawnSync(
    blender,
    ['--background', '--factory-startup', '--python', path.join(here, 'check_intersections.py'),
      '--', `${id}.blend`, ...tail],
    { stdio: 'inherit', cwd: root },
  );
  if (result.status !== 0) failed.push(id);
  else if (!update) console.log(`  ${id}: within baseline`);
}

if (update && !failed.length) {
  console.log(`baseline recorded for ${built.length} specimen(s) in ${path.basename(BASELINE)}`);
}

if (failed.length) {
  console.error(`\n${failed.length} specimen(s) regressed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nall ${built.length} specimen(s) within the recorded baseline`);
