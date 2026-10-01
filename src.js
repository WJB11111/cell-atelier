// Cell Atelier viewer: loads the Blender-exported GLB specimens, maps their
// meshes back to selectable structures and keeps the page in sync with the
// camera, the selection and the plant cell view modes.

import './style.css';
import './refinements.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { createFocusView } from './focus-view.js';
import { createViewLabels } from './view-labels.js';
import { createSizeChart } from './size-chart.js';
import { SHARE_LINKS } from './share-links.js';
import {
  baseEntries,
  extraEntries,
  membraneHiddenAfterSelection,
  specimens,
  structureEntry,
} from './specimens.js';

const assetBase = import.meta.env.BASE_URL;
const entries = { ...baseEntries, ...extraEntries };
const catalogueOrder = Object.keys(specimens);
//: how strongly the exported surfaces pick up the studio environment
const ENV_INTENSITY = 0.5;
const DEFAULT_CAMERA = [4.6, 8.8, 10.4];
const DEFAULT_TARGET = [0, 0.05, 0];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const dom = {
  mount: document.querySelector('#canvas'),
  viewer: document.querySelector('.viewer'),
  nav: document.querySelector('#organelles'),
  cellList: document.querySelector('.cell-list'),
  loading: document.querySelector('#loading'),
  title: document.querySelector('.title h1'),
  intro: document.querySelector('.title > p:last-child'),
  indexNote: document.querySelector('.index-note'),
  footerNote: document.querySelector('footer > span:last-child'),
  edition: document.querySelector('.edition span'),
  catalogFoot: document.querySelector('.catalog-foot'),
  detailIcon: document.querySelector('#detail-icon'),
  detailNumber: document.querySelector('.detail-number'),
  detailTitle: document.querySelector('#detail-title'),
  detailEn: document.querySelector('#detail-en'),
  detailDescription: document.querySelector('#detail-description'),
  detailFunction: document.querySelector('#detail-function'),
  detailStructure: document.querySelector('#detail-structure'),
  detailNote: document.querySelector('#detail-note'),
  download: document.querySelector('.download'),
  modePanel: document.querySelector('#view-modes'),
  viewButtons: document.querySelector('#view-buttons'),
  modeNote: document.querySelector('#mode-note'),
  labelsButton: document.querySelector('#labels'),
  scaleBar: document.querySelector('#scale-bar'),
  practice: document.querySelector('#practice'),
  compareButton: document.querySelector('#compare'),
  comparePanel: document.querySelector('#compare-panel'),
  compareSelect: document.querySelector('#compare-target'),
  compareNote: document.querySelector('#compare-note'),
  quiz: document.querySelector('#quiz'),
  quizCount: document.querySelector('#quiz-count'),
  quizPrompt: document.querySelector('.quiz-prompt'),
  quizTarget: document.querySelector('#quiz-target'),
  quizFeedback: document.querySelector('#quiz-feedback'),
  quizSummary: document.querySelector('#quiz-summary'),
  membraneButton: document.querySelector('#membrane'),
  isolateButton: document.querySelector('#isolate'),
  rotateButton: document.querySelector('#rotate'),
};

// ---------------------------------------------------------------- renderer

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.max(1, Math.min(window.devicePixelRatio, 1.7)));
renderer.setClearAlpha(0);
// A neutral tone map keeps the pastel teaching palette saturated; ACES washes
// the light greens and mauves out under this bright studio environment.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
dom.mount.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 90);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.86;
controls.autoRotateSpeed = 0.7;

const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
room.dispose();
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0xfff9ed, 0x8b7495, 0.45));
const keyLight = new THREE.DirectionalLight(0xfff3dc, 2.0);
keyLight.position.set(-4, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
keyLight.shadow.normalBias = 0.035;
keyLight.shadow.bias = -0.0001;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xd8d0ff, 0.55);
fillLight.position.set(5, 4, -3);
scene.add(fillLight);

// A deterministic microtexture gives the exported surfaces a subtle grain; it
// is generated in the browser and is not part of the downloadable GLB.
const grain = (() => {
  const size = 128;
  const data = new Uint8Array(size * size);
  let seed = 492;
  for (let i = 0; i < data.length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = 80 + (seed % 130);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 9);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
})();

// ---------------------------------------------------------------- state

let model = null;
let meshes = [];
let activeCell = catalogueOrder[0];
let selected = null;
let isolate = false;
let hideMembrane = false;
let selectionFocus = false;
let activeView = null;
//: The second specimen shown beside the active one, or null. Comparison draws
//: both at one common scale — the cells keep their real size ratio instead of
//: each filling its own viewport — and a structure selected by name is
//: highlighted in both, which is the whole point of putting them side by side.
let compareWith = null;
let compareView = null;
let labelsEnabled = false;
let loadVersion = 0;

const baseColors = new WeakMap();
const modelCache = new Map();
const groups = new Map();
const meshesByCell = new Map();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const focusView = createFocusView({ renderer, scene, camera, controls, mount: dom.mount });
const viewLabels = createViewLabels(dom.mount, camera, (key) => select(key, { source: 'nav' }));

//: the specimens a selection applies to: one normally, both while comparing
const cellScope = () => (compareWith ? [activeCell, compareWith] : [activeCell]);
const scoped = (mesh) => cellScope().includes(mesh.userData.cell);
//: the view each specimen is showing: comparison keeps the two in step by mode
const viewOf = (cellId) => (compareWith && cellId === compareWith ? compareView : activeView);

const entryFor = (key) => {
  for (const cellId of cellScope()) {
    const entry = structureEntry(cellId, key, entries);
    if (entry) return entry;
  }
  return undefined;
};
// The nucleolus belongs to the nucleus entry and follows its highlight.
const matches = (meshId, key) => meshId === key || (key === 'nucleus' && meshId === 'nucleolus');

// ------------------------------------------------------------ shareable state
// ?cell=plant-cell&view=whole&select=chloroplast&labels=1&compare=animal-cell
// keeps a classroom link pointing at the same specimen, structure and view.

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    cell: params.get('cell'),
    select: params.get('select'),
    view: params.get('view'),
    labels: params.get('labels') === '1',
    compare: params.get('compare'),
    practice: params.get('practice') === '1',
  };
}

function writeUrlState(patch) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.replaceState(null, '', url);
}

