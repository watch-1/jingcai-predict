#!/usr/bin/env python3
"""Preview 377 sunny plates: fixed sun in the upper-right, seamless drifting clouds.

Same 376 layer split (static sun/sky, panning RGBA clouds). The sun is moved off
the centered league title to the upper-right, inward of the 关注 chip so the
glow does not sit under the button. Cloud field is unchanged except the local
warm kiss follows the new sun.
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Import the 370 helpers without running main().
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import importlib.util

spec = importlib.util.spec_from_file_location("gen_weather_370", ROOT / "tools" / "gen-weather-370.py")
gw = importlib.util.module_from_spec(spec)
# Prevent 370 main from running if the module has a side effect — spec.loader.exec_module
# will run main only if guarded. It is guarded.
spec.loader.exec_module(gw)

OUT = Path(os.environ.get("WX377_OUT", str(ROOT / "public/assets/weather")))
OUT.mkdir(parents=True, exist_ok=True)


def generate_sunny_layers(w=1600, h=800):
    """Return (sky_sun RGB, clouds RGBA, composite RGB) from the 370 sunny field."""
    xx, yy = gw.grid(w, h)
    xn, yn = xx / w, yy / h
    warp_x = gw.fbm(xx / w * 4, yy / h * 3, 4, 3, 3, octaves=4) - 0.5
    warp_y = gw.fbm(xx / w * 4 + 2.1, yy / h * 3, 4, 3, 9, octaves=4) - 0.5
    cx = xx / w * 6 + warp_x * 1.4
    cy = yy / h * 4 + warp_y * 1.2
    n_cu = gw.fbm(cx, cy, 6, 4, 17, octaves=6, gain=0.52)
    billow = 1 - np.abs(n_cu * 2 - 1)
    cumulus = np.clip((billow - 0.52) / 0.36, 0, 1)
    cumulus = cumulus ** 1.05
    dens = 0.55 + 0.45 * (0.4 + 0.6 * yn) * (0.7 + 0.3 * np.sin(xn * 2 * math.pi + 0.6))
    cumulus *= np.clip(dens, 0, 1)
    n_ci = gw.fbm(xx / w * 5, yy / h * 12, 5, 12, 31, octaves=5, gain=0.55)
    cirrus = np.clip((n_ci - 0.55) / 0.35, 0, 1) ** 1.2
    cirrus *= np.clip(1.0 - yn * 0.7, 0.25, 1) * 0.55
    top = np.array([40, 118, 205], dtype=np.float64)
    bot = np.array([110, 175, 228], dtype=np.float64)
    t = np.clip(yn * 1.05, 0, 1)
    sky = (1 - t)[:, :, None] * top + t[:, :, None] * bot
    hv = 0.96 + 0.08 * np.sin(xn * 2 * math.pi + 1.2)
    sky = sky * hv[:, :, None]
    # Sun — fixed upper-right, not center (was 0.50, 0.28 in 376).
    # Chosen so the bright disc sits in the sky to the right of the league
    # name/date and inward/below the top-right 关注 chip. Same compact disc
    # family as 370–376, slightly tighter halo so the center text stays
    # readable and the chip is not washed out. sy stays in the top ~45% of
    # the plate so the sticky top-crop can still show the sun on the right
    # without a new cutoff.
    sx, sy = 0.78, 0.30
    dx = xn - sx
    dy = (yn - sy) * (h / w)
    dist = np.sqrt(dx * dx + dy * dy)
    core = np.exp(-(dist * 18.0) ** 2)
    disc = np.exp(-(dist * 11.0) ** 2)
    halo = np.exp(-(dist * 4.4) ** 2)
    warm = np.array([255, 228, 170], dtype=np.float64)
    white = np.array([255, 252, 245], dtype=np.float64)
    sky = sky + halo[:, :, None] * (warm - sky) * 0.50
    sky = sky + disc[:, :, None] * (warm - sky) * 0.65
    sky = sky + core[:, :, None] * (white - sky)
    shade = np.clip(0.78 + 0.22 * (1 - yn) + 0.08 * (n_cu - 0.5), 0.68, 1.0)
    ccol = np.array([255, 255, 255]) * shade[:, :, None] + np.array([200, 212, 224]) * (1 - shade[:, :, None])
    # Do not bake a sun-kiss into the panning cloud plate: the 377 sun sits
    # near the right edge, and a non-periodic kiss would flash at the wrap.
    # Warmth comes from the fixed sun/halo layer showing through thin alpha.
    cloud = np.clip(cumulus * 0.95 + cirrus * 0.65, 0, 1)
    composite = sky * (1 - cloud[:, :, None]) + ccol * cloud[:, :, None]
    clouds = np.concatenate(
        [np.clip(ccol, 0, 255), np.clip(cloud * 255.0, 0, 255)[:, :, None]],
        axis=2,
    )
    return (
        gw.to_img(sky, "RGB"),
        gw.to_img(clouds, "RGBA"),
        gw.to_img(composite, "RGB"),
    )


def edge_seam_score(arr, band=8):
    """Mean absolute difference between left and right vertical edges (0–255)."""
    left = arr[:, :band].astype(np.float64)
    right = arr[:, -band:].astype(np.float64)
    return float(np.mean(np.abs(left - right)))


def main():
    sky, clouds, composite = generate_sunny_layers()
    # Replace sunny.webp with the fixed sun/sky plate (no baked drifting sun).
    gw.save_webp(sky, OUT / "sunny.webp", quality=88)
    gw.save_webp(clouds, OUT / "sunny-clouds.webp", quality=90)
    # Optional QA composites, only when writing to a temp dir.
    qa = os.environ.get("WX377_QA")
    if qa:
        qdir = Path(qa)
        qdir.mkdir(parents=True, exist_ok=True)
        composite.save(qdir / "composite-t0.png")
        sky.save(qdir / "sky-sun.png")
        clouds.save(qdir / "clouds.png")
        # Clouds shifted 50% over the fixed sun — sun must stay put.
        w, h = sky.size
        c_arr = np.array(clouds)
        shifted = Image.fromarray(np.roll(c_arr, w // 2, axis=1), "RGBA")
        Image.alpha_composite(sky.convert("RGBA"), shifted).convert("RGB").save(qdir / "composite-shift50.png")
        Image.alpha_composite(sky.convert("RGBA"), clouds).convert("RGB").save(qdir / "composite-over-sky.png")
        # Seam join of the cloud plate (right edge | left edge).
        join = Image.new("RGBA", (640, 320))
        sl = clouds.crop((w - 320, h // 5, w, h // 5 + 320))
        sr = clouds.crop((0, h // 5, 320, h // 5 + 320))
        join.paste(sl, (0, 0))
        join.paste(sr, (320, 0))
        join.save(qdir / "clouds-seam.png")
        sky_arr = np.array(sky)
        c_rgb = c_arr[..., :3]
        c_a = c_arr[..., 3]
        print("sky edge MAD", round(edge_seam_score(sky_arr), 3))
        print("cloud rgb edge MAD", round(edge_seam_score(c_rgb), 3))
        print("cloud alpha edge MAD", round(edge_seam_score(c_a[:, :, None]), 3))
        print("sun at", 0.78, 0.30)
        # Bright core must be in the upper-right, not centered.
        xs = np.where(sky_arr.mean(axis=2) >= 240)
        print("bright mean x,y", float(xs[1].mean() / w), float(xs[0].mean() / h))


if __name__ == "__main__":
    main()
