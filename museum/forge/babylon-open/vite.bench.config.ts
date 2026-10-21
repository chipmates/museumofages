/* The museum's config for the dev bench pages: the wing-pages plugin rewrites index.html and refuses any
   other page that lacks the lobby's marks, so the benches (map, gate, opening) are served without it. */
import { defineConfig, type PluginOption } from 'vite'
import base from '../../vite.config'

const flat = (base.plugins ?? []).flat() as PluginOption[]
export default defineConfig({
  ...base,
  plugins: flat.filter((p) => !(p && typeof p === 'object' && 'name' in p && p.name === 'na-wing-pages')),
})
