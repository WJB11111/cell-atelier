// A lineup of every specimen drawn on one ruler.
//
// The scale bar in the viewport answers "how big is this cell"; this answers "how
// big compared with the others", which a single-specimen view can never show.
//
// The pictures are real renders, made by tools/render_lineup.py at one fixed
// orthographic scale: each is cropped to its own cell, so an image's pixel width
// *is* that cell's real width, and lining them up on a ground line needs no
// per-specimen scaling. If a render is missing, the SVG silhouette below stands in
// — drawn in a micrometre coordinate system, so it is to scale too.

import { LINEUP_MICRONS } from './lineup-scale.js';
import { SHAPES } from './size-shapes.js';

const PIXELS_PER_MICRON = 5.2;
//: every silhouette stands on this ground line, in µm
const BASELINE = 22;
const CANVAS_HEIGHT = 26;
const MARGIN = 4.2;

function silhouette(id, cell, size) {
  const shape = SHAPES[id];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const width = size.real + MARGIN;
  svg.setAttribute('viewBox', `-0.6 0 ${width} ${CANVAS_HEIGHT}`);
  svg.setAttribute('width', String(width * PIXELS_PER_MICRON));
  svg.setAttribute('height', String(CANVAS_HEIGHT * PIXELS_PER_MICRON));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.setProperty('--cell-color', cell.color);
  if (shape) svg.innerHTML = `<g transform="translate(0 ${(BASELINE - shape.bottom).toFixed(2)})">${shape.draw()}</g>`;
  return svg;
}

export function createSizeChart(container, specimens) {
  const entries = Object.entries(specimens)
    .map(([id, cell]) => ({ id, cell, size: cell.size }))
    .filter((entry) => entry.size)
    .sort((a, b) => b.size.real - a.size.real);

  const row = document.createElement('div');
  row.className = 'size-row';

  for (const { id, cell, size } of entries) {
    const item = document.createElement('figure');
    item.className = `size-item size-${id}`;
    item.dataset.cell = id;

    // the picture is as wide as the specimen really is, which for two of them is
    // wider than the structure they are measured by
    const microns = LINEUP_MICRONS[id] ?? size.real;
    const pixels = microns * PIXELS_PER_MICRON;
    const img = document.createElement('img');
    img.src = `${import.meta.env.BASE_URL}lineup/${id}.png`;
    img.width = Math.round(pixels);
    img.alt = `${cell.zh}，按真实大小绘制，整体宽 ${microns} ${size.unit}`;
    img.style.setProperty('--cell-color', cell.color);
    img.addEventListener('error', () => {
      img.replaceWith(silhouette(id, cell, size));
    }, { once: true });
    item.append(img);

    // "20 µm" is the structure the specimen is measured by; where the whole cell
    // is wider, say so rather than letting the picture imply 20 µm across
    const whole = microns > size.real * 1.05
      ? `<i>整个细胞 ${Number(microns.toFixed(1))} ${size.unit}</i>` : '';
    const caption = document.createElement('figcaption');
    caption.innerHTML = `<b>${cell.zh}</b><span>${size.real} ${size.unit}</span>${whole}`
      + (size.note ? `<em>${size.note}</em>` : '');
    item.append(caption);
    row.append(item);
  }

  const ruler = document.createElement('div');
  ruler.className = 'size-ruler';
  const bar = 10;
  ruler.innerHTML = `<svg width="${(bar + 1) * PIXELS_PER_MICRON}" height="${4 * PIXELS_PER_MICRON}"
      viewBox="-0.5 0 ${bar + 1} 4" aria-hidden="true">
      <path class="size-rule" d="M0 3 V4 M0 3.5 H10 M10 3 V4" />
    </svg><span>10 µm</span>`;
  row.append(ruler);

  container.replaceChildren(row);
  container.setAttribute(
    'aria-label',
    `按同一比例绘制的标本大小对比：${entries.map((entry) => `${entry.cell.zh} ${entry.size.real} 微米`).join('，')}`,
  );
  return { entries, pixelsPerMicron: PIXELS_PER_MICRON, baseline: BASELINE };
}
