// The river's ripple footprint (open/earth.ts): the pixel drawn, from the camera's vertical field and the drawing
// height each frame, never finer than the stills' constant, so the stills at the kit's sizes keep their water and a
// coarser rendition (the 1x film) fades the ripples where they would fall under a pixel.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP, DEFAULT_SIZES, devicePixels, parseSize } from '../pages.mjs'

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) } catch (e) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[a-z]+$/.test(spec)) return next(spec + '.ts', ctx)
    throw e
  }
}`), import.meta.url)

const B = join(APP, 'src/wings/babylon')
const E = await import(pathToFileURL(join(B, 'open/earth.ts')).href)
const cams = JSON.parse(readFileSync(join(B, 'map/map-cams.json'), 'utf8'))
const D2R = Math.PI / 180
// the vertical field aim() gives a horizontal lens at a size (map.ts)
const vfov = (hfov, w, h) => (2 * Math.atan(Math.tan((hfov / 2) * D2R) * (h / w))) / D2R

test('the water takes its pixel from the camera: the module exports the setter, the uniform and the floor', () => {
  assert.equal(typeof E.setWaterPixel, 'function')
  assert.equal(typeof E.waterPixel, 'function')
  assert.ok(E.uWaterPix && 'value' in E.uWaterPix)
  assert.equal(E.PIX_RAD, 0.00057)
})

test('the footprint never drops below the constant, at any field and height', () => {
  for (let f = 5; f <= 120; f += 5) for (const h of [100, 450, 844, 900, 1688, 1800, 2532, 4000, 8000]) {
    assert.ok(E.waterPixel(f, h) >= E.PIX_RAD, `${f} deg at ${h} px`)
  }
})

test('it follows the camera: the field over the drawing height, coarser at 1x than at 2x', () => {
  const [w1, h1] = [800, 450]
  const v = vfov(cams.lens.desktop, w1, h1)
  const one = E.waterPixel(v, h1)
  assert.ok(Math.abs(one - (v * D2R) / h1) < 1e-12)
  assert.ok(one > 2 * E.PIX_RAD)
  // halving the drawing height doubles it while it is above the floor; a wider field widens it
  assert.ok(Math.abs(E.waterPixel(v, 225) - 2 * one) < 1e-12)
  assert.ok(E.waterPixel(v * 1.2, h1) > one)
  const p = vfov(cams.lens.phone, 390, 844)
  assert.ok(E.waterPixel(p, 844) > 2 * E.PIX_RAD)
  // the setter carries it to the shader's uniform, each frame
  E.setWaterPixel(v, h1)
  assert.ok(Math.abs(E.uWaterPix.value - one) < 1e-9)
  E.setWaterPixel(v, 1800)
  assert.equal(E.uWaterPix.value, E.PIX_RAD)
})

test('the stills at the kit\'s sizes draw at the floor: their water as it was', () => {
  for (const [framing, hfov] of [['desktop', cams.lens.desktop], ['phone', cams.lens.phone]]) {
    const [w, h] = devicePixels(parseSize(DEFAULT_SIZES[framing]))
    assert.equal(E.waterPixel(vfov(hfov, w, h), h), E.PIX_RAD, `${framing} ${w}x${h} at ${hfov} deg`)
  }
})

test('the river\'s material measures its footprint with the uniform, and the map hands it the camera each frame', () => {
  const earth = readFileSync(join(B, 'open/earth.ts'), 'utf8')
  const water = earth.slice(earth.indexOf('export function waterMaterial'))
  assert.match(water, /const foot = dist\.mul\(uWaterPix\)/)
  assert.doesNotMatch(water, /mul\(PIX_RAD\)/)
  const map = readFileSync(join(B, 'map/map.ts'), 'utf8')
  const aim = map.slice(map.indexOf('function aim('), map.indexOf('function aim(') + 1500)
  assert.match(aim, /setWaterPixel\(camera\.fov, h\)/)
})
