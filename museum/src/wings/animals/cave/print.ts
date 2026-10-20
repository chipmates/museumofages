/* THE PRINT, on the CPU: stack/post.ts steps 5 to 7 on a linear frame, with a
   lens's halo before them and the film's tooth after, so a still of the
   engine and a Cycles render laid into the engine's plate are printed by one
   curve. Its numpy twin is `bed-cave/tools/print.py`; the two are checked
   against each other on the same plate (`tools/print_check.py`).

   Order: halo (on the exposed linear frame), exposure, lift, toe, gamma and
   gain, the warm-cool split, saturation, the Khronos PBR Neutral shoulder,
   vignette, sRGB, tooth. */

import type { Print } from './site'

const LR = 0.2126
const LG = 0.7152
const LB = 0.0722

/** separable Gaussian of one channel-interleaved RGB float image, in place into `out` */
function blur(src: Float32Array, w: number, h: number, sigma: number, out: Float32Array): void {
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = new Float32Array(2 * r + 1)
  let sum = 0
  for (let i = -r; i <= r; i++) {
    k[i + r] = Math.exp((-i * i) / (2 * sigma * sigma))
    sum += k[i + r]!
  }
  for (let i = 0; i < k.length; i++) k[i] = k[i]! / sum
  const tmp = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0, b = 0, c = 0
      for (let i = -r; i <= r; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i))
        const o = (y * w + xx) * 3
        const kk = k[i + r]!
        a += src[o]! * kk; b += src[o + 1]! * kk; c += src[o + 2]! * kk
      }
      const o = (y * w + x) * 3
      tmp[o] = a; tmp[o + 1] = b; tmp[o + 2] = c
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0, b = 0, c = 0
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i))
        const o = (yy * w + x) * 3
        const kk = k[i + r]!
        a += tmp[o]! * kk; b += tmp[o + 1]! * kk; c += tmp[o + 2]! * kk
      }
      const o = (y * w + x) * 3
      out[o] = a; out[o + 1] = b; out[o + 2] = c
    }
  }
}

/** the halo: what clips after exposure, blurred at two radii on a quarter-size frame and added back */
export function glow(lin: Float32Array, w: number, h: number, p: Print): Float32Array {
  const out = new Float32Array(lin.length)
  if (p.glow.strength <= 0) return out
  const f = 4
  const qw = Math.ceil(w / f), qh = Math.ceil(h / f)
  const q = new Float32Array(qw * qh * 3)
  for (let y = 0; y < qh; y++) {
    for (let x = 0; x < qw; x++) {
      let a = 0, b = 0, c = 0, n = 0
      for (let j = 0; j < f; j++) {
        for (let i = 0; i < f; i++) {
          const xx = x * f + i, yy = y * f + j
          if (xx >= w || yy >= h) continue
          const o = (yy * w + xx) * 3
          const r = lin[o]! * p.exposure, g = lin[o + 1]! * p.exposure, bb = lin[o + 2]! * p.exposure
          const l = r * LR + g * LG + bb * LB
          const over = l > p.glow.threshold ? (l - p.glow.threshold) / Math.max(l, 1e-6) : 0
          a += r * over; b += g * over; c += bb * over; n++
        }
      }
      const o = (y * qw + x) * 3
      q[o] = a / n; q[o + 1] = b / n; q[o + 2] = c / n
    }
  }
  const b1 = new Float32Array(q.length)
  const b2 = new Float32Array(q.length)
  blur(q, qw, qh, (p.glow.radii[0] * h) / f, b1)
  blur(q, qw, qh, (p.glow.radii[1] * h) / f, b2)
  // bilinear back up, in the exposed frame's units divided back out so the print's exposure applies once
  for (let y = 0; y < h; y++) {
    const fy = Math.min(qh - 1, Math.max(0, (y + 0.5) / f - 0.5))
    const y0 = Math.floor(fy), y1 = Math.min(qh - 1, y0 + 1), ty = fy - y0
    for (let x = 0; x < w; x++) {
      const fx = Math.min(qw - 1, Math.max(0, (x + 0.5) / f - 0.5))
      const x0 = Math.floor(fx), x1 = Math.min(qw - 1, x0 + 1), tx = fx - x0
      const o = (y * w + x) * 3
      for (let c = 0; c < 3; c++) {
        const s = (b: Float32Array, xx: number, yy: number): number => b[(yy * qw + xx) * 3 + c]!
        const v = (bb: Float32Array): number =>
          (s(bb, x0, y0) * (1 - tx) + s(bb, x1, y0) * tx) * (1 - ty) + (s(bb, x0, y1) * (1 - tx) + s(bb, x1, y1) * tx) * ty
        out[o + c] = ((v(b1) * 0.6 + v(b2) * 0.4) * p.glow.strength) / p.exposure
      }
    }
  }
  return out
}

