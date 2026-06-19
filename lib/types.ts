export type HeaderKV = { key: string; value: string; enabled?: boolean }

export type Auth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'apikey'; key: string; value: string; in: 'header' | 'query' }
  | { type: 'basic'; username: string; password: string }

export type Endpoint = {
  id: string
  name: string
  method: string
  url: string // may contain {{vars}}
  headers: HeaderKV[]
  body?: string // raw body, may contain {{vars}}
  auth?: Auth // optional per-endpoint override of the sub-API auth
}

export type SubApi = {
  id: string
  name: string
  auth: Auth // collection-level auth, used unless an endpoint overrides it
  variables: Record<string, string> // collection + environment {{vars}}, editable
  endpoints: Endpoint[]
}

export type Route = {
  id: string
  path: string // incoming path, e.g. "/account" (served under /api/gw)
  targets: { apiId: string; endpointId: string }[] // fanned out in parallel
}

export type Config = { apis: SubApi[]; routes: Route[] }
