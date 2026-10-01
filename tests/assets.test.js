// Asset checks: every exported GLB must exist, parse, stay within a size budget,
// and expose exactly the structures the page offers — a mesh with no entry would
// be unclickable, an entry with no mesh would be a dead button.

import assert from 'node:assert/strict';
import { readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { meshNodes, organelleIds, publicDir, readGlb } from './glb.js';
import { specimens } from '../specimens.js';

//: extra keys that belong to a structure visually but are not listed in `keys`
const AUXILIARY = new Set(['nucleolus']);
const FILE_BUDGET = 12e6;
const TOTAL_BUDGET = 24e6;

const catalogue = Object.keys(specimens);

test('the production compressor shrinks a GLB and keeps its structure', async () => {
  // The build rewrites every emitted GLB through this function, so a mistake
  // here would ship broken models. It is checked against a real asset rather
  // than a fixture: the file the pipeline produces is the only input that
  // matters. public/ keeps the raw files, so this does not disturb them.
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { MeshoptEncoder } = await import('meshoptimizer');
  const { compressGlb } = await import('../tools/compress-glb.mjs');
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

  const name = 'animal-cell-shells.glb';
  const { bytes: original } = readGlb(name);
  const source = path.join(publicDir, name);
  const target = path.join(tmpdir(), `cell-atelier-compress-${process.pid}.glb`);
  const size = await compressGlb(io, source, target);

  assert.ok(size < original * 0.5, `expected under half the size, got ${size} from ${original}`);
  // readGlb only resolves inside public/, and the compressed copy is written to a
  // temporary directory, so the JSON chunk is parsed here directly
  const binary = readFileSync(target);
  const json = JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString('utf8'));
  const extensions = json.extensionsUsed ?? [];
  assert.ok(extensions.includes('EXT_meshopt_compression'), 'compressed files must declare meshopt');
  assert.ok(extensions.includes('KHR_mesh_quantization'), 'quantised files must declare it');
  assert.deepEqual(
    organelleIds(json).sort(),
    organelleIds(readGlb(name).json).sort(),
    'compression must not drop or rename a structure',
  );
  rmSync(target, { force: true });
});

test('the catalogue and the exported assets stay in step', () => {
  let total = 0;
  for (const id of catalogue) {
    const { bytes } = readGlb(`${id}.glb`);
    total += bytes;
    assert.ok(bytes < FILE_BUDGET,
      `${id}.glb grew to ${(bytes / 1e6).toFixed(1)} MB, over the ${FILE_BUDGET / 1e6} MB budget`);
  }
  assert.ok(total < TOTAL_BUDGET,
    `the exported models total ${(total / 1e6).toFixed(1)} MB, over the ${TOTAL_BUDGET / 1e6} MB budget`);
});

for (const id of catalogue) {
  test(`${id}.glb is a valid binary glTF asset`, () => {
    const { json, binaryLength, bytes } = readGlb(`${id}.glb`);
    assert.equal(json.asset?.version, '2.0');
    assert.ok(binaryLength > 0, 'the binary chunk is empty');
    assert.ok(bytes > 50_000, `${id}.glb is only ${bytes} bytes — the export probably failed`);
  });

  test(`${id}.glb groups every mesh under a known structure`, () => {
    const { json } = readGlb(`${id}.glb`);
    const nodes = meshNodes(json);
    assert.ok(nodes.length > 0, 'the asset has no meshes');
    const known = new Set([...specimens[id].keys, ...AUXILIARY]);
    for (const node of nodes) {
      assert.ok(node.organelle, `mesh "${node.name}" has no organelle extras value`);
      assert.ok(known.has(node.organelle),
        `mesh "${node.name}" uses structure "${node.organelle}", which is not in specimens.js`);
      assert.ok(node.mesh?.primitives?.length, `mesh "${node.name}" has no primitives`);
    }
  });

  test(`${id}.glb covers every structure the page offers`, () => {
    const { json } = readGlb(`${id}.glb`);
    const present = new Set(organelleIds(json));
    for (const key of specimens[id].keys) {
      assert.ok(present.has(key), `structure "${key}" is listed in specimens.js but missing from ${id}.glb`);
    }
  });

  test(`${id}.glb has exactly one mesh per structure`, () => {
    // A leftover source object would export a second mesh under the same key and
    // be drawn on top of the first, which reads as z-fighting in the viewer.
    const { json } = readGlb(`${id}.glb`);
    const seen = new Map();
    for (const node of meshNodes(json)) {
      seen.set(node.organelle, (seen.get(node.organelle) ?? 0) + 1);
    }
    for (const [organelle, count] of seen) {
      assert.equal(count, 1, `${id}.glb exports ${count} meshes for "${organelle}", expected one`);
    }
  });

  test(`${id}.glb carries materials, normals and texture coordinates`, () => {
    const { json } = readGlb(`${id}.glb`);
    assert.ok((json.materials ?? []).length >= Math.min(2, specimens[id].keys.length),
      'expected at least one material per structure family');
    for (const node of meshNodes(json)) {
      for (const primitive of node.mesh.primitives) {
        assert.ok(primitive.attributes.NORMAL !== undefined, `${node.name} has no normals`);
        assert.ok(primitive.attributes.TEXCOORD_0 !== undefined,
          `${node.name} has no UVs (the viewer grain needs them)`);
        assert.ok(primitive.material !== undefined, `${node.name} has no material`);
      }
    }
  });
}

