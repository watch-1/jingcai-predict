#!/usr/bin/env python3
"""Generate asymmetric football-motif LED ribbon textures for pitch v9d (grey 云足球 glow).

Creates 3 phases × (long + short) PNGs:
  led_long_v9d_p{0,1,2}.png   4096×360
  led_short_v9d_p{0,1,2}.png  2048×360
  led_preview_v9d_p{0,1,2}.png (stitched preview)
  led_atlas_v9d.png (optional strip of all phases)

「云足球」is at most 2 on long / 1 on short per phase texture
(→ ≤4 long / ≤2 short when Near+Far / L+R share mats), placed asymmetrically.
Other segments: balls, chevrons, shields, LIVE, speed lines, diagonal stripes,
muted brand blocks — broadcast LED feel.
"""
from __future__ import annotations
import math
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

OUT = "/workspace/pitch-blender"
LONG_W, SHORT_W, H = 4096, 2048, 360
FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_INDEX = 2  # SC Bold
LATIN_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

NAVY = (4, 18, 52)
NAVY2 = (6, 28, 72)
CYAN = (40, 180, 255)
CYAN_DIM = (20, 90, 160)
WHITE = (245, 248, 255)
CREAM = (255, 248, 220)
GOLD = (255, 210, 70)
GOLD_OUT = (255, 190, 40)
RED_LIVE = (255, 70, 70)
MUTED = (90, 140, 190)
YELLOW = (255, 230, 90)
# v9d: soft grey glowing brand (not bright white/yellow)
GREY_BRAND = (188, 194, 204)      # mid soft grey
GREY_BRAND_HI = (196, 202, 210)   # fill ~#C4CAD2 (stays in #B8BEC8–#D0D4DA after polish)
GREY_BRAND_LO = (168, 174, 186)   # outline slightly darker
GREY_GLOW = (170, 180, 196)


def load_font(size: int, cjk: bool = True):
    if cjk:
        return ImageFont.truetype(FONT_PATH, size, index=FONT_INDEX)
    return ImageFont.truetype(LATIN_FONT, size)


def base_board(w: int, h: int, tint=(4, 18, 52)) -> Image.Image:
    img = Image.new("RGB", (w, h), tint)
    draw = ImageDraw.Draw(img)
    # horizontal scanlines / LED panel feel
    for y in range(0, h, 3):
        c = 8 + (y % 9)
        draw.line([(0, y), (w, y)], fill=(tint[0] + c, tint[1] + c + 4, tint[2] + c + 10))
    # soft vertical panel seams every ~180px
    for x in range(0, w, 180):
        draw.line([(x, 0), (x, h)], fill=(tint[0] + 6, tint[1] + 10, tint[2] + 18))
    # top/bottom cyan edge glow
    for i in range(6):
        a = 18 - i * 2
        draw.line([(0, i), (w, i)], fill=(a, 40 + a, 90 + a))
        draw.line([(0, h - 1 - i), (w, h - 1 - i)], fill=(a, 40 + a, 90 + a))
    return img


