// THE SAMPLED SKY WITH THE SUN'S MASKS KEPT TO THE SUN: a preload for the kit's tools (`NODE_OPTIONS='--import <this>'`)
// that hands every page a three build in which a light whose shadow map is SKY_REF_MAP texels wide (the sampled sky's,
// `?sky=sampled&skymap=8191`) skips the materials' receivedShadowNode. Those nodes hold sun-only masks (a court's own
// sun shadow, the paving where the sun clears the walls, a room's no-sun), which blacken the reference's sky lights.
// Calibration only: the product's pages and the tools themselves are untouched.
import { chromium } from 'playwright'

const MARK = Number(process.env.SKY_REF_MAP ?? 8191)
const FROM = 'if (builder.material.receivedShadowNode) node = builder.material.receivedShadowNode(node);'
const TO = `if (builder.material.receivedShadowNode && this.light?.shadow?.mapSize?.x !== ${MARK}) node = builder.material.receivedShadowNode(node);`
const launch = chromium.launch.bind(chromium)
chromium.launch = async (...args) => {
  const browser = await launch(...args)
  const newPage = browser.newPage.bind(browser)
  browser.newPage = async (...a) => {
    const page = await newPage(...a)
    await page.route(/\/node_modules\/\.vite\/deps\/three_tsl\.js/, async (route) => {
      const r = await route.fetch()
      const body = await r.text()
      if (!body.includes(FROM)) {
        console.log('ERROR sky-ref-hook: the receivedShadowNode line was not found in three_tsl.js')
        return route.fulfill({ response: r, body })
      }
      console.log(`sky-ref-hook: lights with ${MARK}-texel maps skip the materials' receivedShadowNode`)
      await route.fulfill({ response: r, body: body.replace(FROM, TO) })
    })
    return page
  }
  return browser
}