function neutral(c: [number, number, number]): [number, number, number] {
  const start = 0.8 - 0.04, desat = 0.15
  let [r, g, b] = c
  const x = Math.min(r, g, b)
  const off = x < 0.08 ? x - 6.25 * x * x : 0.04
  r -= off; g -= off; b -= off
  const peak = Math.max(r, g, b)
  if (peak < start) return [r, g, b]
  const d = 1 - start
  const np = 1 - (d * d) / (peak + d - start)
  const k = np / peak
  r *= k; g *= k; b *= k
  const t = 1 - 1 / (desat * (peak - np) + 1)
  return [r + (np - r) * t, g + (np - g) * t, b + (np - b) * t]
}

const srgb = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)

/** the film's tooth (post.ts grainNode), per delivered pixel */
function tooth(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 1597334673) ^ Math.imul(y, 3812015801)) >>> 0
  h = (h ^ Math.imul(seed, 2654435761)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296 - 0.5
}

/** a linear RGB frame (w*h*3) printed to sRGB bytes (w*h*4) */
export function printFrame(lin: Float32Array, w: number, h: number, p: Print, seed = 0): Uint8ClampedArray {
  const halo = glow(lin, w, h, p)
  const out = new Uint8ClampedArray(w * h * 4)
  const toe = p.toe * (1 - Math.min(Math.max(p.shoulder, 0), 1))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let r = (lin[i * 3]! + halo[i * 3]!) * p.exposure
      let g = (lin[i * 3 + 1]! + halo[i * 3 + 1]!) * p.exposure
      let b = (lin[i * 3 + 2]! + halo[i * 3 + 2]!) * p.exposure
      let l = r * LR + g * LG + b * LB
      const lift = Math.min(Math.max(1 - l, 0), 1)
      r += p.lift[0] * lift; g += p.lift[1] * lift; b += p.lift[2] * lift
      if (toe > 0) {
        const L = Math.max(r * LR + g * LG + b * LB, 1e-6)
        const k = L / Math.sqrt(L * L + toe * toe)
        r *= k; g *= k; b *= k
      }
      r = Math.pow(Math.min(Math.max(r, 0), 8), 1 / p.gamma[0]) * p.gain[0]
      g = Math.pow(Math.min(Math.max(g, 0), 8), 1 / p.gamma[1]) * p.gain[1]
      b = Math.pow(Math.min(Math.max(b, 0), 8), 1 / p.gamma[2]) * p.gain[2]
      l = r * LR + g * LG + b * LB
      const t = Math.min(Math.max(l * 1.6, 0), 1)
      const tr = p.cool[0] + (p.warm[0] - p.cool[0]) * t
      const tg = p.cool[1] + (p.warm[1] - p.cool[1]) * t
      const tb = p.cool[2] + (p.warm[2] - p.cool[2]) * t
      r += (r * tr - r) * p.split; g += (g * tg - g) * p.split; b += (b * tb - b) * p.split
      r = l + (r - l) * p.saturation; g = l + (g - l) * p.saturation; b = l + (b - l) * p.saturation
      if (p.shoulder > 0) {
        const n = neutral([r, g, b])
        r += (n[0] - r) * p.shoulder; g += (n[1] - g) * p.shoulder; b += (n[2] - b) * p.shoulder
      }
      const u = (x + 0.5) / w - 0.5, v = (y + 0.5) / h - 0.5
      const rr = Math.sqrt(u * u + v * v)
      const s = Math.min(Math.max((rr - 0.34) / (0.86 - 0.34), 0), 1)
      const vig = 1 - s * s * (3 - 2 * s) * p.vignette
      const film = p.grain > 0 ? tooth(x, y, seed) * p.grain : 0
      out[i * 4] = Math.round((srgb(Math.min(Math.max(r * vig, 0), 1)) + film) * 255)
      out[i * 4 + 1] = Math.round((srgb(Math.min(Math.max(g * vig, 0), 1)) + film) * 255)
      out[i * 4 + 2] = Math.round((srgb(Math.min(Math.max(b * vig, 0), 1)) + film) * 255)
      out[i * 4 + 3] = 255
    }
  }
  return out
}
