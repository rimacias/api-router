import { readConfig, writeConfig } from '@/lib/store'
import type { Config } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(await readConfig())
}

export async function PUT(req: Request) {
  const cfg = (await req.json()) as Config
  if (!cfg || !Array.isArray(cfg.apis) || !Array.isArray(cfg.routes))
    return Response.json({ error: 'invalid config: expected { apis: [], routes: [] }' }, { status: 400 })
  await writeConfig(cfg)
  return Response.json({ ok: true })
}
