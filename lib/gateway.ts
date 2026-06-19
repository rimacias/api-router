import type { Config } from './types.ts'
import { buildRequest } from './resolve.ts'

const norm = (p: string) => '/' + p.replace(/^\/+|\/+$/g, '')

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export type FanoutResult = { httpStatus: number; body: unknown }

// Look up the route for `incomingPath`, call every mapped target in parallel,
// and aggregate per-target responses keyed by "ApiName › endpointName".
// 200 if all targets ok (or no targets), 207 otherwise, 404 if route missing.
export async function fanout(
  cfg: Config,
  incomingPath: string,
  opts: { query?: string; method?: string; body?: string } = {},
): Promise<FanoutResult> {
  const incoming = norm(incomingPath)
  const route = cfg.routes.find((r) => norm(r.path) === incoming)
  if (!route) return { httpStatus: 404, body: { error: `no route configured for ${incoming}` } }

  const query = opts.query ? opts.query.replace(/^\?/, '') : ''

  const pairs = await Promise.all(
    route.targets.map(async (t) => {
      const api = cfg.apis.find((a) => a.id === t.apiId)
      const ep = api?.endpoints.find((e) => e.id === t.endpointId)
      const label = api && ep ? `${api.name} › ${ep.name}` : t.apiId
      if (!api || !ep) return [label, { error: 'target not found' }] as const

      const r = buildRequest(ep, api)
      let url = r.url
      if (query) url += (url.includes('?') ? '&' : '?') + query
      const sendBody = opts.body && r.method !== 'GET' && r.method !== 'HEAD' ? opts.body : r.body
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
  return { httpStatus: allOk ? 200 : 207, body: { route: route.path, results } }
}
