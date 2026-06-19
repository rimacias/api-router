import type { Auth, Endpoint, HeaderKV, SubApi } from './types'

// --- Postman collection v2.1 parsing -----------------------------------------
// Isomorphic (runs in the browser and on the server). We only read the fields we
// forward; unknown fields are ignored, not an error.

const uid = () => globalThis.crypto.randomUUID()

type PmAuthEntry = { key: string; value: string }
type PmAuth = { type?: string } & Record<string, PmAuthEntry[] | string | undefined>

function entries(arr: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (Array.isArray(arr)) for (const e of arr as PmAuthEntry[]) if (e?.key) out[e.key] = e.value ?? ''
  return out
}

function parseAuth(a: PmAuth | undefined): Auth {
  if (!a?.type || a.type === 'noauth') return { type: 'none' }
  if (a.type === 'bearer') return { type: 'bearer', token: entries(a.bearer).token ?? '' }
  if (a.type === 'basic') {
    const b = entries(a.basic)
    return { type: 'basic', username: b.username ?? '', password: b.password ?? '' }
  }
  if (a.type === 'apikey') {
    const k = entries(a.apikey)
    return { type: 'apikey', key: k.key ?? '', value: k.value ?? '', in: k.in === 'query' ? 'query' : 'header' }
  }
  return { type: 'none' }
}

function rawUrl(url: unknown): string {
  if (typeof url === 'string') return url
  if (url && typeof url === 'object') {
    const u = url as { raw?: string }
    if (u.raw) return u.raw
  }
  return ''
}

function rawBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const b = body as { mode?: string; raw?: string; urlencoded?: PmAuthEntry[]; formdata?: PmAuthEntry[] }
  if (b.mode === 'raw') return b.raw
  if (b.mode === 'urlencoded' && b.urlencoded) return new URLSearchParams(entries(b.urlencoded)).toString()
  if (b.mode === 'formdata' && b.formdata) return JSON.stringify(entries(b.formdata))
  return b.raw
}

type PmItem = {
  name?: string
  item?: PmItem[]
  request?: {
    method?: string
    url?: unknown
    header?: { key: string; value: string; disabled?: boolean }[]
    body?: unknown
    auth?: PmAuth
  }
}

function flatten(items: PmItem[] | undefined, prefix = ''): Endpoint[] {
  const out: Endpoint[] = []
  for (const it of items ?? []) {
    const name = prefix ? `${prefix} / ${it.name ?? ''}` : it.name ?? ''
    if (it.item) {
      out.push(...flatten(it.item, name)) // folder -> recurse
    } else if (it.request) {
      const r = it.request
      const headers: HeaderKV[] = (r.header ?? []).map((h) => ({ key: h.key, value: h.value ?? '', enabled: !h.disabled }))
      out.push({
        id: uid(),
        name: name || r.method || 'request',
        method: (r.method || 'GET').toUpperCase(),
        url: rawUrl(r.url),
        headers,
        body: rawBody(r.body),
        auth: r.auth ? parseAuth(r.auth) : undefined,
      })
    }
  }
  return out
}

type PmCollection = {
  info?: { name?: string }
  item?: PmItem[]
  auth?: PmAuth
  variable?: PmAuthEntry[]
}
type PmEnvironment = { values?: { key: string; value: string; enabled?: boolean }[] }

/** Parse a Postman v2.1 collection (+ optional environment) into a SubApi. */
export function parseCollection(collection: PmCollection, environment?: PmEnvironment): SubApi {
  const vmap = new Map<string, string>() // preserves order, env overrides collection
  for (const v of collection.variable ?? []) if (v.key) vmap.set(v.key, v.value ?? '')
  for (const v of environment?.values ?? []) if (v.key && v.enabled !== false) vmap.set(v.key, v.value ?? '')
  return {
    id: uid(),
    name: collection.info?.name || 'Imported API',
    auth: parseAuth(collection.auth),
    variables: [...vmap].map(([key, value]) => ({ key, value })),
    endpoints: flatten(collection.item),
  }
}
