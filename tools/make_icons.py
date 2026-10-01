"""Draw the app icons from the site palette.

The installable app needs raster icons; drawing them from the same hex values the
models use keeps the launcher icon recognisably the specimen on the page, and
keeping the generator in the repo means the icons can be regenerated instead of
being unexplained binaries.

    python tools/make_icons.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# the same values as build_cell.COLORS, so the icon and the model agree
PAPER = "#f2eee6"
MEMBRANE = "#a996c6"
NUCLEUS = "#85519f"
NUCLEOLUS = "#633d78"
MITOCHONDRIA = "#c96a4e"
CRISTAE = "#e09a83"
RIBOSOMES = "#9a7cae"


def rounded_bar(size: int, width: int, height: int, radius: int, angle: float) -> Image.Image:
    """A rotated rounded rectangle, drawn on its own layer."""
    scale = 4
    tile = Image.new("RGBA", (width * scale, height * scale), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle(
        (0, 0, width * scale - 1, height * scale - 1), radius=radius * scale, fill=(0, 0, 0, 0)
    )
    return tile


def draw_icon(size: int) -> Image.Image:
    scale = 4  # supersample, then downsample for smooth edges
    canvas = Image.new("RGB", (size * scale, size * scale), PAPER)
    draw = ImageDraw.Draw(canvas)
    unit = size * scale / 512  # the artwork is authored at 512

    def px(value: float) -> float:
        return value * unit

    centre = (px(256), px(262))
    # cell body
    draw.ellipse(
        (centre[0] - px(186), centre[1] - px(186), centre[0] + px(186), centre[1] + px(186)),
        fill=MEMBRANE,
        outline="#8f7fae",
        width=max(1, int(px(7))),
    )
    # inner shading, to keep the flat fill from looking like a sticker
    draw.ellipse(
        (centre[0] - px(160), centre[1] - px(160), centre[0] + px(160), centre[1] + px(160)),
        fill="#b6a5cf",
    )
    # mitochondria: rotated capsules placed around the nucleus
    for angle, distance, length, offset in ((28, 118, 150, -0.35), (208, 128, 132, 0.5), (110, 140, 108, 0.1)):
        bar = Image.new("RGBA", (int(px(length)), int(px(52))), (0, 0, 0, 0))
        bar_draw = ImageDraw.Draw(bar)
        bar_draw.rounded_rectangle(
            (0, 0, px(length) - 1, px(52) - 1), radius=px(26), fill=MITOCHONDRIA
        )
        for index in range(4):
            x = px(length) * (0.2 + index * 0.2)
            bar_draw.line((x, px(12), x, px(40)), fill=CRISTAE, width=max(1, int(px(6))))
        bar = bar.rotate(math.degrees(offset), expand=True, resample=Image.BICUBIC)
        radians = math.radians(angle)
        position = (
            int(centre[0] + math.cos(radians) * px(distance) - bar.width / 2),
            int(centre[1] + math.sin(radians) * px(distance) * 0.7 - bar.height / 2),
        )
        canvas.paste(bar, position, bar)
    # nucleus and nucleolus
    draw.ellipse(
        (centre[0] - px(96), centre[1] - px(88), centre[0] + px(28), centre[1] + px(36)),
        fill=NUCLEUS,
    )
    draw.ellipse(
        (centre[0] - px(66), centre[1] - px(50), centre[0] - px(6), centre[1] + px(10)),
        fill=NUCLEOLUS,
    )
    # a few free ribosomes
    for angle, distance, radius in ((70, 150, 9), (140, 96, 8), (-30, 152, 7), (250, 120, 8), (320, 140, 7)):
        radians = math.radians(angle)
        x = centre[0] + math.cos(radians) * px(distance)
        y = centre[1] + math.sin(radians) * px(distance)
        draw.ellipse((x - px(radius), y - px(radius), x + px(radius), y + px(radius)), fill=RIBOSOMES)

    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    for size in (192, 512):
        target = PUBLIC / f"icon-{size}.png"
        draw_icon(size).save(target, optimize=True)
        print(f"  {target.relative_to(ROOT)}  {target.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
