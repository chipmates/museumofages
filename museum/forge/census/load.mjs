// Loads a wing's TypeScript data in node: compiled in memory, `?raw` imports read
// from disk, relative imports followed. Nothing is written and no renderer runs.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const museumRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function resolveRelative(root, from, id) {
  const base = path.resolve(path.dirname(from), id)
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  throw new Error(`${path.relative(root, from)} imports ${id}, which does not resolve`)
}

/** A loader bound to one museum checkout (the census may read another tree's wing). */
export function createLoader(root = museumRoot) {
  const cache = new Map()
  const load = (file) => {
    const abs = path.isAbsolute(file) ? file : path.join(root, file)
    if (cache.has(abs)) return cache.get(abs).exports
    const output = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const module = { exports: {} }
    cache.set(abs, module)
    const require_ = (id) => {
      if (id.endsWith('?raw')) {
        return { __esModule: true, default: fs.readFileSync(path.resolve(path.dirname(abs), id.slice(0, -4)), 'utf8') }
      }
      if (id.startsWith('.')) {
        const target = resolveRelative(root, abs, id)
        if (target.endsWith('.json')) return JSON.parse(fs.readFileSync(target, 'utf8'))
        return load(target)
      }
      throw new Error(`${path.relative(root, abs)} imports ${id}, which the census does not provide`)
    }
    vm.runInNewContext(output, {
      module, exports: module.exports, require: require_, console, structuredClone, URL, TextEncoder, TextDecoder,
    })
    return module.exports
  }
  return load
}