test('every structure sits inside a plausible bounding box', () => {
  // A stray vertex would blow up the framing the viewer computes from the model.
  for (const id of catalogue) {
    const { json } = readGlb(`${id}.glb`);
    for (const node of meshNodes(json)) {
      const accessor = json.accessors[node.mesh.primitives[0].attributes.POSITION];
      const extent = accessor.max.map((value, axis) => Math.abs(value - accessor.min[axis]));
      assert.ok(Math.max(...extent) < 14,
        `${id}/${node.organelle} spans ${Math.max(...extent).toFixed(1)} units — too large for the viewer`);
    }
  }
});

test('every declared closed envelope ships the layers it promises', () => {
  const withShells = catalogue.filter((id) => specimens[id].shells);
  assert.ok(withShells.length >= 4, 'expected closed envelopes for the sectioned specimens');
  for (const id of withShells) {
    const { json } = readGlb(specimens[id].shells);
    const nodes = meshNodes(json);
    assert.ok(nodes.length > 0, `${specimens[id].shells} has no meshes`);
    for (const node of nodes) {
      assert.equal(node.wholeShell, true,
        `${specimens[id].shells}/${node.organelle} is missing the wholeShell flag`);
    }
    const present = new Set(organelleIds(json));
    for (const key of specimens[id].envelope) {
      assert.ok(present.has(key),
        `${id}.envelope lists "${key}" but ${specimens[id].shells} does not contain it`);
    }
    assert.deepEqual([...present].sort(), [...specimens[id].envelope].sort(),
      `${specimens[id].shells} should contain exactly the declared envelope layers`);
  }
});

test('each closed envelope matches the footprint of the sectioned model', () => {
  const footprint = (document, organelle) => {
    const node = meshNodes(document).find((candidate) => candidate.organelle === organelle);
    assert.ok(node, `no mesh for ${organelle}`);
    const accessor = document.accessors[node.mesh.primitives[0].attributes.POSITION];
    return accessor.max.map((value, axis) => value - accessor.min[axis]);
  };
  for (const id of catalogue.filter((entry) => specimens[entry].shells)) {
    const sectioned = readGlb(`${id}.glb`);
    const shells = readGlb(specimens[id].shells);
    // The viewer cross-fades between the two, so a mismatch would visibly jump.
    // glTF is Y-up: index 0 and 2 are the footprint, index 1 is the height the
    // teaching section deliberately removes.
    for (const organelle of specimens[id].envelope) {
      const a = footprint(sectioned.json, organelle);
      const b = footprint(shells.json, organelle);
      for (const axis of [0, 2]) {
        assert.ok(Math.abs(a[axis] - b[axis]) < 0.5,
          `${id}/${organelle} axis ${axis} differs by ${Math.abs(a[axis] - b[axis]).toFixed(2)} `
          + 'between the sectioned model and its closed envelope');
      }
    }
  }
});
