"""
Generate every app icon from one vector-style drawing of the logo
(orange background, cream road running top-to-bottom, two "car" circles with up-arrows).

Run from the project folder:   python scripts/make_icons.py
Needs Pillow (pip install pillow). Writes into assets/.

Why draw it in code instead of resizing the PNG?
- Android "adaptive" icons need the artwork on a transparent layer, shrunk into a safe zone
  (launchers crop to circles/squircles), with the road still running edge to edge.
- iOS needs a full square with no transparency (iOS rounds the corners itself).
Drawing from measurements lets us produce each variant cleanly at any size.
Measurements were taken from the original 1024px logo.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ORANGE = (255, 77, 38, 255)   # #FF4D26 — sampled from the logo
CREAM = (247, 243, 238, 255)  # #F7F3EE
CLEAR = (0, 0, 0, 0)

SS = 4            # supersampling factor for smooth edges
BASE = 1024       # design grid (logo measured on 1024px)
OUT = Path(__file__).resolve().parent.parent / "assets"

# Logo geometry on the 1024 grid
ROAD_HALF_W = 82              # road is x 430..594
CAR_CENTERS_Y = (318, 717)
RING_R = 133                  # cream ring outer radius
RING_GAP = 16                 # orange outline between ring and road (0 = original look)
HOLE_R = 102                  # orange inner circle radius
CHEVRON_W = 38                # arrow stroke width
CHEVRON = ((-62, 38), (0, -54), (62, 38))   # arrow points relative to circle centre (left, tip, right)


def draw_logo(size: int, scale: float, *, bg, fg, hole, rounded: bool) -> Image.Image:
    """
    size:   output pixels
    scale:  1.0 = logo as designed; <1 shrinks the cars toward the centre (road still spans full height)
    bg:     background colour (CLEAR for transparent layers)
    fg:     colour of road, rings and arrows
    hole:   colour inside the rings (CLEAR = see-through)
    """
    S = size * SS
    k = S / BASE                       # design units -> supersampled pixels
    img = Image.new("RGBA", (S, S), CLEAR)
    d = ImageDraw.Draw(img)

    if bg != CLEAR:
        if rounded:
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(225 * k), fill=bg)
        else:
            d.rectangle([0, 0, S, S], fill=bg)

    cx = S / 2
    road = ROAD_HALF_W * k * scale
    d.rectangle([cx - road, 0, cx + road, S], fill=fg)

    def punch(cy: float, r: float):
        """Fill a circle with the `hole` colour. Done on a mask layer so CLEAR really erases."""
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
        if hole == CLEAR:
            img.putalpha(Image.composite(Image.new("L", (S, S), 0), img.getchannel("A"), mask))
        else:
            img.paste(Image.new("RGBA", (S, S), hole), mask=mask)

    for y0 in CAR_CENTERS_Y:
        cy = S / 2 + (y0 - BASE / 2) * k * scale
        r_out, r_in = RING_R * k * scale, HOLE_R * k * scale
        # Orange gap around the ring, so it reads as a separate circle sitting on the road.
        punch(cy, (RING_R + RING_GAP) * k * scale)
        d = ImageDraw.Draw(img)
        d.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], fill=fg)
        punch(cy, r_in)
        d = ImageDraw.Draw(img)

        pts = [(cx + px * k * scale, cy + py * k * scale) for px, py in CHEVRON]
        w = max(1, int(CHEVRON_W * k * scale))
        d.line(pts, fill=fg, width=w, joint="curve")
        for px, py in pts:  # round caps
            d.ellipse([px - w / 2, py - w / 2, px + w / 2, py + w / 2], fill=fg)

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    WHITE = (255, 255, 255, 255)

    # iOS / generic: full square, no transparency (the OS rounds corners)
    draw_logo(1024, 1.0, bg=ORANGE, fg=CREAM, hole=ORANGE, rounded=False).convert("RGB").save(OUT / "icon.png")

    # Android adaptive icon layers. Launchers show the middle ~61%; shrink the cars into that zone.
    draw_logo(1024, 0.68, bg=CLEAR, fg=CREAM, hole=CLEAR, rounded=False).save(OUT / "android-icon-foreground.png")
    Image.new("RGB", (1024, 1024), ORANGE[:3]).save(OUT / "android-icon-background.png")
    # Monochrome (Android 13 themed icons): shape only, the system recolours it.
    draw_logo(1024, 0.68, bg=CLEAR, fg=WHITE, hole=CLEAR, rounded=False).save(OUT / "android-icon-monochrome.png")

    # Web favicon + splash: rounded like the original artwork
    draw_logo(64, 1.0, bg=ORANGE, fg=CREAM, hole=ORANGE, rounded=True).save(OUT / "favicon.png")
    draw_logo(1024, 1.0, bg=ORANGE, fg=CREAM, hole=ORANGE, rounded=True).save(OUT / "splash-icon.png")

    # Web: public/ is served at the site root (see app/+html.tsx)
    PUBLIC = OUT.parent / "public"
    PUBLIC.mkdir(exist_ok=True)
    draw_logo(64, 1.0, bg=ORANGE, fg=CREAM, hole=ORANGE, rounded=True).save(PUBLIC / "favicon.png")
    draw_logo(180, 1.0, bg=ORANGE, fg=CREAM, hole=ORANGE, rounded=False).convert("RGB").save(PUBLIC / "apple-touch-icon.png")

    print("icons written to", OUT, "and", PUBLIC)


if __name__ == "__main__":
    main()
