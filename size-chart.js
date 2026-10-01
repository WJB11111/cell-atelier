// A figure that draws every specimen to one common scale.
//
// The scale bar in the viewport answers "how big is this cell"; this answers
// "how big is it compared with the others", which a single-specimen view can
// never show. Figure widths come straight from each specimen's declared size in
// specimens.js, so the drawing cannot drift away from the data.

const PIXELS_PER_MICRON = 5.6;
const MIN_PIXELS = 10;

export function createSizeChart(container, specimens) {
  const entries = Object.entries(specimens)
    .map(([id, cell]) => ({ id, cell, size: cell.size }))
    .filter((entry) => entry.size)
    .sort((a, b) => b.size.real - a.size.real);

  const largest = entries[0]?.size.real ?? 1;
  const barMicrons = largest >= 40 ? 10 : largest >= 10 ? 5 : 1;

  const row = document.createElement('div');
  row.className = 'size-row';

  for (const { id, cell, size } of entries) {
    const pixels = Math.max(MIN_PIXELS, size.real * PIXELS_PER_MICRON);
    const item = document.createElement('figure');
    item.className = `size-item size-${id}`;
    item.dataset.cell = id;

    const shape = document.createElement('span');
    shape.className = 'size-shape';
    shape.style.width = `${pixels}px`;
    shape.style.height = `${pixels}px`;
    shape.style.setProperty('--cell-color', cell.color);
    item.append(shape);

    const caption = document.createElement('figcaption');
    caption.innerHTML = `<b>${cell.zh}</b><span>${size.real} ${size.unit} · ${size.label}</span>`
      + (size.note ? `<em>${size.note}</em>` : '');
    item.append(caption);
    row.append(item);
  }

  const ruler = document.createElement('div');
  ruler.className = 'size-ruler';
  ruler.innerHTML = `<i style="width:${barMicrons * PIXELS_PER_MICRON}px"></i>`
    + `<span>${barMicrons} µm</span>`;
  row.append(ruler);

  container.replaceChildren(row);
  container.setAttribute(
    'aria-label',
    `按同一比例绘制的七类标本大小对比：${entries.map((entry) => `${entry.cell.zh} ${entry.size.real} 微米`).join('，')}`,
  );
  return { entries, pixelsPerMicron: PIXELS_PER_MICRON };
}
