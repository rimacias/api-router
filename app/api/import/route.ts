import { readConfig, writeConfig } from '@/lib/store'
import { parseCollection } from '@/lib/postman'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { collection, environment } = await req.json()
  if (!collection || (!collection.info && !collection.item))
    return Response.json({ error: 'not a Postman collection (missing info/item)' }, { status: 400 })

  const api = parseCollection(collection, environment)
  const cfg = await readConfig()
  cfg.apis.push(api)
  await writeConfig(cfg)
  return Response.json({ ok: true, api })
}
