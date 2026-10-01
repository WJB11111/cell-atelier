// A lineup of every specimen drawn on one ruler.
//
// The scale bar in the viewport answers "how big is this cell"; this answers "how
// big compared with the others", which a single-specimen view can never show.
//
// Each silhouette is an SVG whose coordinate system *is* micrometres, so the
// drawing cannot drift away from the declared sizes: a 50 µm leaf cell is drawn
// 50 units wide and scaled once, at the end, by a single pixels-per-micron
// factor. Plain circles were the first attempt and read as abstract blobs — the
// shapes below carry just enough anatomy (a lobed nucleus, a biconcave disc,
// grana) to be recognisable at a glance.

const PIXELS_PER_MICRON = 6.2;
//: every silhouette stands on this ground line, in µm
const BASELINE = 22;
const CANVAS_HEIGHT = 26;

const outline = (id) => `size-outline size-outline-${id}`;

/**
 * Each entry draws its specimen in µm units and reports where its own bottom is,
 * so the row can stand on one ground line. Shapes that a real cell continues
 * beyond the measured dimension (an axon, a flagellum) are drawn as a dashed stub
 * with a continuation mark: everything drawn is to scale, and what is not drawn
 * is not measured.
 */
const SHAPES = {
  'animal-cell': {
    bottom: 20,
    draw: () => `
      <circle class="${outline('animal')}" cx="10" cy="10" r="10" />
      <circle class="size-nucleus" cx="7" cy="8.4" r="3.4" />
      <circle class="size-nucleolus" cx="6" cy="7.6" r="1.3" />
      <ellipse class="size-organelle" cx="15" cy="14.4" rx="2.6" ry="1" transform="rotate(-24 15 14.4)" />
      <ellipse class="size-organelle" cx="6" cy="15.4" rx="2.2" ry="0.9" transform="rotate(18 6 15.4)" />
      <circle class="size-dot" cx="14" cy="6" r="0.5" />
      <circle class="size-dot" cx="12.6" cy="20" r="0.45" />`,
  },

  'plant-cell': {
    bottom: 23,
    draw: () => `
      <rect class="${outline('plant')}" x="0" y="3" width="50" height="20" rx="4" />
      <rect class="size-wall" x="0" y="3" width="50" height="20" rx="4" />
      <rect class="size-vacuole" x="9" y="7" width="32" height="12" rx="3" />
      <ellipse class="size-chloroplast" cx="5.4" cy="8.2" rx="3" ry="1.5" transform="rotate(-16 5.4 8.2)" />
      <ellipse class="size-chloroplast" cx="5.2" cy="17.4" rx="3" ry="1.5" transform="rotate(12 5.2 17.4)" />
      <ellipse class="size-chloroplast" cx="44.6" cy="8.4" rx="3" ry="1.5" transform="rotate(14 44.6 8.4)" />
      <ellipse class="size-chloroplast" cx="44.8" cy="17.6" rx="3" ry="1.5" transform="rotate(-12 44.8 17.6)" />
      <ellipse class="size-chloroplast" cx="26" cy="6.4" rx="2.6" ry="1.3" />
      <ellipse class="size-chloroplast" cx="26" cy="20" rx="2.6" ry="1.3" />
      <circle class="size-nucleus" cx="6.4" cy="12.8" r="3.6" />`,
  },

  neuron: {
    bottom: 20,
    draw: () => `
      <circle class="${outline('neuron')}" cx="10" cy="10" r="10" />
      <circle class="size-nucleus" cx="9.4" cy="9" r="4.4" />
      <circle class="size-nucleolus" cx="8.2" cy="8.2" r="1.6" />
      <path class="size-schematic" d="M19.6 6.6 h3 M19.6 13.4 h3 M8 19.4 v3" />`,
  },

  'white-blood-cell': {
    bottom: 15,
    draw: () => `
      <circle class="${outline('wbc')}" cx="6" cy="9" r="6" />
      <path class="size-lobe" d="M4.2 6.4 a2.5 2.5 0 1 1 0.1 0.1 M7.6 10.6 a2.4 2.4 0 1 1 0.1 0.1 M5 11.6 a2 2 0 1 1 0.1 0.1" />
      <circle class="size-granule" cx="2.6" cy="5.4" r="0.6" />
      <circle class="size-granule" cx="9.6" cy="6.2" r="0.55" />
      <circle class="size-granule" cx="3.2" cy="12.8" r="0.5" />
      <circle class="size-granule" cx="9.4" cy="12.4" r="0.6" />`,
  },

  'red-blood-cell': {
    bottom: 7.8,
    draw: () => `
      <path class="${outline('rbc')}" d="M0 4.6 C1.6 1.4 9.4 1.4 11 4.6 C9.4 7.8 1.6 7.8 0 4.6 Z" />
      <path class="size-dimple" d="M4.6 3.6 C5.4 4.6 8.2 4.6 9 3.6" />`,
  },

  'sperm-cell': {
    bottom: 7.2,
    draw: () => `
      <ellipse class="${outline('sperm')}" cx="2.25" cy="4.2" rx="2.25" ry="3" />
      <path class="size-schematic" d="M4.8 4.2 c1.6 -0.7 2.8 0.9 4.4 0.2" />`,
  },

  cyanobacterium: {
    bottom: 2.6,
    draw: () => `
      <rect class="${outline('cyano')}" x="0" y="0.4" width="3" height="2.2" rx="1.1" />
      <path class="size-thylakoid" d="M0.9 1.1 H2.1 M0.9 1.7 H2.1" />`,
  },
};

/** How wide the drawing is, including a dashed stub or continuation mark. */
const MARGIN = 4.2;

export function createSizeChart(container, specimens) {
  const entries = Object.entries(specimens)
    .map(([id, cell]) => ({ id, cell, size: cell.size, shape: SHAPES[id] }))
    .filter((entry) => entry.size && entry.shape)
    .sort((a, b) => b.size.real - a.size.real);

  const row = document.createElement('div');
  row.className = 'size-row';

  for (const { id, cell, size, shape } of entries) {
    const item = document.createElement('figure');
    item.className = `size-item size-${id}`;
    item.dataset.cell = id;

    const width = size.real + MARGIN;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // the viewBox is in micrometres; the browser scales it exactly once
    svg.setAttribute('viewBox', `-0.6 0 ${width} ${CANVAS_HEIGHT}`);
    svg.setAttribute('width', String(width * PIXELS_PER_MICRON));
    svg.setAttribute('height', String(CANVAS_HEIGHT * PIXELS_PER_MICRON));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${cell.zh}，按 ${size.real} ${size.unit} 绘制`);
    svg.style.setProperty('--cell-color', cell.color);
    svg.innerHTML = `<g transform="translate(0 ${(BASELINE - shape.bottom).toFixed(2)})">${shape.draw()}</g>`;
    item.append(svg);

    const caption = document.createElement('figcaption');
    caption.innerHTML = `<b>${cell.zh}</b><span>${size.real} ${size.unit}${size.label ? '' : ''}</span>`
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
