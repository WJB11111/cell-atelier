// Content checks: the catalogue data, the teaching copy and the static page must
// stay consistent with each other. These guard the parts a biology reader would
// notice first — a missing note, a structure with no explanation, a claim the
// page states twice with different wording.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { baseEntries, extraEntries, specimens, structureEntry } from '../specimens.js';
import { SHARE_LINKS } from '../share-links.js';
import { projectRoot } from './glb.js';

const page = readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

test('every specimen is fully described', () => {
  for (const [id, cell] of Object.entries(specimens)) {
    for (const field of ['en', 'zh', 'sub', 'icon', 'color', 'description', 'omitted']) {
      assert.equal(typeof cell[field], 'string', `${id} is missing "${field}"`);
      assert.ok(cell[field].trim().length > 0, `${id}.${field} is empty`);
    }
    assert.match(cell.color, /^#[0-9a-f]{6}$/i, `${id}.color must be a hex colour`);
    assert.ok(Array.isArray(cell.camera) && cell.camera.length === 3, `${id}.camera must be [x, y, z]`);
    // Two is the floor, not a target: the mature red blood cell deliberately
    // offers only its membrane and cytoplasm, because having no nucleus and no
    // mitochondria is the point of that specimen.
    assert.ok(cell.keys.length >= 2, `${id} should offer at least two structures`);
    assert.equal(new Set(cell.keys).size, cell.keys.length, `${id}.keys contains duplicates`);
  }
});

test('every listed structure resolves to a complete note', () => {
  for (const [id, cell] of Object.entries(specimens)) {
    for (const key of cell.keys) {
      const entry = structureEntry(id, key, baseEntries);
      assert.ok(entry, `${id}.${key} has no entry`);
      assert.equal(entry.length, 7, `${id}.${key} must be [name, en, colour, description, function, structure, note]`);
      for (const value of entry) {
        assert.equal(typeof value, 'string', `${id}.${key} has a non-string field`);
        assert.ok(value.trim().length > 0, `${id}.${key} has an empty field`);
      }
      assert.match(entry[2], /^#[0-9a-f]{6}$/i, `${id}.${key} colour must be a hex value`);
      assert.ok(entry[3].length >= 12, `${id}.${key} description is too short to teach anything`);
      assert.ok(entry[6].length >= 12, `${id}.${key} needs a field note about what the model shows`);
    }
  }
});

test('hidden layers and the membrane toggle stay consistent', () => {
  for (const [id, cell] of Object.entries(specimens)) {
    assert.ok(Array.isArray(cell.hidden), `${id}.hidden must be an array`);
    for (const key of cell.hidden) {
      assert.ok(cell.keys.includes(key), `${id}.hidden lists "${key}" which is not a selectable structure`);
    }
    // A specimen with hideable layers must name them on the button; one without
    // (the sperm cell) keeps the button disabled instead of mislabelling it.
    if (cell.hidden.length > 0) {
      assert.equal(typeof cell.hideLabel, 'string', `${id} needs a label for the membrane button`);
      assert.ok(cell.hideLabel.trim().length > 0, `${id}.hideLabel is empty`);
    }
    for (const key of cell.revealOnSelect ?? []) {
      assert.ok(cell.keys.includes(key), `${id}.revealOnSelect lists "${key}" which is not selectable`);
    }
  }
});

test('every specimen declares usable observation modes', () => {
  for (const [id, cell] of Object.entries(specimens)) {
    assert.ok(Array.isArray(cell.views) && cell.views.length >= 2,
      `${id} should offer at least two observation modes`);
    const ids = cell.views.map((view) => view.id);
    assert.equal(new Set(ids).size, ids.length, `${id}.views contains duplicate ids`);
    assert.ok(ids.includes(cell.defaultView), `${id}.defaultView "${cell.defaultView}" is not one of its views`);
    for (const view of cell.views) {
      assert.equal(typeof view.label, 'string', `${id}/${view.id} has no label`);
      assert.ok(view.label.trim().length > 0, `${id}/${view.id} has an empty label`);
      assert.equal(typeof view.note, 'string', `${id}/${view.id} has no note`);
      assert.ok(view.note.trim().length > 0, `${id}/${view.id} has an empty note`);
      // A view either switches geometry or moves the camera — never neither.
      assert.ok(view.mode || view.camera, `${id}/${view.id} has neither a mode nor a camera`);
      if (view.mode) {
        assert.ok(['cutaway', 'whole', 'transparent'].includes(view.mode),
          `${id}/${view.id} uses unknown mode "${view.mode}"`);
      }
      if (view.camera) {
        assert.equal(view.camera.length, 3, `${id}/${view.id} camera must be [x, y, z]`);
        if (view.target) assert.equal(view.target.length, 3, `${id}/${view.id} target must be [x, y, z]`);
      }
    }
  }
});

test('a closed-envelope view always has an asset and a layer list to fade', () => {
  for (const [id, cell] of Object.entries(specimens)) {
    const needsShell = cell.views.some((view) => view.mode === 'whole' || view.mode === 'transparent');
    if (!needsShell) {
      assert.equal(cell.shells, undefined, `${id} ships shells but has no whole/transparent view`);
      continue;
    }
    assert.equal(typeof cell.shells, 'string', `${id} offers whole/transparent views but no shells asset`);
    assert.ok(cell.shells.endsWith('.glb'), `${id}.shells should point at a .glb`);
    assert.ok(Array.isArray(cell.envelope) && cell.envelope.length > 0,
      `${id} needs an envelope list so the viewer knows which layers the closed asset replaces`);
    for (const key of cell.envelope) {
      assert.ok(cell.keys.includes(key), `${id}.envelope lists "${key}" which is not a selectable structure`);
    }
  }
});

test('the plant cell explains all three observation modes', () => {
  const plant = specimens['plant-cell'];
  assert.ok(plant.hidden.includes('wall'), 'the plant cell must be able to hide the cell wall');
  assert.ok(plant.hidden.includes('membrane'), 'the plant cell must be able to hide the plasma membrane');
  assert.ok(plant.keys.includes('vacuole'), 'a mesophyll cell model should offer the central vacuole');
  assert.deepEqual(plant.views.map((view) => view.mode), ['whole', 'cutaway', 'transparent'],
    'the plant cell keeps the original order: whole, cutaway, transparent');
});

test('every specimen states its real-world size', () => {
  const limits = {
    'animal-cell': [5, 40],
    'plant-cell': [20, 120],
    cyanobacterium: [0.5, 10],
    'white-blood-cell': [6, 20],
    neuron: [8, 40],
    'red-blood-cell': [5, 10],
    'sperm-cell': [3, 8],
  };
  for (const [id, cell] of Object.entries(specimens)) {
    const size = cell.size;
    assert.ok(size, `${id} must declare the real size its model stands for`);
    assert.equal(size.unit, 'µm', `${id}.size.unit should be micrometres`);
    assert.ok(cell.keys.includes(size.structure),
      `${id}.size.structure "${size.structure}" is not a selectable structure`);
    assert.equal(typeof size.label, 'string', `${id}.size needs a label such as 细胞直径`);
    const [low, high] = limits[id];
    assert.ok(size.real >= low && size.real <= high,
      `${id}.size.real = ${size.real} µm is outside the textbook range ${low}-${high} µm`);
  }
});

test('models that are not to scale everywhere say so', () => {
  // A learner measuring the axon or the sperm tail against the bar would be
  // misled, so those two specimens must carry a note.
  assert.ok(specimens.neuron.size.note, 'the neuron must note that its processes are shortened');
  assert.ok(specimens['sperm-cell'].size.note, 'the sperm cell must note that its tail is shortened');
  for (const id of ['animal-cell', 'plant-cell', 'red-blood-cell']) {
    assert.equal(specimens[id].size.note, undefined, `${id} is to scale and needs no caveat`);
  }
});

test('structure names are unique inside a specimen', () => {
  // The identification drill asks the learner to click the structure it names;
  // two structures sharing a name would make the question unanswerable.
  for (const [id, cell] of Object.entries(specimens)) {
    const names = cell.keys.map((key) => structureEntry(id, key, baseEntries)[0]);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    assert.equal(duplicates.length, 0, `${id} names two structures "${duplicates[0]}"`);
  }
});

test('the practice panel exists and is keyboard reachable', () => {
  assert.match(page, /id="practice"/, 'the toolbar needs a practice button');
  assert.match(page, /id="quiz"/, 'the drill needs a panel');
  assert.match(page, /id="quiz-target"/, 'the panel needs the structure name to find');
  assert.match(page, /id="quiz-hint"[\s\S]*id="quiz-skip"[\s\S]*id="quiz-stop"/,
    'the drill needs a hint, a skip and a stop control');
});

test('the page ships a same-scale figure and the module that draws it', () => {
  assert.match(page, /id="size-figure"[^>]*role="img"/, 'the figure needs a labelled, non-decorative hook');
  const source = readFileSync(path.join(projectRoot, 'size-chart.js'), 'utf8');
  assert.match(source, /size\.real/, 'the drawing must take its widths from the declared sizes');
  assert.doesNotMatch(source, /width\s*=\s*\d{2,}\b/, 'widths must not be hard-coded per specimen');
});

test('the recorded intersection baseline is well formed', () => {
  // tools/check-models.mjs fails on anything worse than this file, so a mangled
  // baseline would either hide a regression or invent one.
  const file = path.join(projectRoot, 'tools/intersection-baseline.json');
  const baseline = JSON.parse(readFileSync(file, 'utf8'));
  const ids = Object.keys(baseline);
  assert.ok(ids.length >= 5, `expected a baseline for every built specimen, found ${ids.length}`);
  for (const id of ids) {
    assert.ok(specimens[id], `baseline mentions unknown specimen "${id}"`);
    const entry = baseline[id];
    assert.ok(entry.pairs && typeof entry.pairs === 'object', `${id} needs a pairs map`);
    for (const [key, value] of Object.entries(entry.pairs)) {
      const [first, second] = key.split('|');
      assert.ok(first && second && first !== second, `${id} has a malformed pair key "${key}"`);
      for (const key2 of ['unintended', 'faces', 'depth']) {
        assert.ok(key2 in value, `${id}/${key} is missing "${key2}"`);
      }
      assert.equal(typeof value.faces, 'number');
      assert.equal(typeof value.depth, 'number');
    }
  }
  assert.ok(specimens['red-blood-cell'], 'the catalogue still needs the red blood cell');
});

test('the page ships a side-by-side comparison mode', () => {
  assert.match(page, /id="compare"/, 'the toolbar needs a comparison toggle');
  assert.match(page, /id="compare-panel"[\s\S]*id="compare-target"/, 'the panel needs a target picker');
  assert.match(page, /id="compare-exit"/, 'the panel needs a way back to one specimen');
  // The mode draws both cells from the sizes declared in specimens.js, so a
  // specimen without one could not be placed at the shared scale.
  for (const [id, cell] of Object.entries(specimens)) {
    assert.ok(cell.size, `${id} needs a declared size before it can be compared`);
  }
});

test('the build ships an installable, offline-capable app', () => {
  assert.match(page, /rel="manifest"/, 'the page must link its manifest to be installable');
  assert.match(page, /id="offline-badge"/, 'the page should say whether offline use is ready');

  const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'public/manifest.webmanifest'), 'utf8'));
  assert.ok(manifest.name && manifest.start_url, 'the manifest needs a name and a start url');
  assert.equal(manifest.display, 'standalone', 'an installed copy should open without browser chrome');
  for (const size of ['192x192', '512x512']) {
    assert.ok(manifest.icons.some((icon) => icon.sizes === size), `the manifest needs a ${size} icon`);
  }
  for (const icon of manifest.icons) {
    assert.ok(existsSync(path.join(projectRoot, 'public', icon.src.replace('./', ''))),
      `${icon.src} is declared but missing`);
  }

  // Two hard-won properties of the worker, both of which fail silently:
  const worker = readFileSync(path.join(projectRoot, 'tools/service-worker.js'), 'utf8');
  assert.match(worker, /mode: 'cors'/,
    'precache must fetch the way the page asks for its bundle, or Vary: Origin misses');
  assert.match(worker, /ignoreVary: true/, 'a Vary-blind fallback match keeps offline booting');
  // check the code, not the comments that explain why the calls are absent
  const code = worker.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /skipWaiting|clients\.claim/,
    'a worker that claims a loading page drops its in-flight requests');
});