function idOf(object) {
  let node = object;
  while (node) {
    if (node.userData?.organelle) return node.userData.organelle;
    if (entries[node.name]) return node.name;
    node = node.parent;
  }
  return object.name;
}

// ---------------------------------------------------------------- catalogue

function buildCatalogue() {
  dom.cellList.replaceChildren();
  for (const id of catalogueOrder) {
    const cell = specimens[id];
    const button = document.createElement('button');
    button.className = 'specimen';
    button.dataset.cell = id;
    button.type = 'button';
    button.innerHTML = `<span class="cell-icon" style="color:${cell.color}">`
      + `<img src="${assetBase}thumbnails/${id}.png" alt="" width="44" height="44" loading="lazy">`
      + `</span><span>${cell.en}<small>${cell.zh} · ${cell.sub}</small></span>`;
    button.addEventListener('click', () => loadCell(id));
    dom.cellList.append(button);
  }
}

function buildNavigation() {
  // While comparing, the list holds the union of both specimens so one click can
  // highlight the same structure in each. Entries the other cell lacks are marked
  // rather than hidden: "叶绿体 — 只在植物细胞" is itself the lesson.
  const own = specimens[activeCell].keys;
  const other = compareWith ? specimens[compareWith].keys : [];
  const extras = other.filter((key) => !own.includes(key));
  dom.nav.replaceChildren();
  for (const key of [...own, ...extras]) {
    const entry = entryFor(key);
    if (!entry) continue;
    const shared = own.includes(key) && (!compareWith || other.includes(key));
    const single = compareWith && !shared
      ? `<span class="only">只在${specimens[own.includes(key) ? activeCell : compareWith].zh}</span>`
      : '';
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = key;
    button.setAttribute('aria-pressed', 'false');
    button.classList.toggle('solo', Boolean(single));
    button.innerHTML = `<span class="dot" style="--dot:${entry[2]}"></span>${entry[0]}`
      + `<span class="en">${entry[1]}</span>${single}`;
    button.addEventListener('click', () => select(key, { source: 'nav' }));
    dom.nav.append(button);
  }
}

// ---------------------------------------------------------------- details

function showOverviewDetails() {
  const cell = specimens[activeCell];
  dom.viewer.dataset.mode = 'overview';
  dom.detailNumber.textContent = 'WHOLE SPECIMEN / 整体浏览';
  dom.detailTitle.textContent = cell.zh;
  dom.detailEn.textContent = cell.en;
  dom.detailDescription.textContent = '点击左侧结构名称或模型，查看对应位置、结构与功能。';
  dom.detailFunction.textContent = '整体观察与结构定位';
  dom.detailStructure.textContent = cell.sub;
  dom.detailNote.textContent = cell.omitted;
  dom.detailIcon.style.color = cell.color;
}

function showStructureDetails(key) {
  const entry = entryFor(key);
  if (!entry) return;
  dom.detailNumber.textContent = 'SELECTED STRUCTURE / 当前结构';
  dom.detailTitle.textContent = entry[0];
  dom.detailEn.textContent = entry[1];
  dom.detailIcon.style.color = entry[2];
  dom.detailDescription.textContent = entry[3];
  dom.detailFunction.textContent = entry[4];
  dom.detailStructure.textContent = entry[5];
  dom.detailNote.textContent = entry[6];
}

// ---------------------------------------------------------------- selection

function select(key, { source = 'model' } = {}) {
  if (!entryFor(key)) return;
  // In practice mode a click is an answer, not a browse.
  if (practice.active && source !== 'practice') {
    answerPractice(key, source);
    return;
  }
  // A structure hidden inside the closed envelope can only be shown in section.
  if (activeView?.mode === 'whole' && !envelopeKeys().has(key)) {
    const cutaway = viewsOf().find((view) => view.mode === 'cutaway');
    if (cutaway) applyView(cutaway.id);
  }
  selected = key;
  selectionFocus = true;
  dom.isolateButton.disabled = false;
  stopAutoRotate();
  hideMembrane = membraneHiddenAfterSelection(activeCell, key, hideMembrane);
  dom.membraneButton.setAttribute('aria-pressed', String(hideMembrane));
  showStructureDetails(key);
  dom.nav.querySelectorAll('button').forEach((button) => {
    const active = button.dataset.key === key;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  dom.viewer.dataset.mode = 'focus';
  writeUrlState({ select: key });
  update();
  syncFocus(true);
}

function overview() {
  selected = null;
  selectionFocus = false;
  isolate = false;
  writeUrlState({ select: null });
  dom.isolateButton.disabled = true;
  dom.isolateButton.setAttribute('aria-pressed', 'false');
  focusView.clear();
  dom.nav.querySelectorAll('button').forEach((button) => {
    button.classList.remove('active');
    button.setAttribute('aria-pressed', 'false');
  });
  showOverviewDetails();
  update();
}

function syncFocus(fit = false) {
  if (!selectionFocus || !selected) {
    focusView.clear();
    return;
  }
  const targets = meshes.filter((mesh) => mesh.visible && scoped(mesh) && matches(idOf(mesh), selected));
  const entry = entryFor(selected);
  focusView.select(targets, meshes, entry[0], entry[1], fit);
}

// ---------------------------------------------------------------- visibility

function update() {
  const envelope = envelopeKeys(activeCell);

  for (const mesh of meshes) {
    const id = idOf(mesh);
    const cellId = mesh.userData.cell;
    const cell = specimens[cellId];
    const view = viewOf(cellId);
    const own = cell.envelope ?? [];
    const showShell = view?.mode === 'whole' || view?.mode === 'transparent';
    const fadeShell = view?.mode === 'transparent';
    const chosen = selectionFocus && matches(id, selected) && scoped(mesh);
    const shell = Boolean(mesh.userData.wholeShell);

    if (isolate) {
      mesh.visible = chosen;
    } else if (shell) {
      // the closed envelope belongs to the whole and transparent modes only
      mesh.visible = showShell;
    } else if (own.includes(id) && showShell) {
      // the sectioned envelope steps aside while the closed one is shown
      mesh.visible = false;
    } else {
      mesh.visible = true;
    }
    if (!isolate && hideMembrane && cell.hidden.includes(id)) mesh.visible = false;

    const fadedShell = shell && fadeShell;
    mesh.castShadow = !fadedShell;
    // outer layers blend last so the stack reads front-to-back
    mesh.renderOrder = fadedShell ? 2 + (own.length - 1 - own.indexOf(id)) : 0;

    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (baseColors.has(material)) material.color.copy(baseColors.get(material));
      if (selectionFocus && !chosen && !isolate) material.color.lerp(new THREE.Color('#a8a296'), 0.62);
      if (material.emissive) {
        material.emissive.set(chosen ? entryFor(selected)[2] : 0x000000);
        material.emissiveIntensity = chosen ? 0.08 : 0;
      }
      if (fadedShell) {
        material.transparent = true;
        material.opacity = id === 'wall' ? 0.12 : 0.08;
        material.depthWrite = false;
        material.side = THREE.FrontSide;
        // A faded envelope should read as tinted glass: damping the environment
        // response keeps specular highlights from turning it into a bright haze.
        material.envMapIntensity = 0.05;
        material.roughness = 0.95;
      } else {
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.side = THREE.DoubleSide;
        material.envMapIntensity = ENV_INTENSITY;
        material.roughness = mesh.userData.baseRoughness ?? material.roughness;
      }
      material.needsUpdate = true;
    }
  }

  dom.viewButtons.querySelectorAll('[data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === activeView?.id));
  });
  dom.viewer.dataset.viewMode = activeView?.id ?? '';
  dom.modeNote.textContent = activeView?.note ?? '';

  const labelItems = [];
  for (const cellId of cellScope()) {
    const cell = specimens[cellId];
    const view = viewOf(cellId);
    const own = cell.envelope ?? [];
    for (const key of cell.keys) {
      labelItems.push({
        key: compareWith ? `${cellId}:${key}` : key,
        name: structureEntry(cellId, key, entries)[0],
        objects: meshes.filter((mesh) => mesh.userData.cell === cellId && mesh.visible
          && matches(idOf(mesh), key)
          && (view?.mode !== 'whole' || own.includes(key))),
      });
    }
  }
  viewLabels.setItems(labelItems);
  viewLabels.setEnabled(labelsEnabled);
  dom.mount.classList.toggle('all-labels', labelsEnabled);
  syncFocus();
}

