// POST /v1/funnel: the museum's own count. A beacon from the walk or from a site page names one step and its
// fields (_count/rows.js). The function adds the country and the device class, writes one row to the museum's own
// dataset when every field is on its list, and answers 204 either way, so a sender learns nothing.
// Nothing about the request is kept: not its address, not its user agent, not its referrer. There is no limiter
// here, since a limiter would have to hold an address.

import { countryOf, deviceOf, rowOf } from '../_count/rows.js'

// A beacon is a few dozen bytes; anything much larger is not ours.
const MAX_BODY = 1024

const quiet = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

export async function onRequestPost({ request, env }) {
  try {
    // a browser on another site may not count here: its Origin, when it sends one, must be this site's own
    const origin = request.headers.get('Origin')
    if (origin && origin !== new URL(request.url).origin) return quiet()
    // a browser that sends Global Privacy Control is not counted at all
    if (request.headers.get('Sec-GPC') === '1') return quiet()
    const text = await request.text()
    if (!text || text.length > MAX_BODY) return quiet()
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      return quiet()
    }
    const row = rowOf(payload, { country: countryOf(request), device: deviceOf(request.headers) })
    if (row && env.COUNT) env.COUNT.writeDataPoint({ blobs: row, indexes: [row[0]] })
  } catch {
    // a count never answers with an error
  }
  return quiet()
}