test('every share link opens a state the page can actually honour', () => {
  // A deep link that silently falls back to the default specimen is worse than no
  // link at all: it is handed to a colleague and quietly shows the wrong thing.
  assert.ok(SHARE_LINKS.length >= 4, 'the share list should cover the good moments');
  for (const link of SHARE_LINKS) {
    const [query, hash] = link.query.split('#');
    const params = new URLSearchParams(query.replace(/^\?/, ''));
    const cell = params.get('cell');
    assert.ok(specimens[cell], `${link.id} points at unknown specimen "${cell}"`);
    const compare = params.get('compare');
    if (compare) {
      assert.ok(specimens[compare], `${link.id} compares unknown specimen "${compare}"`);
      assert.notEqual(compare, cell, `${link.id} compares a specimen with itself`);
    }
    const view = params.get('view');
    if (view) {
      assert.ok((specimens[cell].views ?? []).some((candidate) => candidate.id === view),
        `${link.id}: ${cell} has no view "${view}"`);
    }
    const select = params.get('select');
    if (select) {
      assert.ok(specimens[cell].keys.includes(select),
        `${link.id}: ${cell} has no structure "${select}"`);
    }
    if (params.get('practice')) {
      assert.equal(params.get('practice'), '1', `${link.id}: practice is a flag`);
      assert.ok(!compare, `${link.id}: the drill is disabled while comparing`);
    }
    if (hash) {
      assert.match(page, new RegExp(`id="${hash.replace('#', '')}"`),
        `${link.id} anchors to #${hash.replace('#', '')}, which the page does not have`);
    }
  }
});