function setViewMode(value) {
  viewMode = value;
  hideMembrane = false;
  dom.membraneButton.setAttribute('aria-pressed', 'false');
  isolate = false;
  dom.isolateButton.setAttribute('aria-pressed', 'false');
  writeUrlState({ view: value });
  overview();
}

// ------------------------------------------------------------ observation modes
// Each specimen declares its own views: either geometry modes (cutaway shows the
// sectioned envelope that ships with the model, whole and transparent cross-fade
// in `<id>-shells.glb`) or camera presets for specimens that are not sectioned.

const viewsOf = (id = activeCell) => specimens[id].views ?? [];
const envelopeKeys = (id = activeCell) => specimens[id].envelope ?? [];
const defaultTarget = () => DEFAULT_TARGET;

function buildViewPanel() {
  const views = viewsOf();
  dom.viewButtons.replaceChildren();
  for (const view of views) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.view = view.id;
    button.textContent = view.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => applyView(view.id));
    dom.viewButtons.append(button);
  }
  dom.modePanel.hidden = views.length === 0;
}

function applyView(id, { instant = false } = {}) {
  const views = viewsOf();
  const view = views.find((candidate) => candidate.id === id) ?? views[0];
  if (!view) return;
  activeView = view;
  hideMembrane = false;
  dom.membraneButton.setAttribute('aria-pressed', 'false');
  isolate = false;
  dom.isolateButton.setAttribute('aria-pressed', 'false');
  if (compareWith) {
    // One mode, two specimens: each cell picks its own view for that mode, and
    // the pair's framing replaces the single-specimen camera presets.
    applyComparisonView(view.mode);
    writeUrlState({ view: view.id });
    overview();
    frameComparison(instant);
    return;
  }
  if (view.camera) {
    const target = view.target ?? defaultTarget();
    if (instant) {
      camera.position.fromArray(view.camera);
      controls.target.fromArray(target);
      controls.update();
    } else {
      focusView.flyTo(view.camera, target);
    }
  }
  writeUrlState({ view: view.id });
  overview();
}

// ------------------------------------------------------------ real-world scale
// Each specimen declares which structure stands for how many micrometres, so the
// viewer can print a scale bar that tracks the camera. This is the one fact a
// screen cannot convey on its own: a cell is nothing like the size it looks.

const SCALE_STEPS = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2];
let scaleInfo = null;

function measureScale() {
  const size = specimens[activeCell].size;
  if (!size || !meshesOf(size.structure, activeCell).length) return null;
  if (compareWith) {
    // Both groups are drawn at the coarser of the two scales, which is exactly
    // what the bar then reports — one ruler for two cells.
    const shared = Math.max(micronPerUnit(activeCell), micronPerUnit(compareWith));
    return {
      perUnit: shared,
      unit: size.unit,
      // short on purpose: the bar sits next to the toolbar, and the panel already
      // spells out both declared sizes
      label: '两标本同一比例',
      note: '',
    };
  }
  const world = spanFor(activeCell, size.structure);
  if (world <= 0) return null;
  return { perUnit: size.real / world, unit: size.unit, label: size.label, note: size.note };
}

/** Widest horizontal world extent of one structure, in the model's own units. */
function spanFor(cellId, key) {
  const box = new THREE.Box3();
  for (const mesh of meshesOf(key, cellId)) box.expandByObject(mesh);
  if (box.isEmpty()) return 0;
  const span = box.getSize(new THREE.Vector3());
  return Math.max(span.x, span.z);
}

function meshesOf(key, cellId = activeCell) {
  return meshes.filter((mesh) => mesh.userData.cell === cellId && matches(idOf(mesh), key));
}

