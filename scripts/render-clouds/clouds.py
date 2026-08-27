#!/usr/bin/env python3
"""Volumetric clouds, raymarched offline and baked to sprites.

Why offline: the same reasoning that put a still of the jet on the page instead
of a live glTF. A real volumetric cloud is a density field that has to be
marched per pixel, twice — once along the view ray and once toward the light for
the self-shadowing that makes it read as a solid body rather than a smudge. That
is a fragment shader running every frame on the phone's GPU, for something that
never changes shape. Marched once here, it is four small images that the
compositor slides past each other for nothing.

What it actually computes, per pixel:

    for each step along the view ray
        d = density(p)                      fbm noise, shaped by an ellipsoid
        if d > 0
            march a few steps toward the light, accumulating occlusion
            light = exp(-occlusion)         Beer-Lambert
            colour += light * d * remaining_transmittance
            transmittance *= exp(-d * step)

so the top-left of each puff is lit and the underside falls into shadow, which
is the whole reason it looks three-dimensional.

The palette follows the band underneath it, and that band is sky now.

It used to be ivory, and a white cloud on ivory is an invisible cloud — so the
lit tone sat barely above the band and a warm grey shadow carried the whole
shape. Against blue the opposite holds: the cloud can be white, because the
ground is darker than it is, and the shadow only has to be cool and a little
deeper rather than dark. Too dark and a fair-weather cloud turns into a storm.

    python3 clouds.py [outdir]

Writes .webp directly. The sprites are consumed as webp by the page, and a PNG
that somebody has to remember to convert is a step that eventually gets
forgotten.
"""
import sys, os, math
import numpy as np
from PIL import Image

RES        = 768          # sprite edge, before the final downscale
VIEW_STEPS = 56
LIGHT_STEPS= 5
OCTAVES    = 4
LIT        = np.array([255, 255, 255], np.float32)   # white, the sky is darker
SHADOW     = np.array([170, 190, 212], np.float32)   # cool and only a little deeper
LIGHT_DIR  = np.array([-0.55, -0.68, 0.48], np.float32)
LIGHT_DIR /= np.linalg.norm(LIGHT_DIR)


def noise_grid(rng, n):
    """One octave of value noise: a random lattice, wrapped so it tiles."""
    g = rng.random((n, n, n), dtype=np.float32)
    return g


def sample(grid, p):
    """Trilinear sample of a wrapped lattice. p is (...,3) in lattice units."""
    n = grid.shape[0]
    p0 = np.floor(p).astype(np.int32)
    f  = p - p0
    f  = f * f * (3.0 - 2.0 * f)                     # smoothstep, so octaves are C1
    x0, y0, z0 = (p0[..., 0] % n), (p0[..., 1] % n), (p0[..., 2] % n)
    x1, y1, z1 = (x0 + 1) % n, (y0 + 1) % n, (z0 + 1) % n
    fx, fy, fz = f[..., 0], f[..., 1], f[..., 2]
    c00 = grid[x0, y0, z0] * (1 - fx) + grid[x1, y0, z0] * fx
    c10 = grid[x0, y1, z0] * (1 - fx) + grid[x1, y1, z0] * fx
    c01 = grid[x0, y0, z1] * (1 - fx) + grid[x1, y0, z1] * fx
    c11 = grid[x0, y1, z1] * (1 - fx) + grid[x1, y1, z1] * fx
    c0 = c00 * (1 - fy) + c10 * fy
    c1 = c01 * (1 - fy) + c11 * fy
    return c0 * (1 - fz) + c1 * fz


def fbm(grids, p, scale):
    """Fractal Brownian motion: octaves at doubling frequency, halving weight."""
    total = np.zeros(p.shape[:-1], np.float32)
    amp, freq, norm = 1.0, scale, 0.0
    for g in grids:
        total += amp * sample(g, p * freq)
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm


def density(grids, p, shape, drift):
    """Noise carved by an ellipsoid, so the puff has a body and a soft edge.

    The mask has a plateau: it is 1 through the middle and only ramps down over
    the outer shell. A pure (1-r)^k falloff reaches 1 at a single point, so
    multiplying the noise by it left the whole field under the cut threshold and
    the first render came out at 0.5% mean alpha — a cloud made of nothing.
    """
    q = p + drift
    n = fbm(grids, q, shape["scale"])
    r = np.sqrt((((p - shape["c"]) / shape["r"]) ** 2).sum(-1))
    falloff = np.clip((1.0 - r) / shape["edge"], 0.0, 1.0)
    falloff = falloff * falloff * (3.0 - 2.0 * falloff)          # smooth the shell
    d = (n * falloff - shape["cut"]) / (1.0 - shape["cut"])
    return np.clip(d, 0.0, 1.0) * shape["dens"]


