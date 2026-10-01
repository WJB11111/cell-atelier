// Fallback silhouettes for the same-scale lineup.
//
// These are only drawn when a specimen's render is missing (see
// tools/render_lineup.py for the real pictures). They exist so a broken image
// degrades into a to-scale drawing instead of a gap: the SVG coordinate system is
// micrometres and every shape reports where its own bottom sits, so the row can
// stand on one ground line either way.
//
// A dashed stub with a continuation mark means "the real cell goes on; this part is
// not drawn to scale" — the figure must never be measurable as something it is not.

const outline = (id) => `size-outline size-outline-${id}`;

export const SHAPES = {
  'animal-cell': {
    bottom: 20,
    draw: () => `
      <circle class="${outline('animal')}" cx="10" cy="10" r="10" />
      <circle class="size-nucleus" cx="7" cy="8.4" r="3.4" />
      <circle class="size-nucleolus" cx="6" cy="7.6" r="1.3" />
      <ellipse class="size-organelle" cx="15" cy="14.4" rx="2.6" ry="1" transform="rotate(-24 15 14.4)" />
      <ellipse class="size-organelle" cx="6" cy="15.4" rx="2.2" ry="0.9" transform="rotate(18 6 15.4)" />
      <circle class="size-dot" cx="14" cy="6" r="0.5" />`,
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
      <circle class="size-granule" cx="3.2" cy="12.8" r="0.5" />`,
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
