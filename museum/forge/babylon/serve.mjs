// THE KIT'S SERVERS: the museum's own vite dev server for the Babylon pages, and a writer that takes the rig's files
// into one folder and nowhere else. Used by shoot.mjs and smoke.mjs.
//
//   const s = await serve({ port: 5214, out: '/abs/folder' })   // the writer listens on port + 1
//   s.url('map')  ->  http://127.0.0.1:5214/src/wings/babylon/map/map.html?tier=max&put=...
//   await s.close()
import { createServer as httpServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { APP, PAGES, checkPort } from './pages.mjs'

const inside = (root, p) => p === root || p.startsWith(root + sep)

/** a path the page may write: absolute, no '..', inside the out folder */
export function writableIn(root) {
  return (p) => (isAbsolute(p) && !p.split(/[\\/]/).includes('..') && inside(root, resolve(p)) ? resolve(p) : null)
}

export async function serve({ port, out = null, config = 'vite.config.ts', quiet = true }) {
  checkPort(port)
  const dport = checkPort(port + 1)
  let server = null
  if (out) {
    const root = resolve(out)
    const writable = writableIn(root)
    server = httpServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', '*')
      if (req.method === 'OPTIONS') return res.end()
      const url = new URL(req.url, `http://127.0.0.1:${dport}`)
      const to = req.method === 'POST' && url.pathname === '/put' ? writable(url.searchParams.get('path') ?? '') : null
      if (!to) { res.statusCode = 403; return res.end('refused') }
      const parts = []
      req.on('data', (c) => parts.push(c))
      req.on('end', () => { mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, Buffer.concat(parts)); res.end('ok') })
    })
    await new Promise((r, j) => { server.once('error', j); server.listen(dport, '127.0.0.1', r) })
  }
  const { createServer } = await import('vite')
  const vite = await createServer({
    root: APP, configFile: join(APP, config),
    server: { port, strictPort: true, host: '127.0.0.1', fs: { allow: [APP] } }, logLevel: quiet ? 'error' : 'warn',
  })
  await vite.listen()
  const base = `http://127.0.0.1:${port}`
  return {
    base,
    url(page, q = '') {
      const put = server ? `&put=${encodeURIComponent(`http://127.0.0.1:${dport}/put`)}` : ''
      return `${base}/${PAGES[page].html}?tier=max${put}${q ? `&${q}` : ''}`
    },
    async close() { await vite.close().catch(() => {}); if (server) await new Promise((r) => server.close(r)) },
  }
}
