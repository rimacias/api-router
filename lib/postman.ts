import { randomUUID } from 'node:crypto'
import type { Auth, Endpoint, HeaderKV, SubApi } from './types'

// --- Postman collection v2.1 parsing ----------------------------------------
// We only read the fields we forward. Unknown fields are ignored, not an error.

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
  if (b.mode === 'urlencoded' && b.urlencoded)
    return new URLSearchParams(entries(b.urlencoded)).toString()
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
      const headers: HeaderKV[] = (r.header ?? []).map((h) => ({
        key: h.key,
        value: h.value ?? '',
        enabled: !h.disabled,
      }))
      out.push({
        id: randomUUID(),
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

export function parseCollection(collection: PmCollection, environment?: PmEnvironment): SubApi {
  const variables: Record<string, string> = {}
  for (const v of collection.variable ?? []) if (v.key) variables[v.key] = v.value ?? ''
  for (const v of environment?.values ?? []) if (v.key && v.enabled !== false) variables[v.key] = v.value ?? ''
  return {
    id: randomUUID(),
    name: collection.info?.name || 'Imported API',
    auth: parseAuth(collection.auth),
    variables,
    endpoints: flatten(collection.item),
  }
}

// --- Request resolution (used by the gateway) --------------------------------

export function applyVars(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`)
}

/** Mutates `headers` for header-based auth; returns a query fragment for apikey-in-query. */
function applyAuth(auth: Auth, headers: Record<string, string>, vars: Record<string, string>): string {
  switch (auth.type) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${applyVars(auth.token, vars)}`
      return ''
    case 'basic': {
      const u = applyVars(auth.username, vars)
      const p = applyVars(auth.password, vars)
      headers['Authorization'] = `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`
      return ''
    }
    case 'apikey': {
      const key = applyVars(auth.key, vars)
      const val = applyVars(auth.value, vars)
      if (auth.in === 'query') return `${encodeURIComponent(key)}=${encodeURIComponent(val)}`
      headers[key] = val
      return ''
    }
    default:
      return ''
  }
}

/** Build the outbound request for an endpoint, resolving {{vars}} and auth. */
export function buildRequest(ep: Endpoint, api: SubApi) {
  const vars = api.variables ?? {}
  let url = applyVars(ep.url, vars)
  const headers: Record<string, string> = {}
  for (const h of ep.headers ?? []) {
    if (h.enabled === false) continue
    headers[h.key] = applyVars(h.value, vars)
  }
  const auth: Auth = ep.auth ?? api.auth ?? { type: 'none' }
  const q = applyAuth(auth, headers, vars)
  if (q) url += (url.includes('?') ? '&' : '?') + q
  const body = ep.body ? applyVars(ep.body, vars) : undefined
  return { method: (ep.method || 'GET').toUpperCase(), url, headers, body }
}
