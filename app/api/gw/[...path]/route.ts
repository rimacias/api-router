import type { NextRequest } from 'next/server'
import { readConfig } from '@/lib/store'
import { buildRequest } from '@/lib/postman'

export const dynamic = 'force-dynamic'

const norm = (p: string) => '/' + p.replace(/^\/+|\/+$/g, '')

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params
  const incoming = norm((path ?? []).join('/'))
  const cfg = await readConfig()
  const route = cfg.routes.find((r) => norm(r.path) === incoming)
  if (!route) return Response.json({ error: `no route configured for ${incoming}` }, { status: 404 })

  const query = req.nextUrl.search // "" or "?a=1"
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const clientBody = hasBody ? await req.text() : undefined

  // Fan out to every mapped target at once. ponytail: each sub-API keeps its own
  // configured request (method/url/body from Postman); we just forward incoming
  // query params and a non-GET body on top. Responses are returned per-target,
  // not deep-merged — merging unknown shapes is a guessing game.
  const pairs = await Promise.all(
    route.targets.map(async (t) => {
      const api = cfg.apis.find((a) => a.id === t.apiId)
      const ep = api?.endpoints.find((e) => e.id === t.endpointId)
      const label = api && ep ? `${api.name} › ${ep.name}` : t.apiId
      if (!api || !ep) return [label, { error: 'target not found' }] as const

      const r = buildRequest(ep, api)
      let url = r.url
      if (query) url += (url.includes('?') ? '&' : '?') + query.slice(1)
      const sendBody = clientBody && r.method !== 'GET' && r.method !== 'HEAD' ? clientBody : r.body
      const started = Date.now()
      try {
        const resp = await fetch(url, { method: r.method, headers: r.headers, body: sendBody })
        const text = await resp.text()
        return [label, { status: resp.status, ok: resp.ok, latencyMs: Date.now() - started, body: tryJson(text) }] as const
      } catch (e) {
        return [label, { error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - started }] as const
      }
    }),
  )

  const results = Object.fromEntries(pairs)
  const allOk = pairs.every(([, v]) => 'ok' in v && v.ok)
  return Response.json({ route: route.path, results }, { status: allOk ? 200 : 207 })
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