function updateScaleBar() {
  const bar = dom.scaleBar;
  if (!scaleInfo) {
    bar.hidden = true;
    return;
  }
  const centre = controls.target.clone();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const width = dom.mount.clientWidth;
  const projected = centre.clone().project(camera);
  if (projected.z > 1) {
    bar.hidden = true;
    return;
  }
  for (const step of SCALE_STEPS) {
    const world = step / scaleInfo.perUnit;
    const edge = centre.clone().addScaledVector(right, world).project(camera);
    const pixels = Math.abs(edge.x - projected.x) * (width / 2);
    if (pixels >= 56 && pixels <= 230) {
      bar.hidden = false;
      bar.style.width = `${Math.round(pixels)}px`;
      bar.querySelector('b').textContent = `${step} ${scaleInfo.unit}`;
      bar.querySelector('span').textContent = scaleInfo.label;
      bar.querySelector('em').textContent = scaleInfo.note ?? '';
      return;
    }
  }
  bar.hidden = true;
}

// ---------------------------------------------------------------- comparison
// Two specimens in one scene, at one scale. Each model still declares its real
// size in specimens.js, so the scale factor between the two groups is derived
// from those declarations instead of being eyeballed: a 50 µm leaf cell really
// does dwarf a 20 µm animal cell.

function micronPerUnit(cellId) {
  const size = specimens[cellId].size;
  if (!size) return 1;
  const box = new THREE.Box3();
  for (const mesh of meshes) {
    if (mesh.userData.cell === cellId && matches(idOf(mesh), size.structure)) {
      box.expandByObject(mesh);
    }
  }
  if (box.isEmpty()) return 1;
  const span = box.getSize(new THREE.Vector3());
  const world = Math.max(span.x, span.z);
  return world > 0 ? size.real / world : 1;
}

function layoutComparison() {
  const ids = cellScope();
  for (const cellId of ids) {
    const group = groups.get(cellId);
    if (!group) continue;
    group.scale.setScalar(1);
    group.position.set(0, 0, 0);
    group.updateMatrixWorld(true);
  }
  if (ids.length < 2) return;

  const perUnit = new Map(ids.map((cellId) => [cellId, micronPerUnit(cellId)]));
  const shared = Math.max(...perUnit.values());
  const boxes = new Map();
  const widths = new Map();
  for (const cellId of ids) {
    const group = groups.get(cellId);
    group.scale.setScalar(perUnit.get(cellId) / shared);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    boxes.set(cellId, box);
    widths.set(cellId, Math.max(0.2, box.getSize(new THREE.Vector3()).x));
  }

  const gap = 0.16 * Math.max(...widths.values());
  const total = [...widths.values()].reduce((sum, width) => sum + width, 0) + gap * (ids.length - 1);
  let cursor = -total / 2;
  for (const cellId of ids) {
    const group = groups.get(cellId);
    const centre = boxes.get(cellId).getCenter(new THREE.Vector3());
    group.position.x += cursor + widths.get(cellId) / 2 - centre.x;
    // line them up vertically and in depth, so neither floats behind the other
    group.position.y -= centre.y;
    group.position.z -= centre.z;
    cursor += widths.get(cellId) + gap;
  }
}

function frameComparison(instant = true) {
  const box = new THREE.Box3();
  for (const cellId of cellScope()) {
    const group = groups.get(cellId);
    if (group) box.expandByObject(group);
  }
  if (box.isEmpty()) return;
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // The camera's fov is vertical, so a wide pair is limited by the horizontal
  // fit: take whichever constraint needs the greater distance.
  const vertical = (Math.max(size.y, size.z) * 0.6) / Math.tan((camera.fov * Math.PI) / 360);
  const horizontal = (size.x * 0.58) / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  const distance = Math.max(vertical, horizontal);
  const direction = new THREE.Vector3(0.28, 0.5, 1).normalize();
  const to = centre.clone().addScaledVector(direction, distance);
  if (instant || reducedMotion.matches) {
    camera.position.copy(to);
    controls.target.copy(centre);
    controls.update();
  } else {
    focusView.flyTo(to.toArray(), centre.toArray());
  }
}

function applyComparisonView(mode) {
  const pick = (cellId) => {
    const views = viewsOf(cellId);
    return views.find((view) => view.mode === mode)
      ?? views.find((view) => view.mode === 'cutaway')
      ?? views[0] ?? null;
  };
  activeView = pick(activeCell);
  compareView = compareWith ? pick(compareWith) : null;
}

async function setComparison(cellId, { instant = false } = {}) {
  if (!cellId || !specimens[cellId] || cellId === activeCell) {
    exitComparison();
    return;
  }
  compareWith = cellId;
  if (practice.active) endPractice(false);
  dom.practice.disabled = true;
  dom.compareSelect.value = cellId;
  dom.comparePanel.hidden = false;
  dom.compareButton.setAttribute('aria-pressed', 'true');
  writeUrlState({ compare: cellId });

  const loading = dom.loading;
  loading.hidden = false;
  loading.textContent = `正在准备${specimens[activeCell].zh}与${specimens[cellId].zh}…`;
  dom.viewer.setAttribute('aria-busy', 'true');
  try {
    if (!(await attachModel(cellId))) return;
    if (!(await attachModel(activeCell))) return;
    applyComparisonView(activeView?.mode ?? 'cutaway');
    layoutComparison();
    buildNavigation();
    scaleInfo = measureScale();
    frameComparison(instant);
    dom.title.innerHTML = `${specimens[activeCell].en} × ${specimens[cellId].en}`
      + `<span>${specimens[activeCell].zh} 与 ${specimens[cellId].zh}</span>`;
    dom.compareNote.textContent = `两标本按同一比例绘制：${specimens[activeCell].zh} `
      + `${specimens[activeCell].size.real} ${specimens[activeCell].size.unit}，`
      + `${specimens[cellId].zh} ${specimens[cellId].size.real} ${specimens[cellId].size.unit}。`;
    overview();
  } finally {
    loading.hidden = true;
    dom.viewer.setAttribute('aria-busy', 'false');
  }
}

function exitComparison() {
  if (!compareWith) return;
  const previous = compareWith;
  compareWith = null;
  compareView = null;
  const group = groups.get(previous);
  if (group) scene.remove(group);
  dom.comparePanel.hidden = true;
  dom.compareButton.setAttribute('aria-pressed', 'false');
  dom.practice.disabled = false;
  writeUrlState({ compare: null });
  loadCell(activeCell);
}

// ---------------------------------------------------------------- practice
// Structure identification drill: the page names a structure, the learner clicks
// it on the model. Clicking the name in the left column also "works" but is
// recorded separately — the labels are right there, so that is recall with help,
// not identification.

