#!/usr/bin/env python3
"""Generate tileable sky plates, atmospheric rain, and glass-drop sprites for preview 370."""
from __future__ import annotations

import math
import os
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(os.environ.get("WX370_OUT", "/tmp/wx370"))
SRC = Path(os.environ.get("WX370_SRC", "/workspace/jingcai-predict/public/assets/weather"))
OUT.mkdir(parents=True, exist_ok=True)


def hash2(ix, iy, seed=0):
    n = (np.int64(ix) * 374761393 + np.int64(iy) * 668265263 + np.int64(seed) * 1442695041) & np.int64(0x7FFFFFFF)
    n = (n ^ (n >> 13)) * np.int64(1274126177)
    return ((n ^ (n >> 16)) & np.int64(0x7FFFFFFF)).astype(np.float64) / 2147483647.0


def value_noise(x, y, period_x, period_y, seed):
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = x - x0
    fy = y - y0
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    px = max(1, int(round(period_x)))
    py = max(1, int(round(period_y)))
    x0m = np.mod(x0, px)
    y0m = np.mod(y0, py)
    x1m = np.mod(x0 + 1, px)
    y1m = np.mod(y0 + 1, py)
    n00 = hash2(x0m, y0m, seed)
    n10 = hash2(x1m, y0m, seed)
    n01 = hash2(x0m, y1m, seed)
    n11 = hash2(x1m, y1m, seed)
    nx0 = n00 * (1 - sx) + n10 * sx
    nx1 = n01 * (1 - sx) + n11 * sx
    return nx0 * (1 - sy) + nx1 * sy


def fbm(x, y, period_x, period_y, seed, octaves=5, lac=2.0, gain=0.5):
    amp = 1.0
    freq = 1.0
    total = 0.0
    norm = 0.0
    for i in range(octaves):
        px = max(1, period_x * freq)
        py = max(1, period_y * freq)
        total += amp * value_noise(x * freq, y * freq, px, py, seed + i * 19)
        norm += amp
        amp *= gain
        freq *= lac
    return total / max(norm, 1e-8)


def grid(w, h):
    yy, xx = np.mgrid[0:h, 0:w]
    return xx.astype(np.float64), yy.astype(np.float64)


def to_img(arr, mode="RGB"):
    a = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(a, mode=mode)


def save_webp(img, path, quality=84, lossless=False):
    path = Path(path)
    kw = dict(format="WEBP", method=6)
    if img.mode == "RGBA":
        if lossless:
            kw["lossless"] = True
        else:
            kw["quality"] = quality
            kw["exact"] = True
    else:
        kw["quality"] = quality
    img.save(path, **kw)
    print(f"wrote {path} {img.size} {img.mode} {path.stat().st_size} bytes")