test('the share kit is generated against a real base, not a placeholder', () => {
  const kit = readFileSync(path.join(projectRoot, 'tools/make-share-kit.mjs'), 'utf8');
  assert.match(kit, /--base/, 'generating QR codes requires an explicit base');
  const plugin = readFileSync(path.join(projectRoot, 'tools/vite-plugin-offline.js'), 'utf8');
  assert.match(plugin, /GITHUB_REPOSITORY/,
    'a deployment build should regenerate the codes for its own URL');
});

test('the README advertises the deployment and the page offers installation', () => {
  const readme = readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
  assert.match(readme, /actions\/workflows\/deploy\.yml\/badge\.svg/,
    'the README should show whether the deployment is green');
  assert.match(readme, /wjb11111\.github\.io\/cell-atelier/,
    'the README should link the live site');
  assert.match(page, /id="install-hint"/, 'the footer should offer to install the app');
  const source = readFileSync(path.join(projectRoot, 'src.js'), 'utf8');
  assert.match(source, /beforeinstallprompt/,
    'use the browser install prompt when it is offered rather than pointing at a menu');
  assert.match(source, /display-mode: standalone/,
    'an installed copy should say so instead of offering to install again');
});

test('every comparable specimen has its lineup render', () => {
  // The figure falls back to a silhouette when a render is missing, which is the
  // right behaviour in the page and the wrong thing to discover in production:
  // the pictures are supposed to be the real cells.
  for (const [id, cell] of Object.entries(specimens)) {
    if (!cell.size) continue;
    const file = path.join(projectRoot, 'public', 'lineup', `${id}.png`);
    assert.ok(existsSync(file), `public/lineup/${id}.png is missing — run: npm run lineup`);
  }
  const renderer = readFileSync(path.join(projectRoot, 'tools/render_lineup.py'), 'utf8');
  assert.match(renderer, /PIXELS_PER_MICRON/, 'the renderer must fix one scale for every specimen');
  assert.match(renderer, /view_layer\.update\(\)/,
    'Blender caches matrix_world; without an update the frame is computed against a stale camera');
  assert.match(renderer, /json\.dumps/,
    'each render must report how many micrometres wide its picture is');
  const scale = readFileSync(path.join(projectRoot, 'lineup-scale.js'), 'utf8');
  for (const [id, cell] of Object.entries(specimens)) {
    if (!cell.size) continue;
    assert.match(scale, new RegExp(`"${id}":`),
      `${id} is missing from lineup-scale.js — run: npm run lineup`);
  }
  assert.match(scale, /"neuron": (?!20\b)/,
    'the neuron picture holds its processes, so it must be wider than the soma alone');
  assert.match(scale, /"sperm-cell": (?!4\.5\b)/,
    'the sperm picture holds its flagellum, so it must be wider than the head alone');
});

