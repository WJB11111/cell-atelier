// Selection highlight: an outline pass over the chosen meshes plus a DOM label
// with a leader line, and a gentle camera move for compact structures.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TWEEN_MS = 460;
const COMPACT_LIMIT = 3.2;

export function createFocusView({ renderer, scene, camera, controls, mount }) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
  outline.edgeStrength = 4;
  outline.edgeThickness = 1.3;
  outline.edgeGlow = 0;
  outline.pulsePeriod = 0;
  outline.visibleEdgeColor.set('#d5a44b');
  outline.hiddenEdgeColor.set('#705878');
  outline.enabled = false;
  composer.addPass(outline);
  composer.addPass(new OutputPass());

  const label = document.createElement('div');
  label.className = 'focus-label';
  label.setAttribute('role', 'status');
  label.hidden = true;
  const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leader.classList.add('focus-leader');
  leader.setAttribute('aria-hidden', 'true');
  leader.innerHTML = '<path fill="none" stroke="currentColor" stroke-width="1.5"/>'
    + '<circle r="4" fill="currentColor" stroke="#f8f5ea" stroke-width="2"/>';
  leader.style.display = 'none';
  mount.append(leader, label);

  const bounds = new THREE.Box3();
  const centre = new THREE.Vector3();
  const size = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const world = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let chosen = [];
  let visibleMeshes = [];
  let anchor = null;
  let anchorStale = true;
  let lastScan = 0;
  let tween = null;
  let englishName = '';

  controls.addEventListener('change', () => { anchorStale = true; });
  controls.addEventListener('start', () => { tween = null; });

  function clear() {
    chosen = [];
    visibleMeshes = [];
    outline.selectedObjects = [];
    outline.enabled = false;
    anchor = null;
    tween = null;
    label.hidden = true;
    leader.style.display = 'none';
  }

  function moveCamera(targets) {
    bounds.makeEmpty();
    for (const object of targets) bounds.expandByObject(object);
    if (bounds.isEmpty()) return;
    bounds.getCenter(centre);
    bounds.getSize(size);

    // Dispersed groups (several mitochondria, the ER network) stay in context;
    // only compact structures get a closer look.
    const compact = size.length() < COMPACT_LIMIT;
    const aim = compact ? centre.clone() : new THREE.Vector3(0, 0.05, 0);
    const offset = camera.position.clone().sub(controls.target);
    const distance = compact
      ? THREE.MathUtils.clamp(size.length() * 2.8, 5.5, 9)
      : Math.max(12.5, offset.length());

    const from = camera.position.clone();
    const to = aim.clone().add(offset.normalize().multiplyScalar(distance));
    if (reducedMotion.matches) {
      camera.position.copy(to);
      controls.target.copy(aim);
      controls.update();
      tween = null;
      return;
    }
    tween = {
      start: performance.now(),
      from,
      to,
      targetFrom: controls.target.clone(),
      targetTo: aim,
    };
  }

  function select(objects, meshes, name, english, fit = true) {
    chosen = objects.filter((object) => object.visible);
    visibleMeshes = meshes;
    englishName = english;
    outline.selectedObjects = chosen;
    outline.enabled = chosen.length > 0;

    label.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = name;
    const subtitle = document.createElement('span');
    subtitle.textContent = english;
    label.append(title, subtitle);
    label.dataset.english = english;

    anchor = null;
    anchorStale = true;
    lastScan = 0;
    if (fit) moveCamera(chosen);
  }

  /**
   * Anchor the label to a real surface vertex instead of a bounding-box centre:
   * the centre of a merged multi-part structure usually sits in empty space.
   */
  function findAnchor() {
    camera.updateMatrixWorld();
    const candidates = [];
    for (const object of chosen) {
      const position = object.geometry.attributes.position;
      const step = Math.max(1, Math.floor(position.count / 120));
      for (let i = 0; i < position.count; i += step) {
        world.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        probe.copy(world).project(camera);
        if (Math.abs(probe.x) > 0.92 || Math.abs(probe.y) > 0.9 || Math.abs(probe.z) > 1) continue;
        candidates.push({ world: world.clone(), x: probe.x, y: probe.y, score: probe.x ** 2 + probe.y ** 2 });
      }
    }
    candidates.sort((a, b) => a.score - b.score);

    const visible = visibleMeshes.filter((mesh) => mesh.visible);
    let obscured = null;
    for (const candidate of candidates.slice(0, 36)) {
      ray.setFromCamera(new THREE.Vector2(candidate.x, candidate.y), camera);
      const own = ray.intersectObjects(chosen, false)[0];
      if (!own) continue;
      const first = ray.intersectObjects(visible, false)[0];
      if (first && chosen.includes(first.object)) {
        anchor = { point: first.point.clone(), hidden: false };
        return;
      }
      obscured ??= { point: own.point.clone(), hidden: true };
    }
    anchor = obscured;
  }

  function drawLabel(now) {
    if (!chosen.length) return;
    if (anchorStale && now - lastScan > 100) {
      findAnchor();
      lastScan = now;
      anchorStale = false;
    }
    if (!anchor) {
      label.hidden = true;
      leader.style.display = 'none';
      return;
    }

    probe.copy(anchor.point).project(camera);
    if (Math.abs(probe.x) > 1 || Math.abs(probe.y) > 1 || Math.abs(probe.z) > 1) {
      label.hidden = true;
      leader.style.display = 'none';
      return;
    }

    label.hidden = false;
    leader.style.display = 'block';
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const x = ((probe.x + 1) * width) / 2;
    const y = ((1 - probe.y) * height) / 2;
    const boxWidth = label.offsetWidth;
    const boxHeight = label.offsetHeight;
    const left = THREE.MathUtils.clamp(x < width / 2 ? x + 65 : x - boxWidth - 65, 10, Math.max(10, width - boxWidth - 10));
    const top = THREE.MathUtils.clamp(y - 80, 12, Math.max(12, height - boxHeight - 12));
    label.style.transform = `translate(${left}px, ${top}px)`;

    const anchorX = x < left ? left : left + boxWidth;
    const anchorY = top + boxHeight / 2;
    leader.setAttribute('viewBox', `0 0 ${width} ${height}`);
    leader.querySelector('path').setAttribute('d', `M ${x} ${y} L ${(x + anchorX) / 2} ${anchorY} L ${anchorX} ${anchorY}`);
    leader.querySelector('path').setAttribute('stroke-dasharray', anchor.hidden ? '4 3' : 'none');
    leader.querySelector('circle').setAttribute('cx', x);
    leader.querySelector('circle').setAttribute('cy', y);
    label.querySelector('span').textContent = englishName + (anchor.hidden ? ' · 位于遮挡后方' : '');
  }

  return {
    select,
    clear,
    /** Glide to a preset camera position (used by the observation modes). */
    flyTo(position, target) {
      const from = camera.position.clone();
      const to = new THREE.Vector3().fromArray(position);
      const targetFrom = controls.target.clone();
      const targetTo = new THREE.Vector3().fromArray(target ?? [0, 0.05, 0]);
      if (reducedMotion.matches) {
        camera.position.copy(to);
        controls.target.copy(targetTo);
        controls.update();
        tween = null;
      } else {
        tween = { start: performance.now(), from, to, targetFrom, targetTo };
      }
      anchorStale = true;
    },
    resize(width, height) {
      composer.setSize(width, height);
      anchorStale = true;
    },
    render(now = performance.now()) {
      if (tween) {
        const progress = Math.min(1, (now - tween.start) / TWEEN_MS);
        const eased = 1 - (1 - progress) ** 3;
        camera.position.lerpVectors(tween.from, tween.to, eased);
        controls.target.lerpVectors(tween.targetFrom, tween.targetTo, eased);
        if (progress === 1) tween = null;
        anchorStale = true;
      }
      controls.update();
      composer.render();
      drawLabel(now);
    },
  };
}
