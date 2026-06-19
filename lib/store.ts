import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Config } from './types'

const FILE = path.join(process.cwd(), 'data', 'config.json')
const EMPTY: Config = { apis: [], routes: [] }

export async function readConfig(): Promise<Config> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'))
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY)
    throw e
  }
}

// ponytail: in-process write serialization only. Fine for a single Next.js
// instance. Run multiple instances against the same file and writes can clobber
// each other — switch to SQLite or a lockfile if you cluster this.
let chain: Promise<unknown> = Promise.resolve()
export function writeConfig(cfg: Config): Promise<void> {
  const run = async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true })
    await fs.writeFile(FILE, JSON.stringify(cfg, null, 2))
  }
  chain = chain.then(run, run)
  return chain as Promise<void>
}