const practice = {
  active: false,
  queue: [],
  index: 0,
  current: null,
  results: [],
  hinted: false,
  answeredViaNav: false,
  //: pending auto-advance after a correct answer, so skipping is never swallowed
  timer: null,
};

function clearPracticeTimer() {
  if (practice.timer) clearTimeout(practice.timer);
  practice.timer = null;
}

function shuffled(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function startPractice() {
  if (compareWith) return;   // two cells would make every question ambiguous
  clearPracticeTimer();
  writeUrlState({ practice: '1' });
  practice.active = true;
  practice.queue = shuffled(specimens[activeCell].keys);
  practice.index = 0;
  practice.results = [];
  dom.practice.setAttribute('aria-pressed', 'true');
  dom.quiz.hidden = false;
  dom.quizSummary.hidden = true;
  dom.nav.classList.add('quiz-mode');
  nextQuestion();
}

function endPractice(showSummary = false) {
  clearPracticeTimer();
  practice.active = false;
  writeUrlState({ practice: null });
  practice.current = null;
  dom.practice.setAttribute('aria-pressed', 'false');
  dom.nav.classList.remove('quiz-mode');
  if (!showSummary) {
    dom.quiz.hidden = true;
    overview();
    return;
  }
  const independent = practice.results.filter((result) => result.outcome === 'independent').length;
  const helped = practice.results.filter((result) => result.outcome === 'helped').length;
  const skipped = practice.results.filter((result) => result.outcome === 'skipped').length;
  const missed = practice.results.filter((result) => result.outcome === 'missed');
  dom.quizCount.textContent = `共 ${practice.results.length} 题`;
  dom.quizTarget.textContent = '';
  dom.quizPrompt.firstChild.textContent = '练习结束：';
  dom.quizFeedback.textContent = '';
  dom.quizSummary.hidden = false;
  dom.quizSummary.innerHTML = `<p><b>${independent}</b> 题独立答对 · <b>${helped}</b> 题借助提示或名称 · `
    + `<b>${skipped}</b> 题跳过</p>`
    + (missed.length
      ? `<p class="quiz-missed">需要再看一遍：${missed.map((result) => result.name).join('、')}</p>`
      : '<p class="quiz-missed">全部答对，可以换一个标本继续。</p>')
    + '<p class="quiz-again"><button id="quiz-again" type="button">再来一轮</button></p>';
  dom.quizSummary.querySelector('#quiz-again').addEventListener('click', startPractice);
}

function nextQuestion() {
  clearPracticeTimer();
  if (practice.index >= practice.queue.length) {
    endPractice(true);
    return;
  }
  practice.current = practice.queue[practice.index];
  practice.hinted = false;
  practice.answeredViaNav = false;
  practice.missed = false;
  overview();
  // make sure the answer can actually be seen: a structure behind the closed
  // envelope would be unanswerable
  const target = practice.current;
  if (!meshes.some((mesh) => mesh.visible && matches(idOf(mesh), target))) {
    const cutaway = viewsOf().find((view) => view.mode === 'cutaway');
    if (cutaway) applyView(cutaway.id, { instant: true });
    overview();
  }
  dom.quizCount.textContent = `第 ${practice.index + 1} / ${practice.queue.length} 题`;
  dom.quizPrompt.firstChild.textContent = '请点出：';
  dom.quizTarget.textContent = entryFor(target)[0];
  dom.quizFeedback.textContent = '';
  dom.quizFeedback.className = 'quiz-feedback';
  dom.quizSummary.hidden = true;
  update();
}

function answerPractice(key, source) {
  if (!practice.active || !practice.current) return false;
  const target = practice.current;
  if (source !== 'model') practice.answeredViaNav = true;
  if (!matches(key, target)) {
    practice.missed = true;
    const name = entryFor(key)?.[0] ?? key;
    dom.quizFeedback.className = 'quiz-feedback wrong';
    dom.quizFeedback.textContent = `这是${name}，再找找${entryFor(target)[0]}。`;
    return false;
  }
  const outcome = practice.answeredViaNav ? 'helped' : practice.hinted ? 'helped' : 'independent';
  practice.results.push({
    key: target,
    name: entryFor(target)[0],
    outcome: practice.missed ? 'missed' : outcome,
  });
  dom.quizFeedback.className = 'quiz-feedback right';
  dom.quizFeedback.textContent = practice.missed
    ? '答对了，不过先看错了位置。'
    : practice.hinted ? '答对了（用过提示）。' : '答对了。';
  practice.index += 1;
  // show the answer's note for a moment, then move on
  select(target, { source: 'practice' });
  clearPracticeTimer();
  practice.timer = setTimeout(() => {
    practice.timer = null;
    if (practice.active) nextQuestion();
  }, 2600);
  return true;
}

function stopAutoRotate() {
  controls.autoRotate = false;
  dom.rotateButton.setAttribute('aria-pressed', 'false');
}

function reset() {
  labelsEnabled = false;
  dom.labelsButton.setAttribute('aria-pressed', 'false');
  hideMembrane = false;
  stopAutoRotate();
  if (practice.active) endPractice(false);
  dom.membraneButton.setAttribute('aria-pressed', 'false');
  dom.isolateButton.setAttribute('aria-pressed', 'false');
  if (compareWith) {
    layoutComparison();
    applyComparisonView(activeView?.mode ?? 'cutaway');
    applyView(activeView?.id ?? viewsOf()[0]?.id, { instant: true });
    return;
  }
  camera.position.fromArray(specimens[activeCell].camera ?? DEFAULT_CAMERA);
  controls.target.fromArray(defaultTarget());
  controls.update();
  applyView(specimens[activeCell].defaultView ?? viewsOf()[0]?.id, { instant: true });
}

// ---------------------------------------------------------------- loading

function prepareMaterials(mesh) {
  if (mesh.userData.prepared) return;
  mesh.material = Array.isArray(mesh.material)
    ? mesh.material.map((material) => material.clone())
    : mesh.material.clone();
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    baseColors.set(material, material.color.clone());
    mesh.userData.baseRoughness ??= material.roughness;
  }
  mesh.userData.prepared = true;
}

// The production bundle ships meshopt-compressed assets; the decoder is only
// consulted when a file actually declares EXT_meshopt_compression, so the same
// loader serves the plain assets the dev server hands out.
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

