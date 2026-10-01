// Structure labels for the plant cell: one clickable button per structure,
// anchored on a real surface vertex and connected with a leader line.

import * as THREE from 'three';

const SIDE_MARGIN = 100;

export function createViewLabels(mount, camera, onSelect) {
  const layer = document.createElement('div');
  layer.className = 'structure-labels';
  layer.hidden = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  layer.append(svg);
  mount.append(layer);

  let items = [];
  let enabled = false;

  function anchorFor(object) {
    object.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(object);
    const centre = box.getCenter(new THREE.Vector3());
    const position = object.geometry.attributes.position;
    const point = new THREE.Vector3();
    const anchor = new THREE.Vector3();
    let best = Infinity;
    // the surface vertex closest to the structure centre reads as "on" it
    const step = Math.max(1, Math.floor(position.count / 400));
    for (let i = 0; i < position.count; i += step) {
      point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      const distance = point.distanceToSquared(centre);
      if (distance < best) {
        best = distance;
        anchor.copy(point);
      }
    }
    return anchor;
  }

  function setItems(groups) {
    for (const item of items) item.button.remove();
    svg.replaceChildren();
    items = groups.map(({ key, name, objects }) => {
      const object = objects.find((candidate) => candidate.geometry.attributes.position.count > 0);
      if (!object) return null;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.addEventListener('click', () => onSelect(key));
      layer.append(button);
      const path = document.createElementNS(svg.namespaceURI, 'path');
      svg.append(path);
      return { key, objects, anchor: anchorFor(object), button, path };
    }).filter(Boolean);
  }

  function setEnabled(value) {
    enabled = value;
    layer.hidden = !value;
  }

  // Labels are repositioned at a lower rate than the renderer runs and only write
  // when a position actually changed: transform and path writes on a dozen
  // elements every frame are pure layout churn while a cell is being dragged.
  const LABEL_INTERVAL = 40;
  let lastRender = -Infinity;
  const written = new Map();

  function render(now = performance.now()) {
    if (!enabled) return;
    if (now - lastRender < LABEL_INTERVAL) return;
    lastRender = now;
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const viewBox = `0 0 ${width} ${height}`;
    if (svg.getAttribute('viewBox') !== viewBox) svg.setAttribute('viewBox', viewBox);

    const sides = [[], []];
    for (const item of items) {
      const projected = item.anchor.clone().project(camera);
      const onScreen = item.objects.some((object) => object.visible)
        && Math.abs(projected.z) < 1
        && Math.abs(projected.x) < 1
        && Math.abs(projected.y) < 1;
      if (item.button.hidden === onScreen) item.button.hidden = !onScreen;
      const display = onScreen ? '' : 'none';
      if (item.path.style.display !== display) item.path.style.display = display;
      if (onScreen) {
        sides[projected.x < 0 ? 0 : 1].push({
          ...item,
          x: ((projected.x + 1) * width) / 2,
          y: ((1 - projected.y) * height) / 2,
        });
      }
    }

    // Spread the buttons evenly down each side so leaders never cross.
    sides.forEach((side, index) => {
      side.sort((a, b) => a.y - b.y);
      const step = Math.min(48, (height - 230) / Math.max(1, side.length));
      side.forEach((item, position) => {
        const y = Math.max(135, (height - side.length * step) / 2) + position * step;
        const x = index ? width - SIDE_MARGIN : 12;
        const transform = `translate(${x}px, ${y}px)`;
        const path = `M ${item.x} ${item.y} L ${index ? x : x + 86} ${y + 15}`;
        const previous = written.get(item.key) ?? {};
        if (previous.transform !== transform) {
          item.button.style.transform = transform;
          previous.transform = transform;
        }
        if (previous.path !== path) {
          item.path.setAttribute('d', path);
          previous.path = path;
        }
        written.set(item.key, previous);
      });
    });
  }

  return { setItems, setEnabled, render };
}
