// Compress the exported GLBs for delivery.
//
// The Blender scripts write plain float32 geometry, which is what tools/ and
// tests/ read. This step produces the files a classroom actually downloads:
// quantised attributes (positions to 14 bits, normals to 8, UVs to 12) packed
// with EXT_meshopt_compression. Quantisation alone would leave the buffers
// readable in Node; meshopt needs a decoder at runtime, so the raw assets stay in
// public/ and the compressed ones are built into dist/.
//
// Usage:
//   node tools/compress-glb.mjs <in-dir> <out-dir> [files...]

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const QUANTIZE = {
  // 14 bits of position is well under a pixel at any sane camera distance
  'POSITION': 14,
  'NORMAL': 8,
  'TEXCOORD_0': 12,
};

export async function compressGlb(io, source, target) {
  const document = await io.read(source);
  await document.transform(
    // weld first: the merged meshes carry duplicated vertices at every material
    // boundary, and dedup can only help once those share a vertex
    weld({ tolerance: 0.0001 }),
    resample(),
    prune({ keepAttributes: false }),
    dedup(),
    quantize(QUANTIZE),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  const bytes = await io.writeBinary(document);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return bytes.length;
}

async function main() {
  const [inDir, outDir, ...only] = process.argv.slice(2);
  if (!inDir || !outDir) {
    console.error('usage: node tools/compress-glb.mjs <in-dir> <out-dir> [files...]');
    process.exit(2);
  }
  await MeshoptEncoder.ready;
  // meshopt compression is deferred to write time, so the encoder has to be a
  // registered dependency of the I/O, not just an option of the transform
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

  const names = only.length
    ? only
    : (await readdir(inDir)).filter((name) => name.endsWith('.glb'));
  let before = 0;
  let after = 0;
  for (const name of names) {
    const source = path.join(inDir, name);
    const target = path.join(outDir, name);
    const original = (await stat(source)).size;
    const size = await compressGlb(io, source, target);
    before += original;
    after += size;
    const ratio = ((1 - size / original) * 100).toFixed(1);
    console.log(`  ${name.padEnd(30)} ${(original / 1e6).toFixed(2)} -> ${(size / 1e6).toFixed(2)} MB  (-${ratio}%)`);
  }
  console.log(`  ${'total'.padEnd(30)} ${(before / 1e6).toFixed(2)} -> ${(after / 1e6).toFixed(2)} MB  (-${((1 - after / before) * 100).toFixed(1)}%)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