function loadModel(id) {
  if (!modelCache.has(id)) {
    const promise = gltfLoader
      .loadAsync(`${assetBase}${id}.glb`)
      .catch((error) => {
        modelCache.delete(id);
        throw error;
      });
    modelCache.set(id, promise);
  }
  return modelCache.get(id);
}

async function attachModel(id) {
  const gltf = await loadModel(id);

  // Specimens with a sectioned envelope also ship a closed one, used by the
  // whole and transparent views; it is a separate asset so the downloadable GLB
  // stays the teaching model.
  const shellsAsset = specimens[id].shells;
  if (shellsAsset && !gltf.scene.userData.hasShells) {
    if (!modelCache.has(shellsAsset)) {
      modelCache.set(shellsAsset, gltfLoader.loadAsync(`${assetBase}${shellsAsset}`)
        .catch((error) => {
          modelCache.delete(shellsAsset);
          throw error;
        }));
    }
    const shells = await modelCache.get(shellsAsset);
    gltf.scene.add(shells.scene);
    gltf.scene.userData.hasShells = true;
  }

  // Each specimen gets its own group. The cached gltf scene keeps an identity
  // transform, so comparison can scale and offset the two independently.
  let group = groups.get(id);
  if (!group) {
    group = new THREE.Group();
    group.name = `specimen:${id}`;
    groups.set(id, group);
  }
  group.clear();
  group.add(gltf.scene);
  group.position.set(0, 0, 0);
  group.scale.setScalar(1);
  if (!group.parent) scene.add(group);

  const own = [];
  group.traverse((object) => {
    if (!object.isMesh) return;
    prepareMaterials(object);
    object.userData.cell = id;
    own.push(object);
    object.castShadow = true;
    object.receiveShadow = true;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.side = THREE.DoubleSide;
      material.envMapIntensity = ENV_INTENSITY;
      if (object.geometry.attributes.uv) {
        material.bumpMap = grain;
        material.bumpScale = 0.025;
        material.needsUpdate = true;
      }
    }
  });
  meshesByCell.set(id, own);
  rebuildMeshes();
  return gltf;
}

function detachModel(id) {
  const group = groups.get(id);
  if (group) scene.remove(group);
  meshesByCell.delete(id);
  rebuildMeshes();
}

function rebuildMeshes() {
  meshes = [];
  for (const cellId of groups.keys()) {
    for (const mesh of meshesByCell.get(cellId) ?? []) {
      if (!meshes.includes(mesh)) meshes.push(mesh);
    }
  }
}

async function loadCell(id) {
  const version = ++loadVersion;
  if (practice.active) endPractice(false);
  const loading = dom.loading;
  loading.hidden = false;
  loading.textContent = `正在准备${specimens[id].zh}…`;
  dom.viewer.setAttribute('aria-busy', 'true');

  try {
    await attachModel(id);
    if (version !== loadVersion) return;

    // A direct specimen switch leaves comparison; its partner is detached here
    // and `compareWith` is cleared so the scope helpers stop seeing it.
    if (compareWith && compareWith !== id) detachModel(compareWith);
    if (compareWith === id) compareWith = null;
    compareView = null;
    dom.comparePanel.hidden = true;
    dom.compareButton.setAttribute('aria-pressed', 'false');
    dom.practice.disabled = false;

    for (const cellId of [...groups.keys()]) {
      if (cellId !== id) detachModel(cellId);
    }
    activeCell = id;
    model = groups.get(id);

    const cell = specimens[id];
    dom.title.innerHTML = `${cell.en}<span>${cell.zh}</span>`;
    dom.intro.textContent = cell.description;
    dom.indexNote.textContent = `${cell.zh} / ${cell.sub}`;
    dom.footerNote.textContent = `${cell.zh} / 可交互模型`;
    dom.edition.textContent = `№ 00${catalogueOrder.indexOf(id) + 1}`;
    dom.viewer.dataset.specimen = id;
    dom.catalogFoot.textContent = '教学简化示意 · 非真实比例与颜色';
    // Only the specimen changes here: clearing `select` before the bootstrap
    // reapplies it would briefly publish a link without the chosen structure.
    writeUrlState({ cell: id });
    dom.download.href = `${assetBase}${id}.glb`;
    dom.download.setAttribute('download', '');
    dom.download.removeAttribute('aria-disabled');

    const hasMembraneToggle = cell.hidden.length > 0;
    dom.membraneButton.disabled = !hasMembraneToggle;
    dom.membraneButton.textContent = hasMembraneToggle
      ? `◌ ${cell.hideLabel ?? '隐藏细胞膜'}`
      : '◌ 细胞膜未单独建模';
    buildViewPanel();

    dom.cellList.querySelectorAll('button').forEach((button) => {
      const active = button.dataset.cell === id;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });

    buildNavigation();
    reset();
    scaleInfo = measureScale();
    updateScaleBar();
    loading.hidden = true;
  } catch (error) {
    if (version === loadVersion) {
      loading.hidden = false;
      loading.textContent = '模型加载失败，请点击左侧标本重试。';
      console.error(error);
    }
  } finally {
    if (version === loadVersion) dom.viewer.setAttribute('aria-busy', 'false');
  }
}

// ---------------------------------------------------------------- first run
// Three lines that turn "a 3D thing opened" into "I know what to do here". Shown
// once; the buttons it mentions are all in the toolbar, which is easy to miss on
// a projector. Never shown for a deep link: whoever followed one already knows
// what they came for.

const FIRST_RUN_KEY = 'cell-atelier:visited';

function firstVisit() {
  try {
    return localStorage.getItem(FIRST_RUN_KEY) === '1';
  } catch (error) {
    return true;   // storage blocked: do not nag
  }
}