def draw_text_brand(img: Image.Image, cx: float, text: str = "云足球", scale: float = 1.0):
    """Soft grey glowing brand glyph (v9d) — calm, readable on cyan/navy LED board."""
    draw = ImageDraw.Draw(img)
    w, h = img.size
    font = load_font(int(148 * scale))
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = int(cx * w - tw / 2)
    y = int((h - th) / 2 - bbox[1] * 0.15)
    # gentle emissive glow (lower strength than v9c gold)
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r, a in ((16, 38), (10, 55), (5, 80)):
        gd.text((x, y), text, font=font, fill=(*GREY_GLOW, a))
        for dx, dy in ((-r // 3, 0), (r // 3, 0), (0, -r // 4), (0, r // 4)):
            gd.text((x + dx, y + dy), text, font=font, fill=(*GREY_GLOW, a // 2))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=7))
    img_rgba = img.convert("RGBA")
    img_rgba = Image.alpha_composite(img_rgba, glow)
    img.paste(img_rgba.convert("RGB"))
    draw = ImageDraw.Draw(img)
    # soft grey outline (not gold/cream)
    for dx in (-3, -2, -1, 0, 1, 2, 3):
        for dy in (-3, -2, -1, 0, 1, 2, 3):
            if dx or dy:
                draw.text((x + dx, y + dy), text, font=font, fill=GREY_BRAND_LO)
    draw.text((x, y), text, font=font, fill=GREY_BRAND_HI)
    # separator bars flanking brand (keep cyan accents)
    bar_w = 10
    gap = 28
    by0, by1 = int(h * 0.22), int(h * 0.78)
    draw.rounded_rectangle([x - gap - bar_w, by0, x - gap, by1], radius=3, fill=CYAN)
    draw.rounded_rectangle([x + tw + gap, by0, x + tw + gap + bar_w, by1], radius=3, fill=CYAN)


def draw_ball(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int = 48):
    """Simple soccer ball glyph."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE, outline=CYAN, width=3)
    # pentagon-ish center
    pr = int(r * 0.38)
    pts = []
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        pts.append((cx + int(pr * math.cos(a)), cy + int(pr * math.sin(a))))
    draw.polygon(pts, fill=(20, 30, 50))
    # seam arcs
    for i in range(5):
        a0 = -math.pi / 2 + i * 2 * math.pi / 5
        a1 = a0 + 2 * math.pi / 5
        mx = cx + int(r * 0.72 * math.cos((a0 + a1) / 2))
        my = cy + int(r * 0.72 * math.sin((a0 + a1) / 2))
        draw.line([(pts[i][0], pts[i][1]), (mx, my)], fill=(30, 40, 60), width=3)
        ni = (i + 1) % 5
        draw.line([(pts[ni][0], pts[ni][1]), (mx, my)], fill=(30, 40, 60), width=3)


def draw_chevrons(draw: ImageDraw.ImageDraw, x0: int, y_mid: int, n: int = 4, step: int = 36, h: int = 70, color=CYAN):
    for i in range(n):
        x = x0 + i * step
        pts = [(x, y_mid - h // 2), (x + 22, y_mid), (x, y_mid + h // 2),
               (x - 10, y_mid + h // 2), (x + 12, y_mid), (x - 10, y_mid - h // 2)]
        draw.polygon(pts, fill=color)


def draw_shield(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: int = 54):
    """Small crest-ish shield."""
    pts = [
        (cx, cy - s),
        (cx + s * 0.85, cy - s * 0.55),
        (cx + s * 0.75, cy + s * 0.35),
        (cx, cy + s),
        (cx - s * 0.75, cy + s * 0.35),
        (cx - s * 0.85, cy - s * 0.55),
    ]
    draw.polygon(pts, fill=(12, 40, 90), outline=GOLD, width=3)
    # inner star-ish
    ir = int(s * 0.35)
    star = []
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        star.append((cx + int(ir * math.cos(a)), cy - 4 + int(ir * math.sin(a))))
    draw.polygon(star, fill=GOLD)
    # ball hint
    draw.ellipse([cx - 10, cy + 8, cx + 10, cy + 28], outline=WHITE, width=2)


def draw_live(draw: ImageDraw.ImageDraw, cx: int, cy: int):
    font = load_font(72, cjk=False)
    text = "LIVE"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x, y = cx - tw // 2, cy - th // 2 - 4
    pad = 16
    draw.rounded_rectangle([x - pad, y - 8, x + tw + pad, y + th + 10], radius=10, fill=(120, 20, 30), outline=RED_LIVE, width=3)
    # play triangle
    px = x - pad - 28
    draw.polygon([(px, cy - 18), (px + 22, cy), (px, cy + 18)], fill=RED_LIVE)
    draw.text((x, y), text, font=font, fill=WHITE)


def draw_speed_lines(draw: ImageDraw.ImageDraw, x0: int, x1: int, h: int, color=CYAN_DIM):
    for i, yy in enumerate(range(int(h * 0.25), int(h * 0.75), 18)):
        inset = (i % 3) * 12
        draw.rectangle([x0 + inset, yy, x1 - inset, yy + 6], fill=color)


def draw_diag_stripes(draw: ImageDraw.ImageDraw, x0: int, x1: int, h: int, color=(18, 70, 130)):
    # diagonal band block
    for t in range(-h, (x1 - x0) + h, 28):
        pts = [
            (x0 + t, 0),
            (x0 + t + 14, 0),
            (x0 + t + 14 - h, h),
            (x0 + t - h, h),
        ]
        draw.polygon(pts, fill=color)


def draw_muted_block(draw: ImageDraw.ImageDraw, x0: int, x1: int, h: int, label: str = "YQM"):
    draw.rectangle([x0, int(h * 0.18), x1, int(h * 0.82)], fill=(10, 36, 78), outline=MUTED, width=2)
    font = load_font(48, cjk=False)
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((x0 + x1 - tw) // 2, (h - th) // 2 - 4), label, font=font, fill=MUTED)


def draw_score_ticker(draw: ImageDraw.ImageDraw, cx: int, cy: int, left="MC", right="LIV", score="1-0"):
    font_s = load_font(44, cjk=False)
    font_b = load_font(56, cjk=False)
    # block
    wbox = 260
    hbox = 90
    x0, y0 = cx - wbox // 2, cy - hbox // 2
    draw.rounded_rectangle([x0, y0, x0 + wbox, y0 + hbox], radius=8, fill=(8, 24, 58), outline=CYAN, width=3)
    draw.text((x0 + 16, y0 + 22), left, font=font_s, fill=WHITE)
    bbox = draw.textbbox((0, 0), score, font=font_b)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw // 2, y0 + 14), score, font=font_b, fill=YELLOW)
    bbox2 = draw.textbbox((0, 0), right, font=font_s)
    draw.text((x0 + wbox - 16 - (bbox2[2] - bbox2[0]), y0 + 22), right, font=font_s, fill=WHITE)


def draw_dots_row(draw: ImageDraw.ImageDraw, x0: int, x1: int, cy: int, r: int = 7, gap: int = 28, color=CYAN):
    x = x0
    while x < x1:
        draw.ellipse([x - r, cy - r, x + r, cy + r], fill=color)
        x += gap


def fill_segment_motifs(img: Image.Image, segments: list):
    """segments: list of (x0_frac, x1_frac, kind, kwargs)"""
    draw = ImageDraw.Draw(img)
    w, h = img.size
    cy = h // 2
    for seg in segments:
        x0f, x1f, kind = seg[0], seg[1], seg[2]
        kw = seg[3] if len(seg) > 3 else {}
        x0, x1 = int(x0f * w), int(x1f * w)
        mid = (x0 + x1) // 2
        if kind == "brand":
            draw_text_brand(img, (x0f + x1f) / 2, scale=kw.get("scale", 1.0))
            draw = ImageDraw.Draw(img)
        elif kind == "ball":
            draw_ball(draw, mid, cy, r=kw.get("r", 52))
        elif kind == "balls":
            n = kw.get("n", 3)
            for i in range(n):
                t = (i + 0.5) / n
                draw_ball(draw, int(x0 + (x1 - x0) * t), cy, r=kw.get("r", 40))
        elif kind == "chevron":
            draw_chevrons(draw, x0 + 10, cy, n=kw.get("n", 5), step=kw.get("step", 34),
                          h=kw.get("h", 78), color=kw.get("color", CYAN))
        elif kind == "shield":
            draw_shield(draw, mid, cy, s=kw.get("s", 56))
        elif kind == "live":
            draw_live(draw, mid, cy)
        elif kind == "speed":
            draw_speed_lines(draw, x0 + 8, x1 - 8, h, color=kw.get("color", CYAN_DIM))
            # accent chevron at end
            draw_chevrons(draw, x1 - 120, cy, n=3, step=28, h=60, color=CYAN)
        elif kind == "diag":
            draw_diag_stripes(draw, x0, x1, h, color=kw.get("color", (16, 65, 125)))
            draw_dots_row(draw, x0 + 20, x1 - 20, cy, color=CYAN)
        elif kind == "muted":
            draw_muted_block(draw, x0 + 6, x1 - 6, h, label=kw.get("label", "YQM"))
        elif kind == "ticker":
            draw_score_ticker(draw, mid, cy, **{k: kw[k] for k in ("left", "right", "score") if k in kw})
        elif kind == "bars":
            # vertical rhythm bars
            for i, x in enumerate(range(x0 + 8, x1 - 8, 22)):
                hh = 40 + (i % 5) * 18
                draw.rectangle([x, cy - hh // 2, x + 10, cy + hh // 2], fill=CYAN if i % 3 else CYAN_DIM)
        elif kind == "play":
            # large play icon + LIVE-ish
            r = 40
            draw.ellipse([mid - r, cy - r, mid + r, cy + r], outline=RED_LIVE, width=4)
            draw.polygon([(mid - 12, cy - 22), (mid + 24, cy), (mid - 12, cy + 22)], fill=RED_LIVE)


# ---------------------------------------------------------------------------
# Phase layouts — deliberately asymmetric brand placement
# Long: avoid L/R twin brands (prefer 1 brand, or 2 clustered on one half)
# Short: 1 brand max, offset from center
# ---------------------------------------------------------------------------

def long_segments_p0():
    # SINGLE brand far-left; motifs fill the rest — no right twin
    return [
        (0.00, 0.05, "chevron", {"n": 3, "color": GOLD}),
        (0.05, 0.18, "brand", {"scale": 1.0}),
        (0.18, 0.26, "diag"),
        (0.26, 0.32, "ball"),
        (0.32, 0.40, "live"),
        (0.40, 0.48, "speed"),
        (0.48, 0.54, "shield"),
        (0.54, 0.62, "ticker", {"left": "MC", "right": "LIV", "score": "1-0"}),
        (0.62, 0.70, "balls", {"n": 3, "r": 34}),
        (0.70, 0.78, "muted", {"label": "CLOUD"}),
        (0.78, 0.86, "chevron", {"n": 6}),
        (0.86, 0.94, "play"),
        (0.94, 1.00, "bars"),
    ]


def long_segments_p1():
    # SINGLE brand far-rightish; LIVE/ticker dominate left
    return [
        (0.00, 0.10, "diag"),
        (0.10, 0.18, "live"),
        (0.18, 0.26, "speed"),
        (0.26, 0.32, "balls", {"n": 2}),
        (0.32, 0.40, "chevron", {"n": 5}),
        (0.40, 0.48, "shield"),
        (0.48, 0.56, "ticker", {"left": "MC", "right": "LIV", "score": "1-0"}),
        (0.56, 0.64, "muted", {"label": "YQM LIVE"}),
        (0.64, 0.70, "ball"),
        (0.70, 0.84, "brand", {"scale": 1.05}),
        (0.84, 0.92, "chevron", {"n": 4, "color": GOLD}),
        (0.92, 1.00, "bars"),
    ]


def long_segments_p2():
    # TWO brands BOTH on left half (0.08 + 0.40) — cannot read as L/R mirror
    return [
        (0.00, 0.04, "bars"),
        (0.04, 0.16, "brand", {"scale": 0.95}),
        (0.16, 0.22, "ball"),
        (0.22, 0.30, "live"),
        (0.30, 0.36, "chevron", {"n": 4}),
        (0.36, 0.48, "brand", {"scale": 1.0}),
        (0.48, 0.56, "diag"),
        (0.56, 0.62, "shield"),
        (0.62, 0.70, "speed"),
        (0.70, 0.78, "ticker", {"left": "MC", "right": "LIV", "score": "2-1"}),
        (0.78, 0.86, "balls", {"n": 2}),
        (0.86, 0.94, "muted", {"label": "PASS"}),
        (0.94, 1.00, "chevron", {"n": 4, "color": GOLD}),
    ]


def short_segments_p0():
    return [
        (0.00, 0.14, "live"),
        (0.14, 0.28, "ball"),
        (0.28, 0.40, "chevron", {"n": 4}),
        (0.40, 0.66, "brand", {"scale": 0.85}),
        (0.66, 0.80, "shield"),
        (0.80, 1.00, "speed"),
    ]


def short_segments_p1():
    return [
        (0.00, 0.22, "brand", {"scale": 0.85}),
        (0.22, 0.36, "diag"),
        (0.36, 0.50, "live"),
        (0.50, 0.64, "ticker", {"left": "H", "right": "A", "score": "1-0"}),
        (0.64, 0.80, "balls", {"n": 2, "r": 36}),
        (0.80, 1.00, "chevron", {"n": 4, "color": GOLD}),
    ]


def short_segments_p2():
    return [
        (0.00, 0.12, "bars"),
        (0.12, 0.26, "shield"),
        (0.26, 0.40, "speed"),
        (0.40, 0.54, "play"),
        (0.54, 0.80, "brand", {"scale": 0.85}),
        (0.80, 1.00, "muted", {"label": "YQM"}),
    ]


PHASES = [
    (long_segments_p0, short_segments_p0),
    (long_segments_p1, short_segments_p1),
    (long_segments_p2, short_segments_p2),
]



def polish(img: Image.Image) -> Image.Image:
    # slight contrast boost for readability
    img = ImageEnhance.Contrast(img).enhance(1.08)
    img = ImageEnhance.Brightness(img).enhance(1.02)
    return img


def make_phase(pi: int):
    long_fn, short_fn = PHASES[pi]
    long_segs = long_fn()
    short_segs = short_fn()
    long_img = base_board(LONG_W, H)
    # motifs first (no brand), polish, then soft-grey brand on top so polish does not bleach glyphs
    fill_segment_motifs(long_img, [s for s in long_segs if s[2] != "brand"])
    long_img = polish(long_img)
    fill_segment_motifs(long_img, [s for s in long_segs if s[2] == "brand"])

    short_img = base_board(SHORT_W, H, tint=(5, 20, 56))
    fill_segment_motifs(short_img, [s for s in short_segs if s[2] != "brand"])
    short_img = polish(short_img)
    fill_segment_motifs(short_img, [s for s in short_segs if s[2] == "brand"])

    lp = os.path.join(OUT, f"led_long_v9d_p{pi}.png")
    sp = os.path.join(OUT, f"led_short_v9d_p{pi}.png")
    long_img.save(lp, optimize=True)
    short_img.save(sp, optimize=True)

    # preview: long scaled + short below
    prev_w = 1600
    scale = prev_w / LONG_W
    prev_h = int(H * scale) + int(H * (prev_w / SHORT_W) * 0.35) + 20
    # simpler: just scale long to 1600×140 and paste short strip
    pl = long_img.resize((1600, 140), Image.Resampling.LANCZOS)
    ps = short_img.resize((800, 100), Image.Resampling.LANCZOS)
    prev = Image.new("RGB", (1600, 260), (0, 0, 0))
    prev.paste(pl, (0, 8))
    prev.paste(ps, (400, 155))
    pp = os.path.join(OUT, f"led_preview_v9d_p{pi}.png")
    prev.save(pp, optimize=True)
    print(f"phase {pi}: {lp} {sp} {pp}")
    return long_img, short_img, prev


def main():
    os.makedirs(OUT, exist_ok=True)
    previews = []
    for pi in range(3):
        _, _, prev = make_phase(pi)
        previews.append(prev)
    # atlas strip
    atlas = Image.new("RGB", (1600, 260 * 3 + 16), (0, 0, 0))
    for i, p in enumerate(previews):
        atlas.paste(p, (0, i * 268))
    ap = os.path.join(OUT, "led_atlas_v9d.png")
    atlas.save(ap, optimize=True)
    print("atlas", ap)

    # Far boards: rolled long textures so Near≠Far (asymmetric scroll feel)
    import shutil
    FAR_ROLL = [2496, 1856, 3200]  # px offsets matched to v9c far plates
    for pi, ox in enumerate(FAR_ROLL):
        base = Image.open(os.path.join(OUT, f"led_long_v9d_p{pi}.png"))
        right = base.crop((ox, 0, base.width, H))
        left = base.crop((0, 0, ox, H))
        rolled = Image.new("RGB", base.size)
        rolled.paste(right, (0, 0))
        rolled.paste(left, (base.width - ox, 0))
        fp = os.path.join(OUT, f"led_far_v9d_p{pi}.png")
        rolled.save(fp, optimize=True)
        print(f"far p{pi}: roll {ox} → {fp}")

    # Also write "current" aliases for phase 0 as default led_long/short_v9d
    shutil.copy(os.path.join(OUT, "led_long_v9d_p0.png"), os.path.join(OUT, "led_long_v9d.png"))
    shutil.copy(os.path.join(OUT, "led_short_v9d_p0.png"), os.path.join(OUT, "led_short_v9d.png"))
    print("done")


if __name__ == "__main__":
    main()