def render(seed, shape):
    rng = np.random.default_rng(seed)
    grids = [noise_grid(rng, 24) for _ in range(OCTAVES)]
    drift = rng.random(3).astype(np.float32) * 40.0

    # orthographic camera looking down -Z, so the sprite is a flat cut-out
    u = (np.arange(RES, dtype=np.float32) + 0.5) / RES * 2.0 - 1.0
    X, Y = np.meshgrid(u, u)
    Z0 = np.full_like(X, -1.4)
    step = 2.8 / VIEW_STEPS

    colour = np.zeros((RES, RES, 3), np.float32)
    trans  = np.ones((RES, RES), np.float32)

    for i in range(VIEW_STEPS):
        z = Z0 + i * step
        p = np.stack([X, Y, z], -1)
        d = density(grids, p, shape, drift)
        live = d > 0.002
        if not live.any():
            continue

        # march toward the light for self-shadowing
        occ = np.zeros_like(d)
        for k in range(1, LIGHT_STEPS + 1):
            lp = p + LIGHT_DIR * (k * 0.16)
            occ += density(grids, lp, shape, drift) * 0.16
        lit = np.exp(-occ * shape["absorb"])

        tone = SHADOW + (LIT - SHADOW) * lit[..., None]
        a = 1.0 - np.exp(-d * step * shape["absorb"] * 9.0)
        colour += tone * (a * trans)[..., None]
        trans *= 1.0 - a

    alpha = np.clip(1.0 - trans, 0.0, 1.0)
    with np.errstate(invalid="ignore", divide="ignore"):
        rgb = np.where(alpha[..., None] > 1e-4, colour / np.maximum(alpha[..., None], 1e-4), LIT)
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    a8 = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, a8]), "RGBA")


SHAPES = [
    # a wide flat bank, the kind you look down on
    dict(c=np.float32([0.00, 0.00, 0.0]), r=np.float32([1.00, 0.60, 0.62]),
         scale=2.4, cut=0.40, edge=0.50, dens=1.7, absorb=2.8),
    # a taller, lumpier one
    dict(c=np.float32([0.00, 0.00, 0.0]), r=np.float32([0.94, 0.88, 0.66]),
         scale=3.2, cut=0.42, edge=0.46, dens=1.8, absorb=3.0),
    # a smaller, wispier puff
    dict(c=np.float32([0.00, 0.00, 0.0]), r=np.float32([0.88, 0.70, 0.55]),
         scale=4.0, cut=0.42, edge=0.44, dens=1.7, absorb=2.9),
    # a long veil, for the layer that crosses in front of the aircraft
    dict(c=np.float32([0.00, 0.00, 0.0]), r=np.float32([1.00, 0.40, 0.48]),
         scale=2.6, cut=0.40, edge=0.62, dens=1.3, absorb=2.3),
    # a small high wisp — with more clouds on the band, repetition is what gives
    # the trick away, so the two extra shapes exist to break the pattern
    dict(c=np.float32([0.00, 0.00, 0.0]), r=np.float32([0.74, 0.52, 0.48]),
         scale=4.6, cut=0.44, edge=0.48, dens=1.5, absorb=2.6),
    # a broad, soft, slow bank for the far layer
    dict(c=np.float32([0.00, 0.00, 0.0]), r=np.float32([1.00, 0.52, 0.58]),
         scale=2.0, cut=0.38, edge=0.58, dens=1.6, absorb=2.5),
]

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    for i, shape in enumerate(SHAPES, 1):
        img = render(1000 + i * 7, shape)
        img = img.resize((RES // 2, RES // 2), Image.LANCZOS)   # supersampled edges
        box = img.getchannel("A").point(lambda v: 255 if v > 3 else 0).getbbox()
        if box:
            pad = 6
            img = img.crop((max(0, box[0] - pad), max(0, box[1] - pad),
                            min(img.width, box[2] + pad), min(img.height, box[3] + pad)))
        path = os.path.join(out, f"sky-cloud-{i}.webp")
        img.save(path, "WEBP", quality=88, method=6)
        a = np.asarray(img)[..., 3]
        print(f"{path}  {img.size[0]}x{img.size[1]}  Deckung {a.mean()/255*100:5.1f}%  "
              f"max {a.max()}")