function showFirstRun(state) {
  const panel = document.querySelector('#firstrun');
  if (!panel) return;
  panel.hidden = false;
  const close = document.querySelector('#firstrun-close');
  close.addEventListener('click', () => {
    panel.hidden = true;
    try {
      localStorage.setItem(FIRST_RUN_KEY, '1');
    } catch (error) {
      // Private mode: the hint simply shows again next time.
    }
  });
  // A shared link is a guided tour already; do not talk over it.
  if (state.compare || state.select || state.practice || state.view) panel.hidden = true;
  close.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- share section
// The same list tools/make-share-kit.mjs turns into QR images, rendered against
// whatever origin the page is actually served from — so the links a teacher
// copies are the links that work.

function buildShareSection() {
  const container = document.querySelector('#share-links');
  if (!container) return;
  const base = `${window.location.origin}${assetBase}`;
  container.replaceChildren();

  // The QR images are generated for the deployment address, which is not
  // necessarily where this page is being viewed (localhost, a preview server).
  // Saying so is better than showing a code that leads somewhere else.
  fetch(`${assetBase}share/base.json`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const target = document.querySelector('#share-base');
      if (!target) return;
      if (!data?.base) {
        target.textContent = '二维码请用 npm run share -- --base <网址> 生成。';
        return;
      }
      // Hosts are case-insensitive, and GitHub's API reports the owner's casing
      // while the browser lower-cases it — comparing literally made the page
      // claim its own QR codes pointed somewhere else.
      const same = data.base.toLowerCase() === base.toLowerCase();
      target.textContent = same
        ? `二维码指向 ${data.base}`
        : `二维码指向 ${data.base}；当前地址是 ${base}，请以链接文本为准。`;
      target.dataset.match = String(same);
    })
    .catch(() => {});

  for (const link of SHARE_LINKS) {
    const url = `${base}${link.query}`;
    const row = document.createElement('article');
    row.className = 'share-card';
    row.innerHTML = `<img src="${assetBase}share/${link.id}.png" alt="" width="132" height="132" loading="lazy">`
      + `<div><h3>${link.title}</h3><p>${link.note}</p>`
      + `<code>${url}</code></div>`
      + '<button type="button" class="share-copy">复制链接</button>';
    const button = row.querySelector('.share-copy');
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        button.textContent = '已复制';
      } catch (error) {
        // Clipboard permission can be denied; the URL is on screen either way.
        button.textContent = '请手动复制';
      }
      setTimeout(() => { button.textContent = '复制链接'; }, 1800);
    });
    container.append(row);
  }
}

// ---------------------------------------------------------------- install hint
// "Installable" is only true of the production build — dev has no service worker —
// and only worth offering until it has been done. When Chrome offers an install
// prompt, the footer becomes the button instead of telling people to hunt through
// a menu.

let installPrompt = null;

function updateInstallHint() {
  const hint = document.querySelector('#install-hint');
  if (!hint) return;
  const installed = window.matchMedia('(display-mode: standalone)').matches;
  hint.replaceChildren();
  hint.onclick = null;
  if (installed) {
    hint.textContent = '已安装为应用 · 可离线使用';
    hint.dataset.state = 'installed';
    return;
  }
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    hint.textContent = '动物细胞 / 可交互模型';
    hint.dataset.state = 'plain';
    return;
  }
  if (installPrompt) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '⤓ 安装为应用（可离线使用）';
    hint.append(button);
    hint.dataset.state = 'ready';
    hint.onclick = async () => {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      updateInstallHint();
    };
    return;
  }
  hint.textContent = '可在浏览器菜单选择「安装」或「添加到主屏幕」，之后可离线使用';
  hint.dataset.state = 'hint';
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  updateInstallHint();
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  updateInstallHint();
});

// ---------------------------------------------------------------- offline
// The production build ships a service worker that precaches the shell and every
// model, so a lesson keeps working when the projector's network does not. Dev
// runs without it: a cache in front of Vite's HMR would be worse than useless.

const offlineBadge = document.querySelector('#offline-badge');

function setOfflineBadge(text, state) {
  if (!offlineBadge) return;
  offlineBadge.hidden = !text;
  offlineBadge.textContent = text;
  offlineBadge.dataset.state = state;
}

async function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // Set the state before awaiting: offline, the registration's update check has to
  // time out first, and the badge would sit empty for seconds.
  if (navigator.serviceWorker.controller) setOfflineBadge('离线可用', 'ready');
  else setOfflineBadge('正在缓存…', 'pending');
  try {
    const registration = await navigator.serviceWorker.register(`${assetBase}sw.js`, { scope: assetBase });
    const show = (message) => {
      if (!message || message.type === undefined) return;
      if (message.type === 'warming') {
        setOfflineBadge(`离线缓存 ${message.cached}/${message.total}`, 'pending');
        return;
      }
      if (message.type === 'warm') {
        setOfflineBadge('离线可用', 'ready');
        return;
      }
      // "ready" only means the shell is in: the models are still missing, so the
      // page must not claim offline use yet — that is the state a teacher would
      // rely on, unplug the network, and find an empty viewer.
      if (message.cached !== undefined) {
        setOfflineBadge(`离线缓存 ${message.cached}/${message.total}`, 'pending');
      }
    };
    navigator.serviceWorker.addEventListener('message', (event) => show(event.data));
    if (registration.waiting) {
      setOfflineBadge('有新版本，刷新后生效', 'pending');
    }
    // an install is also worth offering once the shell is cached
    updateInstallHint();

    // Ask whichever worker is current to fetch the models in the background. The
    // message has to keep being offered: on a first visit the worker is still
    // installing, and after an update it waits until the last tab closes.
    const warm = () => {
      const worker = navigator.serviceWorker.controller ?? registration.active ?? registration.waiting;
      try {
        worker?.postMessage('warm');
      } catch (error) {
        // a worker that has not finished installing cannot take messages yet
      }
    };
    warm();
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'activated') warm();
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', warm);
    setTimeout(warm, 3000);
    setTimeout(warm, 12000);
  } catch (error) {
    // Offline support is a bonus: a failure here must not disturb the viewer.
    console.warn('offline support unavailable', error);
  }
}

// ---------------------------------------------------------------- interaction

let pointerDown = { x: 0, y: 0 };
renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const candidates = meshes.filter((mesh) => mesh.visible
    && !(mesh.userData.wholeShell && activeView?.mode === 'transparent'));
  const hit = raycaster.intersectObjects(candidates, false)
    .find((intersection) => entries[idOf(intersection.object)]);
  if (!hit) return;
  const id = idOf(hit.object);
  select(id === 'nucleolus' ? 'nucleus' : id);
});

dom.rotateButton.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  dom.rotateButton.setAttribute('aria-pressed', String(controls.autoRotate));
});