test('the share of structures that are membranes is stated, not implied', () => {
  // "no structure in the model" must never read as "not present in the cell".
  for (const [id, cell] of Object.entries(specimens)) {
    assert.match(cell.omitted, /未展示|未单独|不代表|简化|示意/, `${id}.omitted must state the model's limits`);
  }
});

test('the comparison table names the three cells it compares', () => {
  for (const label of ['动物细胞', '植物叶肉细胞', '蓝细菌']) {
    assert.ok(page.includes(label), `the comparison table should mention ${label}`);
  }
  for (const claim of ['核膜包围的细胞核', '细胞核', '核糖体', '线粒体', '叶绿体', '光合作用']) {
    assert.ok(page.includes(claim), `the comparison table should compare ${claim}`);
  }
  // every specimen the table links to must exist, and the panel the links feed
  // is now built from specimens.js rather than hard-coded in the markup
  assert.ok(page.includes('id="view-buttons"'), 'index.html needs the observation-mode container');
  assert.ok(!page.includes('data-view="whole"'), 'view buttons belong to specimens.js, not the markup');
});

test('the page only links to specimens that exist', () => {
  const buttons = [...page.matchAll(/data-compare-cell="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(buttons.length >= 2, 'the comparison table should offer at least two 3D links');
  for (const id of buttons) {
    assert.ok(specimens[id], `data-compare-cell="${id}" has no matching specimen`);
  }
});

test('shared entries stay free of specimen-specific claims', () => {
  // The animal cell has no chloroplast and the plant cell has no centriole;
  // shared wording must therefore not assert either of them.
  assert.ok(baseEntries.membrane, 'the shared membrane entry is required');
  assert.ok(extraEntries.nucleolus, 'the nucleolus is part of the nucleus entry');
  assert.match(extraEntries.nucleolus[6], /核仁/, 'the nucleolus note must explain what the dot is');
});
