// Build step: prepare the assets the classroom actually downloads.
//
// Two jobs, in this order, and the order is the reason they live in one function
// rather than two plugins: the offline worker's precache list and revision digest
// must describe the *compressed* files. Two independent `closeBundle` hooks are
// not guaranteed to run in plugin-array order, and the first attempt proved it —
// the worker was written before compression and advertised 18.5 MB of assets that
// no longer existed.
//
//   public/  raw assets, what tools/ and tests/ read
//   dist/    compressed assets + a service worker that precaches all of them

import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';

import { compressGlb } from './compress-glb.mjs';
import { writeShareKit } from './make-share-kit.mjs';

const SW_NAME = 'sw.js';
//: never precache the worker itself, and skip source maps
const EXCLUDED = /(^|\/)(sw\.js|.*\.map)$/;

async function collect(dir, base = '') {
  const found = [];
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;   // no bundle on disk
  }
  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await collect(path.join(dir, entry.name), relative)));
    else found.push(relative);
  }
  return found;
}

export async function compressBundle(root) {
  const files = (await collect(root)).filter((name) => name.endsWith('.glb'));
  if (!files.length) return null;
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

  let before = 0;
  let after = 0;
  for (const name of files) {
    const file = path.join(root, name);
    const original = (await stat(file)).size;
    before += original;
    after += await compressGlb(io, file, file);
  }
  return { files: files.length, before, after };
}

export async function writeServiceWorker(root) {
  const files = (await collect(root)).filter((name) => !EXCLUDED.test(name)).sort();
  if (!files.length) return null;

  const digest = createHash('sha256');
  let bytes = 0;
  for (const name of files) {
    const size = (await stat(path.join(root, name))).size;
    digest.update(name);
    digest.update(String(size));
    bytes += size;
  }
  const revision = digest.digest('hex').slice(0, 12);

  const template = await readFile(path.join(import.meta.dirname, 'service-worker.js'), 'utf8');
  const source = template
    .replace('__CACHE_NAME__', `cell-atelier-${revision}`)
    .replace('__PRECACHE__', JSON.stringify(files.map((name) => `./${name}`), null, 0));
  await writeFile(path.join(root, SW_NAME), source);
  return { files: files.length, bytes, revision };
}

/** Vite plugin that runs both steps, in order, once the bundle is on disk. */
export function prepareBundle({ dir = 'dist' } = {}) {
  return {
    name: 'cell-atelier:bundle',
    apply: 'build',
    async closeBundle() {
      const root = path.resolve(dir);

      // On Pages the deployment URL is known, so the QR images are regenerated
      // for it — written straight into dist/, since public/ has already been
      // copied by this point in the build.
      const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
      if (process.env.GITHUB_PAGES === 'true' && owner && repository) {
        const kit = await writeShareKit(`https://${owner}.github.io/${repository}/`, {
          quiet: true,
          publicDir: path.join(root, 'share'),
          docsDir: null,
        });
        this.info(`share links regenerated for ${kit.base}`);
      }

      const compressed = await compressBundle(root);
      if (compressed) {
        const saved = ((1 - compressed.after / compressed.before) * 100).toFixed(0);
        this.info(
          `compressed ${compressed.files} GLB assets: ${(compressed.before / 1e6).toFixed(1)} MB -> `
          + `${(compressed.after / 1e6).toFixed(1)} MB (-${saved}%)`,
        );
      }
      const worker = await writeServiceWorker(root);
      if (worker) {
        this.info(
          `offline worker ${SW_NAME}: ${worker.files} files, ${(worker.bytes / 1e6).toFixed(1)} MB `
          + `precached, cache cell-atelier-${worker.revision}`,
        );
      }
    },
  };
}
