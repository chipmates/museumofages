// THE CLOSER LOOK'S PROOF ROUTE, dev only. A stop's closer look opens from a
// stop at rest, and the stop it belongs to is not in the film yet. This route
// lends it a host stop of the live film: that stop's words become the room's
// working words, its closer look record attaches there, and the held frame is
// laid over with a still of the room. Nothing here reaches a build.
//
//   NA_CLOSER_HOST=<stop id>              the live stop that lends its rest (default courtyard, a stop with no set)
//   NA_CLOSER_STILL_DESK=<png>            the held frame on the desk, the picture's own rows only
//   NA_CLOSER_STILL_PHONE=<png>           the held frame upright on a phone
//   pnpm exec vite --config forge/closer/vite.config.mjs --port <p> --strictPort
import { readFileSync, existsSync } from 'node:fs'
import { mergeConfig } from 'vite'
import base from '../../vite.config.ts'

const HOST = process.env.NA_CLOSER_HOST || 'courtyard'
const STILLS = { desk: process.env.NA_CLOSER_STILL_DESK, phone: process.env.NA_CLOSER_STILL_PHONE }

/** the stop's words while it stands for the room, working lines as the closer look's are */
const STOP = {
  quiet: 'false',
  chapter: { en: 'The Sala delle Asse', de: 'Die Sala delle Asse' },
  age: { en: '46', de: 'mit 46 Jahren' },
  line: { en: 'Sixteen painted trees meet overhead, tied by a golden rope. The design is Leonardo’s.',
    de: 'Sechzehn gemalte Bäume treffen sich über dir, verbunden durch ein goldenes Seil. Der Entwurf ist von Leonardo.' },
  drawer: { en: 'Sixteen trees rise from the walls and meet overhead. A golden rope runs through their branches in knots.',
    de: 'Sechzehn Bäume wachsen aus den Wänden und treffen sich über dir. Ein goldenes Seil läuft in Knoten durch ihre Äste.' },
  certainty: 'reconstructed',
}

function lendStop(code) {
  const at = code.indexOf(`id: ${JSON.stringify(HOST)},`)
  if (at < 0) throw new Error(`the story carries no stop ${HOST}`)
  const end = code.indexOf('\n  },', at)
  let block = code.slice(at, end)
  const field = (name, value) => {
    const line = new RegExp(`\\n    ${name}: .*,`)
    if (!line.test(block)) throw new Error(`the stop ${HOST} has no ${name}`)
    block = block.replace(line, `\n    ${name}: ${value},`)
  }
  field('quiet', STOP.quiet)
  for (const name of ['chapter', 'age', 'line', 'drawer']) field(name, JSON.stringify(STOP[name]))
  field('certainty', JSON.stringify(STOP.certainty))
  return code.slice(0, at) + block + code.slice(end)
}

/** the held frame: a still laid over the film's own element, under every word */
const HELD = `
const form = () => document.getElementById('wing')?.dataset.film
const lay = () => {
  const film = document.querySelector('.na-film')
  const which = form() === 'wide' ? 'desk' : form() ? 'phone' : null
  if (!film || !which) return requestAnimationFrame(lay)
  const held = document.createElement('img')
  held.className = 'forge-held'
  held.src = '/__closer/held-' + which + '.png'
  held.alt = ''
  Object.assign(held.style, { position: 'absolute', objectFit: 'cover', objectPosition: '50% 0', pointerEvents: 'none', zIndex: '0' })
  film.after(held)
  const follow = () => {
    if (!held.isConnected) return
    Object.assign(held.style, { left: film.offsetLeft + 'px', top: film.offsetTop + 'px', width: film.offsetWidth + 'px', height: film.offsetHeight + 'px' })
    requestAnimationFrame(follow)
  }
  follow()
  document.documentElement.dataset.forgeHeld = which
}
lay()
`

function closerRoute() {
  return {
    name: 'na-closer-route',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]
      if (file.endsWith('/src/wings/vinci/closer.ts')) return code.replace("stop: 'asse'", `stop: ${JSON.stringify(HOST)}`)
      if (file.endsWith('/src/wings/vinci/story.ts')) return lendStop(code)
      return null
    },
    configureServer(server) {
      server.middlewares.use('/__closer/', (req, res, next) => {
        const which = /held-(desk|phone)\.png/.exec(req.url ?? '')?.[1]
        const file = which ? STILLS[which] : null
        if (!file || !existsSync(file)) return next()
        res.setHeader('content-type', 'image/png')
        res.setHeader('cache-control', 'no-store')
        res.end(readFileSync(file))
      })
    },
    transformIndexHtml(html) {
      return { html, tags: [{ tag: 'script', attrs: { type: 'module' }, children: HELD, injectTo: 'body' }] }
    },
  }
}

export default mergeConfig(base, { plugins: [closerRoute()] })
