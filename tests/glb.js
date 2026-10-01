// Shared helpers for reading the exported glTF binary files in tests.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export const projectRoot = path.resolve(here, '..');
export const publicDir = path.join(projectRoot, 'public');

/** Parse a .glb container and return its JSON chunk plus binary chunk length. */
export function readGlb(relativePath) {
  const file = path.join(publicDir, relativePath);
  const buffer = readFileSync(file);
  const magic = buffer.toString('utf8', 0, 4);
  if (magic !== 'glTF') throw new Error(`${relativePath} is not a binary glTF file (magic=${magic})`);
  const version = buffer.readUInt32LE(4);
  const total = buffer.readUInt32LE(8);
  if (version !== 2) throw new Error(`${relativePath} uses glTF version ${version}, expected 2`);
  if (total !== buffer.length) throw new Error(`${relativePath} declares ${total} bytes but is ${buffer.length}`);

  let offset = 12;
  let json = null;
  let binaryLength = 0;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.toString('utf8', offset + 4, offset + 8);
    const start = offset + 8;
    if (chunkType === 'JSON') json = JSON.parse(buffer.toString('utf8', start, start + chunkLength));
    if (chunkType.startsWith('BIN')) binaryLength = chunkLength;
    offset = start + chunkLength + ((4 - (chunkLength % 4)) % 4);
  }
  if (!json) throw new Error(`${relativePath} has no JSON chunk`);
  return { json, binaryLength, bytes: buffer.length, path: file };
}

/** Every mesh node of a glTF document, with its extras and material. */
export function meshNodes(document) {
  const nodes = document.nodes ?? [];
  return nodes
    .filter((node) => node.mesh !== undefined)
    .map((node) => ({
      name: node.name ?? '',
      organelle: node.extras?.organelle ?? null,
      wholeShell: node.extras?.wholeShell === true,
      mesh: (document.meshes ?? [])[node.mesh],
    }));
}

export function organelleIds(document) {
  return [...new Set(meshNodes(document).map((node) => node.organelle).filter(Boolean))].sort();
}
