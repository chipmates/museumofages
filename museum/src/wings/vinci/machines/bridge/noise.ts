/** MaterialX's Perlin and Worley noise in plain arithmetic, the same numbers
 * three's `mx_noise_float` and `mx_worley_noise_vec2` give a shader (their
 * hash on 32-bit integers, their fade and gradients). The bark's relief is
 * cut into a pole's geometry from the same field its surface draws the
 * fissures with, so a groove in the outline is a fissure on the face. */

const u32 = (x: number): number => x >>> 0
const rotl = (x: number, k: number): number => u32((x << k) | (x >>> (32 - k)))

function bjfinal(a: number, b: number, c: number): number {
  c = u32(c ^ b); c = u32(c - rotl(b, 14))
  a = u32(a ^ c); a = u32(a - rotl(c, 11))
  b = u32(b ^ a); b = u32(b - rotl(a, 25))
  c = u32(c ^ b); c = u32(c - rotl(b, 16))
  a = u32(a ^ c); a = u32(a - rotl(c, 4))
  b = u32(b ^ a); b = u32(b - rotl(a, 14))
  c = u32(c ^ b); c = u32(c - rotl(b, 24))
  return c
}

function hash3(x: number, y: number, z: number): number {
  const s = u32(0xdeadbeef + (3 << 2) + 13)
  return bjfinal(u32(s + u32(x)), u32(s + u32(y)), u32(s + u32(z)))
}

function hash4(x: number, y: number, z: number, xx: number): number {
  const s = u32(0xdeadbeef + (4 << 2) + 13)
  let a = u32(s + u32(x)), b = u32(s + u32(y)), c = u32(s + u32(z))
  // the mixing round
  a = u32(a - c); a = u32(a ^ rotl(c, 4)); c = u32(c + b)
  b = u32(b - a); b = u32(b ^ rotl(a, 6)); a = u32(a + c)
  c = u32(c - b); c = u32(c ^ rotl(b, 8)); b = u32(b + a)
  a = u32(a - c); a = u32(a ^ rotl(c, 16)); c = u32(c + b)
  b = u32(b - a); b = u32(b ^ rotl(a, 19)); a = u32(a + c)
  c = u32(c - b); c = u32(c ^ rotl(b, 4)); b = u32(b + a)
  a = u32(a + u32(xx))
  return bjfinal(a, b, c)
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

function gradient(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z
  return (h & 1 ? -u : u) + (h & 2 ? -v : v)
}

/** three's `mx_noise_float(vec3)` */
export function perlin3(px: number, py: number, pz: number): number {
  const X = Math.floor(px), Y = Math.floor(py), Z = Math.floor(pz)
  const fx = px - X, fy = py - Y, fz = pz - Z
  const u = fade(fx), v = fade(fy), w = fade(fz)
  const g = (i: number, j: number, k: number): number => gradient(hash3(X + i, Y + j, Z + k), fx - i, fy - j, fz - k)
  const s1 = 1 - u, t1 = 1 - v, r1 = 1 - w
  const r = r1 * (t1 * (g(0, 0, 0) * s1 + g(1, 0, 0) * u) + v * (g(0, 1, 0) * s1 + g(1, 1, 0) * u))
    + w * (t1 * (g(0, 0, 1) * s1 + g(1, 0, 1) * u) + v * (g(0, 1, 1) * s1 + g(1, 1, 1) * u))
  return 0.982 * r
}

const BITS = 4294967295

/** three's `mx_worley_noise_vec2(vec3)`: the squared distances to the nearest two feature points */
export function worley3(px: number, py: number, pz: number): [number, number] {
  const X = Math.floor(px), Y = Math.floor(py), Z = Math.floor(pz)
  const lx = px - X, ly = py - Y, lz = pz - Z
  let d1 = 1e6, d2 = 1e6
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const cx = x + X, cy = y + Y, cz = z + Z
    const ox = hash4(cx, cy, cz, 0) / BITS, oy = hash4(cx, cy, cz, 1) / BITS, oz = hash4(cx, cy, cz, 2) / BITS
    const dx = x + ox - lx, dy = y + oy - ly, dz = z + oz - lz
    const d = dx * dx + dy * dy + dz * dz
    if (d < d1) { d2 = d1; d1 = d } else if (d < d2) d2 = d
  }
  return [d1, d2]
}
