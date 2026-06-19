import type { Auth, Endpoint, SubApi } from './types'

// Server-side: turn a configured endpoint into a concrete outbound request,
// resolving {{vars}} and applying auth. Uses Buffer (Node), so keep this out of
// the client bundle — the browser only needs the parser in postman.ts.

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
  const vars = Object.fromEntries((api.variables ?? []).map((v) => [v.key, v.value]))
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
