#!/usr/bin/env node
/* THE MEASURE'S BAKE: runs the figure's recipe (src/measure/build.ts) once
   in node and writes one .glb (positions, field normals, indices; one mesh,
   no material) and a record beside it: the recipe, the counts, the times and
   the file's sha256. The file goes to the asset store; the recipe stays here.

     node forge/measure-bake.mjs --out <abs file.glb> [--voxel 0.004] [--triangles 4000]
                                 [--height 1.7] [--drawn <abs .ts exporting drawn(): Field>]
*/
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, '')] = argv[i + 1]
if (!opt.out) throw new Error('--out <abs file.glb> is required')

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
})
try {
  const { buildSurface, RECIPE } = await server.ssrLoadModule('/src/measure/build.ts')
  const recipe = {
    height: Number(opt.height ?? RECIPE.height),
    voxel: Number(opt.voxel ?? RECIPE.voxel),
    triangles: Number(opt.triangles ?? RECIPE.triangles),
  }
  const drawn = opt.drawn ? (await server.ssrLoadModule(`/@fs${resolve(opt.drawn)}`)).drawn() : undefined
  const t = performance.now()
  const built = buildSurface(recipe, drawn)
  const ms = performance.now() - t
  const glb = toGlb(built.pos, built.nrm, built.idx)
  mkdirSync(dirname(resolve(opt.out)), { recursive: true })
  writeFileSync(resolve(opt.out), glb)
  const record = {
    file: resolve(opt.out).split('/').pop(),
    bytes: glb.length,
    sha256: createHash('sha256').update(glb).digest('hex'),
    recipe,
    drawn: opt.drawn ? 'given' : 'src/measure/body.ts',
    stats: built.stats,
    totalMs: Math.round(ms),
    node: process.version,
  }
  writeFileSync(resolve(opt.out).replace(/\.glb$/, '.json'), JSON.stringify(record, null, 1) + '\n')
  console.log(JSON.stringify(record))
} finally {
  await server.close()
}

/** a glTF 2.0 binary with one mesh: float positions and normals, 16- or 32-bit indices */
function toGlb(pos, nrm, idx) {
  const n = pos.length / 3
  const wide = n > 65535
  const index = wide ? Uint32Array.from(idx) : Uint16Array.from(idx)
  const pad4 = (k) => (k + 3) & ~3
  const posBytes = pos.byteLength
  const nrmBytes = nrm.byteLength
  const idxBytes = index.byteLength
  const binLength = pad4(posBytes) + pad4(nrmBytes) + pad4(idxBytes)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let v = 0; v < n; v++)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[3 * v + k])
      max[k] = Math.max(max[k], pos[3 * v + k])
    }
  const json = {
    asset: { version: '2.0', generator: 'Museum of Ages, forge/measure-bake.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'measure' }],
    meshes: [{ name: 'measure', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }] }],
    buffers: [{ byteLength: binLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: pad4(posBytes), byteLength: nrmBytes, target: 34962 },
      { buffer: 0, byteOffset: pad4(posBytes) + pad4(nrmBytes), byteLength: idxBytes, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: n, type: 'VEC3' },
      { bufferView: 2, componentType: wide ? 5125 : 5123, count: idx.length, type: 'SCALAR' },
    ],
  }
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20)])
  const bin = Buffer.alloc(binLength)
  Buffer.from(pos.buffer, pos.byteOffset, posBytes).copy(bin, 0)
  Buffer.from(nrm.buffer, nrm.byteOffset, nrmBytes).copy(bin, pad4(posBytes))
  Buffer.from(index.buffer, index.byteOffset, idxBytes).copy(bin, pad4(posBytes) + pad4(nrmBytes))
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8)
  const chunk = (buf, type) => {
    const h = Buffer.alloc(8)
    h.writeUInt32LE(buf.length, 0)
    h.writeUInt32LE(type, 4)
    return Buffer.concat([h, buf])
  }
  return Buffer.concat([header, chunk(jsonBuf, 0x4e4f534a), chunk(bin, 0x004e4942)])
}