dom.membraneButton.addEventListener('click', () => {
  hideMembrane = !hideMembrane;
  dom.membraneButton.setAttribute('aria-pressed', String(hideMembrane));
  if (hideMembrane && specimens[activeCell].hidden.includes(selected)) overview();
  else update();
});

dom.isolateButton.addEventListener('click', () => {
  isolate = !isolate;
  dom.isolateButton.setAttribute('aria-pressed', String(isolate));
  update();
});

document.querySelector('#reset').addEventListener('click', reset);

document.querySelector('#capture').addEventListener('click', () => {
  focusView.render();
  const link = document.createElement('a');
  link.download = `cell-atelier-${activeCell}.png`;
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
});

dom.labelsButton.addEventListener('click', () => {
  labelsEnabled = !labelsEnabled;
  dom.labelsButton.setAttribute('aria-pressed', String(labelsEnabled));
  writeUrlState({ labels: labelsEnabled ? '1' : null });
  update();
});

// ---------------------------------------------------------------- comparison controls

function fillCompareOptions() {
  const options = catalogueOrder.filter((id) => id !== activeCell);
  dom.compareSelect.replaceChildren();
  for (const id of options) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = `${specimens[id].zh} · ${specimens[id].en}`;
    dom.compareSelect.append(option);
  }
  // The animal/plant pair is the one the comparison table below already teaches,
  // so it is the default whenever neither cell is part of it.
  const preferred = [activeCell, compareWith].includes('animal-cell') ? 'plant-cell' : 'animal-cell';
  dom.compareSelect.value = compareWith ?? (options.includes(preferred) ? preferred : options[0]);
}

dom.compareButton.addEventListener('click', () => {
  if (compareWith) exitComparison();
  else setComparison(dom.compareSelect.value, { instant: false });
});

dom.compareSelect.addEventListener('change', () => {
  if (compareWith) setComparison(dom.compareSelect.value, { instant: false });
});

document.querySelector('#compare-exit').addEventListener('click', () => exitComparison());

// ---------------------------------------------------------------- practice controls

dom.practice.addEventListener('click', () => {
  if (practice.active) endPractice(false);
  else startPractice();
});

document.querySelector('#quiz-hint').addEventListener('click', () => {
  if (!practice.active || !practice.current) return;
  practice.hinted = true;
  // a hint is a real hint: everything else fades and the target is outlined
  selected = practice.current;
  selectionFocus = true;
  isolate = false;
  update();
  syncFocus(true);
  dom.quizFeedback.className = 'quiz-feedback';
  dom.quizFeedback.textContent = '提示：只有目标结构保持原色。';
});

document.querySelector('#quiz-skip').addEventListener('click', () => {
  if (!practice.active || !practice.current) return;
  clearPracticeTimer();
  practice.results.push({
    key: practice.current,
    name: entryFor(practice.current)[0],
    outcome: 'skipped',
  });
  practice.index += 1;
  nextQuestion();
});

document.querySelector('#quiz-stop').addEventListener('click', () => endPractice(false));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (practice.active) endPractice(false);
  else overview();
});

for (const button of document.querySelectorAll('[data-compare-cell]')) {
  button.addEventListener('click', async () => {
    await loadCell(button.dataset.compareCell);
    dom.viewer.scrollIntoView({ block: 'start', behavior: 'auto' });
  });
}

// ---------------------------------------------------------------- loop

new ResizeObserver(() => {
  const { width, height } = dom.mount.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  // Keep a stable horizontal field of view on tall, narrow viewports.
  const halfVertical = THREE.MathUtils.degToRad(18);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfVertical) / Math.min(1, camera.aspect)));
  camera.updateProjectionMatrix();
  focusView.resize(width, height);
}).observe(dom.mount);

renderer.setAnimationLoop((now) => {
  focusView.render(now);
  viewLabels.render();
  updateScaleBar();
});

buildCatalogue();
createSizeChart(document.querySelector('#size-figure'), specimens);
buildShareSection();
const initialState = readUrlState();
if (initialState.cell && specimens[initialState.cell]) activeCell = initialState.cell;
fillCompareOptions();
buildNavigation();
reset();
await loadCell(activeCell);
if (initialState.view && viewsOf().some((view) => view.id === initialState.view)) {
  applyView(initialState.view);
}
if (initialState.labels) {
  labelsEnabled = true;
  dom.labelsButton.setAttribute('aria-pressed', 'true');
  update();
}
if (initialState.compare && specimens[initialState.compare]
  && initialState.compare !== activeCell) {
  await setComparison(initialState.compare, { instant: true });
}
if (initialState.select && specimens[activeCell].keys.includes(initialState.select)) {
  select(initialState.select);
}
if (initialState.practice && !compareWith) startPractice();
if (!firstVisit()) showFirstRun(initialState);
updateInstallHint();
registerOffline();

// Read-only snapshot of the viewer state, used by tools/inspect-page.mjs and
// handy when a teacher reports "the model is not there".
window.cellAtelier = {
  // Exposed for tools/inspect-page.mjs; the viewer itself never reads it.
  scene,
  renderer,
  get state() {
    const mat = (mesh) => (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
    return {
      specimen: activeCell,
      compare: compareWith,
      selected,
      view: activeView?.id ?? null,
      viewMode: activeView?.mode ?? null,
      views: viewsOf().map((view) => view.id),
      envelope: envelopeKeys(),
      shellsLoaded: meshes.some((mesh) => mesh.userData.wholeShell),
      scale: scaleInfo,
      hideMembrane,
      isolate,
      labelsEnabled,
      loading: !dom.loading.hidden,
      canvas: {
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        clientWidth: dom.mount.clientWidth,
        clientHeight: dom.mount.clientHeight,
      },
      camera: camera.position.toArray().map((value) => Number(value.toFixed(2))),
      structures: specimens[activeCell].keys,
      resolvedStructures: specimens[activeCell].keys.filter((key) => Boolean(entryFor(key))),
      urlSelect: new URLSearchParams(window.location.search).get('select'),
      meshes: meshes.map((mesh) => ({
        id: idOf(mesh),
        shell: Boolean(mesh.userData.wholeShell),
        visible: mesh.visible,
        opacity: mat(mesh)?.opacity,
        transparent: mat(mesh)?.transparent,
      })),
    };
  },
};