def make_h_seamless(arr, blend_frac=0.10):
    """Roll by half width and softly blend only a narrow seam. Input must be uint/float RGB."""
    h, w = arr.shape[:2]
    mid = w // 2
    bw = max(16, int(w * blend_frac))
    rolled = np.roll(arr, mid, axis=1).astype(np.float32)
    radius = max(6, bw // 4)
    k = np.exp(-0.5 * (np.arange(-radius, radius + 1) / (radius * 0.42)) ** 2)
    k /= k.sum()
    src = rolled if rolled.ndim == 3 else rolled[..., None]
    pad = np.pad(src, ((0, 0), (radius, radius), (0, 0)), mode="wrap")
    blur = np.zeros_like(src)
    for i, kv in enumerate(k):
        blur += pad[:, i : i + w] * kv
    xs = np.arange(w)
    dist = np.abs(xs - mid).astype(np.float64)
    wt = np.clip(1.0 - dist / bw, 0, 1)
    wt = wt * wt * (3 - 2 * wt)
    out = src * (1 - wt[None, :, None]) + blur * wt[None, :, None]
    if arr.ndim == 2:
        return np.clip(out[..., 0], 0, 255)
    return np.clip(out, 0, 255)


def generate_sunny(w=1600, h=800):
    xx, yy = grid(w, h)
    xn, yn = xx / w, yy / h
    # Already periodic — do not seam-blur afterwards.
    warp_x = fbm(xx / w * 4, yy / h * 3, 4, 3, 3, octaves=4) - 0.5
    warp_y = fbm(xx / w * 4 + 2.1, yy / h * 3, 4, 3, 9, octaves=4) - 0.5
    # Cumulus (domain-warped)
    cx = xx / w * 6 + warp_x * 1.4
    cy = yy / h * 4 + warp_y * 1.2
    n_cu = fbm(cx, cy, 6, 4, 17, octaves=6, gain=0.52)
    # Billow for puffier tops
    billow = 1 - np.abs(n_cu * 2 - 1)
    cumulus = np.clip((billow - 0.52) / 0.36, 0, 1)
    cumulus = cumulus ** 1.05
    # denser lower-right and mid-left, thinner at top-right
    dens = 0.55 + 0.45 * (0.4 + 0.6 * yn) * (0.7 + 0.3 * np.sin(xn * 2 * math.pi + 0.6))
    cumulus *= np.clip(dens, 0, 1)
    # Cirrus wisps, horizontally stretched
    n_ci = fbm(xx / w * 5, yy / h * 12, 5, 12, 31, octaves=5, gain=0.55)
    cirrus = np.clip((n_ci - 0.55) / 0.35, 0, 1) ** 1.2
    cirrus *= np.clip(1.0 - yn * 0.7, 0.25, 1) * 0.55
    # Sky gradient — richer blue like the photo
    top = np.array([40, 118, 205], dtype=np.float64)
    midc = np.array([58, 140, 216], dtype=np.float64)
    bot = np.array([110, 175, 228], dtype=np.float64)
    t = np.clip(yn * 1.05, 0, 1)
    sky = (1 - t)[:, :, None] * top + t[:, :, None] * bot
    # slight horizontal variation, periodic
    hv = 0.96 + 0.08 * np.sin(xn * 2 * math.pi + 1.2)
    sky = sky * hv[:, :, None]
    # Sun — compact, well inside the tile
    sx, sy = 0.50, 0.28
    dx = xn - sx
    dy = (yn - sy) * (h / w)
    dist = np.sqrt(dx * dx + dy * dy)
    core = np.exp(-(dist * 16.0) ** 2)
    disc = np.exp(-(dist * 9.0) ** 2)
    halo = np.exp(-(dist * 3.6) ** 2)
    warm = np.array([255, 228, 170], dtype=np.float64)
    white = np.array([255, 252, 245], dtype=np.float64)
    sky = sky + halo[:, :, None] * (warm - sky) * 0.50
    sky = sky + disc[:, :, None] * (warm - sky) * 0.65
    sky = sky + core[:, :, None] * (white - sky)
    # Cloud color: white tops, slightly grey bottoms, gold near the sun
    shade = np.clip(0.78 + 0.22 * (1 - yn) + 0.08 * (n_cu - 0.5), 0.68, 1.0)
    ccol = np.array([255, 255, 255]) * shade[:, :, None] + np.array([200, 212, 224]) * (1 - shade[:, :, None])
    ccol = ccol + halo[:, :, None] * (np.array([255, 236, 200]) - ccol) * 0.4
    cloud = np.clip(cumulus * 0.95 + cirrus * 0.65, 0, 1)
    # soft edge already in the clip; multiply for coverage
    sky = sky * (1 - cloud[:, :, None]) + ccol * cloud[:, :, None]
    return to_img(sky, "RGB")


def generate_overcast(w=1600, h=800, kind="rain"):
    xx, yy = grid(w, h)
    xn, yn = xx / w, yy / h
    warp_x = fbm(xx / w * 5, yy / h * 3, 5, 3, 5, octaves=4) - 0.5
    warp_y = fbm(xx / w * 5 + 1.7, yy / h * 3, 5, 3, 11, octaves=4) - 0.5
    n1 = fbm(xx / w * 7 + warp_x * 1.6, yy / h * 5 + warp_y * 1.3, 7, 5, 17 if kind != "storm" else 21, octaves=6)
    n2 = fbm(xx / w * 12 + 2.2, yy / h * 8, 12, 8, 29, octaves=5)
    n3 = fbm(xx / w * 4, yy / h * 3, 4, 3, 43, octaves=4)
    billow = 1 - np.abs(n1 * 2 - 1)
    if kind == "storm":
        lo = np.array([26, 30, 40], dtype=np.float64)
        midc = np.array([48, 54, 70], dtype=np.float64)
        hi = np.array([96, 106, 128], dtype=np.float64)
    elif kind == "cloudy":
        lo = np.array([36, 38, 44], dtype=np.float64)
        midc = np.array([62, 66, 74], dtype=np.float64)
        hi = np.array([128, 134, 142], dtype=np.float64)
    else:
        lo = np.array([32, 36, 44], dtype=np.float64)
        midc = np.array([58, 64, 74], dtype=np.float64)
        hi = np.array([132, 140, 150], dtype=np.float64)
    # layer the sky: darker at bottom
    base = lo[None, None, :] * (0.55 + 0.45 * yn[:, :, None]) + midc[None, None, :] * (0.7 - 0.3 * yn[:, :, None])
    # brighter broken cloud
    br = np.clip((billow - 0.35) / 0.45, 0, 1) ** 1.05
    br = br * (0.75 + 0.25 * (1 - yn))
    # smaller ragged detail
    det = np.clip((n2 - 0.48) / 0.4, 0, 1)
    field = np.clip(br * 0.8 + det * 0.45, 0, 1)
    col = base * (1 - field[:, :, None] * 0.9) + hi[None, None, :] * (field[:, :, None] * 0.9)
    # darker pockets
    dark = np.clip((0.46 - n3) / 0.3, 0, 1) * 0.45
    col = col * (1 - dark[:, :, None]) + lo[None, None, :] * dark[:, :, None]
    if kind == "storm":
        # cooler highlights
        col = col + np.clip(br - 0.45, 0, 1)[:, :, None] * np.array([6, 10, 22])
    img = to_img(col, "RGB")
    if kind == "cloudy":
        # Baked vertical alpha: dense upper overcast, feathers into the sides/bottom
        # so Neutral B mid-side glows stay visible. No hard 46% cut.
        fade = np.clip((0.90 - yn) / 0.70, 0, 1)
        fade = fade * fade * (3 - 2 * fade)
        alpha = 0.10 + 0.90 * fade
        # open the mid-sides a little around crest height
        side = np.clip(np.abs(xn - 0.5) * 2.0, 0, 1)
        midy = np.exp(-((yn - 0.52) ** 2) / (2 * 0.20 ** 2))
        alpha = alpha * (1 - 0.28 * midy * (0.25 + 0.75 * side))
        a = np.clip(alpha * 255, 0, 255).astype(np.uint8)
        return to_img(np.dstack([np.array(img), a]), "RGBA")
    return img


def generate_from_existing(name, blend=0.10):
    p = SRC / name
    if not p.exists():
        return None
    im = Image.open(p).convert("RGB")
    # upscale slightly if small, then seam
    arr = np.array(im)
    # If the source is already ~same look we want, just make it tileable
    out = make_h_seamless(arr, blend)
    return to_img(out, "RGB")


def generate_rain_fall(w=384, h=768, density=0.7, seed=5, angle_deg=6.0):
    """Soft, thin, nearly-vertical seamless drizzle. Distant atmosphere, not a barcode."""
    rng = np.random.RandomState(seed)
    # draw at 2x then downscale for soft profiles
    W, H = w * 2, h * 2
    acc = np.zeros((H, W), dtype=np.float64)
    n = int(520 * density)
    base_ang = math.radians(angle_deg)
    for i in range(n):
        x0 = rng.uniform(0, W)
        y0 = rng.uniform(0, H)
        depth = rng.beta(1.8, 1.4)  # more distant streaks
        ang = base_ang + math.radians(rng.uniform(-2.5, 2.5))
        dx, dy = math.sin(ang), math.cos(ang)
        length = (40 + rng.uniform(0, 160) + depth * 120) * 2 / 2  # in 2x pixels
        length = 80 + rng.uniform(0, 260) + depth * 200
        thick = (0.45 + depth * 1.05 + rng.uniform(0, 0.25)) 
        alpha = 0.09 + 0.22 * depth + rng.uniform(0, 0.05)
        steps = max(16, int(length / 1.2))
        for s in range(steps):
            t = s / steps
            fade = math.sin(t * math.pi) ** 1.05
            x = (x0 + dx * length * t) % W
            y = (y0 + dy * length * t) % H
            rad = thick * 2.2
            rmax = int(math.ceil(rad + 1))
            for ox in (0, W, -W):
                for oy in (0, H, -H):
                    px, py = x + ox, y + oy
                    if px < -rmax or px > W + rmax or py < -rmax or py > H + rmax:
                        continue
                    x0i = max(0, int(math.floor(px - rmax)))
                    x1i = min(W, int(math.ceil(px + rmax + 1)))
                    y0i = max(0, int(math.floor(py - rmax)))
                    y1i = min(H, int(math.ceil(py + rmax + 1)))
                    if x1i <= x0i or y1i <= y0i:
                        continue
                    ys = np.arange(y0i, y1i) - py
                    xs = np.arange(x0i, x1i) - px
                    xx, yy = np.meshgrid(xs, ys)
                    g = np.exp(-(xx * xx + yy * yy) / (2 * (thick * 0.72) ** 2))
                    acc[y0i:y1i, x0i:x1i] += alpha * fade * g
    # downscale
    acc = np.clip(acc, 0, 1)
    hi = Image.fromarray((acc * 255).astype(np.uint8), "L").resize((w, h), Image.Resampling.LANCZOS)
    a = np.array(hi).astype(np.float64) / 255.0
    # cool water, mostly carried by alpha (see-through streaks)
    rgb = np.zeros((h, w, 3), dtype=np.float64)
    rgb[..., 0] = 200
    rgb[..., 1] = 218
    rgb[..., 2] = 236
    alpha = np.clip(a * 0.90, 0, 1)  # visible drizzle, still a veil
    rgba = np.dstack([rgb, alpha * 255])
    return to_img(rgba, "RGBA")


def _shape_coords(nx, ny, shape):
    """Map to a circle-like space; return (qx, qy, inside_scale)."""
    if shape == "tear":
        taper = 1.0 + 0.95 * np.clip(-ny, 0, 1.3)
        return nx * taper, ny * 0.90 + 0.14, 0.78
    if shape == "trail":
        taper = 1.0 + 1.65 * np.clip(-ny, 0, 1.5)
        return nx * taper, ny * 0.68 + 0.24, 0.60
    return nx, ny * 1.06, 0.80


def render_drop(size=128, shape="bead", light=(-0.32, -0.42)):
    """Lens water: clear center, thin dark rim, small specular. Not a filled bead."""
    pad = 6
    N = size + pad * 2
    yy, xx = np.mgrid[0:N, 0:N]
    cx = cy = (N - 1) / 2.0
    scale = (size / 2.0) * 0.90
    nx = (xx - cx) / scale
    ny = (yy - cy) / scale
    qx, qy, rad = _shape_coords(nx, ny, shape)
    r = np.sqrt(qx * qx + qy * qy) / rad
    # coverage with a sharp-ish AA edge
    edge_w = 1.8 / scale
    inside = np.clip((1.0 - r) / edge_w + 0.5, 0, 1)
    # rim only near the edge
    rim = np.clip(1.0 - np.abs(r - 0.93) / 0.13, 0, 1)
    rim = rim * rim * inside
    # bottom meniscus is darker / thicker
    bottom = rim * np.clip(qy / rad * 0.9 + 0.25, 0, 1)
    top_rim = rim * np.clip(-qy / rad * 0.8 + 0.15, 0, 1)
    # tiny specular (sky reflection) in the upper-left of the body
    hx = light[0] * rad
    hy = light[1] * rad
    # in qx,qy space
    spec = np.exp(-(((qx - hx) / (0.16 * rad)) ** 2 + ((qy - hy) / (0.10 * rad)) ** 2))
    spec2 = np.exp(-(((qx - hx * 0.2) / (0.07 * rad)) ** 2 + ((qy - hy * 0.15) / (0.05 * rad)) ** 2))
    spec *= inside
    spec2 *= inside
    # faint body (see-through!) — just a whisper of cool lift
    body = inside * (0.06 + 0.05 * np.clip(-qy, 0, 1))
    # compose straight alpha (not chrome)
    a = np.zeros((N, N), dtype=np.float64)
    rch = np.zeros((N, N), dtype=np.float64)
    gch = np.zeros((N, N), dtype=np.float64)
    bch = np.zeros((N, N), dtype=np.float64)

    def add(rr, gg, bb, aa):
        nonlocal a, rch, gch, bch
        aa = np.clip(aa, 0, 1)
        # over
        out_a = aa + a * (1 - aa)
        def ov(src, dst):
            return np.divide(src * aa + dst * a * (1 - aa), np.maximum(out_a, 1e-6))
        rch = ov(rr, rch)
        gch = ov(gg, gch)
        bch = ov(bb, bch)
        a = out_a

    add(200, 220, 235, body)
    add(18, 22, 28, bottom * 0.72 + rim * 0.22)           # dark rim, heavier at the bottom
    add(236, 244, 252, top_rim * 0.55)                    # bright upper-left rim only
    add(255, 255, 255, spec * 0.95 + spec2 * 0.60)        # tight specular ticks
    rgb = np.clip(np.dstack([rch, gch, bch]), 0, 255)
    alpha = np.clip(a * 255, 0, 255)
    im = to_img(np.dstack([rgb, alpha]), "RGBA")
    return im.crop((pad, pad, pad + size, pad + size))


def make_drop_sheet():
    cell = 128
    cols, rows = 4, 3
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
    plan = [
        ("bead", (-0.32, -0.42), 1.00),
        ("bead", (-0.22, -0.50), 0.78),
        ("bead", (-0.40, -0.36), 1.12),
        ("bead", (-0.28, -0.46), 0.62),
        ("tear", (-0.30, -0.28), 1.05),
        ("tear", (-0.22, -0.34), 0.86),
        ("tear", (-0.38, -0.22), 1.18),
        ("tear", (-0.26, -0.30), 0.74),
        ("trail", (-0.28, -0.18), 1.10),
        ("trail", (-0.22, -0.24), 0.88),
        ("bead", (-0.34, -0.48), 0.50),
        ("tear", (-0.30, -0.26), 0.92),
    ]
    for i, (shape, light, sc) in enumerate(plan):
        r, c = divmod(i, cols)
        sz = int(cell * sc)
        drop = render_drop(sz, shape=shape, light=light)
        ox = c * cell + (cell - drop.size[0]) // 2
        oy = r * cell + (cell - drop.size[1]) // 2
        sheet.alpha_composite(drop, (ox, oy))
    return sheet


def _tile(im, size):
    tile = Image.new("RGBA", size, (0, 0, 0, 0))
    fw, fh = im.size
    for y in range(0, size[1] + fh, fh):
        for x in range(0, size[0] + fw, fw):
            tile.paste(im, (x, y), im)
    return tile


def preview_composite():
    sky = Image.open(OUT / "light-rain.webp").convert("RGBA").resize((900, 420), Image.Resampling.LANCZOS)
    fall = Image.open(OUT / "rain-fall.webp").convert("RGBA")
    tiled = _tile(fall, sky.size)
    a = np.array(tiled)
    a[..., 3] = (a[..., 3] * 0.85).astype(np.uint8)
    rain = Image.alpha_composite(sky, Image.fromarray(a, "RGBA"))
    drops = Image.open(OUT / "drops.png").convert("RGBA")
    rng = np.random.RandomState(8)
    cell = 128
    # sparser, mixed sizes, like fig 3 (not packed)
    for _ in range(16):
        c = rng.randint(0, 4)
        r = rng.randint(0, 3)
        sp = drops.crop((c * cell, r * cell, (c + 1) * cell, (r + 1) * cell))
        sc = rng.uniform(0.18, 0.55)
        nw = max(8, int(cell * sc))
        sp = sp.resize((nw, nw), Image.Resampling.LANCZOS)
        x = rng.randint(8, 900 - sp.size[0] - 8)
        y = rng.randint(8, 420 - sp.size[1] - 8)
        rain.alpha_composite(sp, (x, y))
    rain.convert("RGB").save(OUT / "preview-rain.jpg", quality=92)
    print("preview-rain.jpg")

    # Neutral B + cloudy
    glow = Image.new("RGB", (900, 420), (10, 11, 14))
    arr = np.array(glow).astype(np.float64)
    yy, xx = np.mgrid[0:420, 0:900]
    def radial(cx, cy, rx, ry, color, strength=1.0):
        d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
        w = np.exp(-d) * strength
        return w, np.array(color, dtype=np.float64)
    # Neutral B home/away-ish (Latvia muted red, Armenia muted blue)
    for w, col in (
        radial(900 * 0.13, 420 * 0.52, 900 * 0.33, 420 * 0.60, (51, 37, 37), 1.0),
        radial(900 * 0.87, 420 * 0.52, 900 * 0.33, 420 * 0.60, (37, 40, 51), 1.0),
    ):
        arr = arr * (1 - w[:, :, None] * 0.85) + col[None, None, :] * (w[:, :, None] * 0.85) + arr * 0
        # mix toward color
    # redo properly
    arr = np.array(glow).astype(np.float64)
    w1, c1 = radial(900 * 0.13, 420 * 0.52, 900 * 0.33, 420 * 0.60, (51, 37, 37), 1.0)
    w2, c2 = radial(900 * 0.87, 420 * 0.52, 900 * 0.33, 420 * 0.60, (37, 40, 51), 1.0)
    base = np.array([10, 11, 14], dtype=np.float64)
    arr = base * (1 - np.clip(w1 + w2, 0, 1)[:, :, None]) + c1 * w1[:, :, None] + c2 * w2[:, :, None]
    # the add overlaps; clip
    arr = np.clip(arr, 0, 255)
    base_im = Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")
    cld = Image.open(OUT / "cloudy.webp").convert("RGBA").resize((900, 420), Image.Resampling.LANCZOS)
    Image.alpha_composite(base_im, cld).convert("RGB").save(OUT / "preview-cloudy.jpg", quality=92)
    print("preview-cloudy.jpg")

    # sunny wrap join
    sun = Image.open(OUT / "sunny.webp").convert("RGB")
    w, h = sun.size
    join = Image.new("RGB", (640, 320))
    sl = sun.crop((w - 320, h // 5, w, h // 5 + 320)).resize((320, 320))
    sr = sun.crop((0, h // 5, 320, h // 5 + 320)).resize((320, 320))
    join.paste(sl, (0, 0))
    join.paste(sr, (320, 0))
    join.save(OUT / "preview-sunny-join.jpg", quality=92)
    print("preview-sunny-join.jpg")

    # also a drops-on-dark preview to judge glass
    dark = Image.new("RGBA", (640, 360), (40, 48, 58, 255))
    # fake blurry lights
    darr = np.array(dark).astype(np.float64)
    yy, xx = np.mgrid[0:360, 0:640]
    darr[..., 0] += 40 * np.exp(-(((xx - 180) / 140) ** 2 + ((yy - 80) / 60) ** 2))
    darr[..., 1] += 50 * np.exp(-(((xx - 180) / 140) ** 2 + ((yy - 80) / 60) ** 2))
    darr[..., 2] += 60 * np.exp(-(((xx - 180) / 140) ** 2 + ((yy - 80) / 60) ** 2))
    bg = Image.fromarray(np.clip(darr, 0, 255).astype(np.uint8), "RGBA")
    drops = Image.open(OUT / "drops.png").convert("RGBA")
    rng = np.random.RandomState(2)
    cell = 128
    for _ in range(14):
        c = rng.randint(0, 4); r = rng.randint(0, 3)
        sp = drops.crop((c * cell, r * cell, (c + 1) * cell, (r + 1) * cell))
        sc = rng.uniform(0.22, 0.7)
        nw = max(10, int(cell * sc))
        sp = sp.resize((nw, nw), Image.Resampling.LANCZOS)
        bg.alpha_composite(sp, (rng.randint(10, 620 - nw), rng.randint(10, 340 - nw)))
    bg.convert("RGB").save(OUT / "preview-drops.jpg", quality=92)
    print("preview-drops.jpg")


def main():
    sunny = generate_sunny()
    save_webp(sunny, OUT / "sunny.webp", quality=82)

    # Prefer a tileable version of the existing photographic rain/storm if present,
    # but always also write a structured procedural overcast (used for cloudy).
    rain_proc = generate_overcast(kind="rain")
    storm_proc = generate_overcast(kind="storm")
    existing_rain = generate_from_existing("light-rain.webp", 0.10)
    existing_storm = generate_from_existing("storm.webp", 0.10)
    # Use procedural: existing photos are not periodic and a 10% seam still flashes
    # a join when scrolled. Procedural fbm is already periodic in X.
    save_webp(rain_proc, OUT / "light-rain.webp", quality=82)
    save_webp(storm_proc, OUT / "storm.webp", quality=82)
    if existing_rain:
        save_webp(existing_rain, OUT / "light-rain-from-photo.webp", quality=82)
    if existing_storm:
        save_webp(existing_storm, OUT / "storm-from-photo.webp", quality=82)

    cloudy = generate_overcast(kind="cloudy")
    save_webp(cloudy, OUT / "cloudy.webp", quality=82)

    fall = generate_rain_fall(density=0.85, seed=5, angle_deg=5.0)
    save_webp(fall, OUT / "rain-fall.webp", quality=80)

    sheet = make_drop_sheet()
    sheet.save(OUT / "drops.png")
    print(f"wrote {OUT / 'drops.png'} {sheet.size} {(OUT / 'drops.png').stat().st_size} bytes")
    save_webp(sheet, OUT / "drops.webp", quality=95, lossless=True)
    preview_composite()


if __name__ == "__main__":
    main()
