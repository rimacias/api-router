'use client'

import { useEffect, useState } from 'react'
import type { Auth, Config, Endpoint, Variable } from '@/lib/types'
import { parseCollection } from '@/lib/postman'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

function defaultAuth(type: string): Auth {
  if (type === 'bearer') return { type: 'bearer', token: '' }
  if (type === 'apikey') return { type: 'apikey', key: '', value: '', in: 'header' }
  if (type === 'basic') return { type: 'basic', username: '', password: '' }
  return { type: 'none' }
}

function FanOut() {
  return (
    <svg className="fanout" width="86" height="46" viewBox="0 0 86 46" aria-hidden="true">
      <g className="lines">
        <path d="M10,23 C42,23 46,9 78,9" />
        <path d="M10,23 L78,23" />
        <path d="M10,23 C42,23 46,37 78,37" />
      </g>
      <circle className="src" cx="10" cy="23" r="4.5" />
      <circle className="node" cx="78" cy="9" r="3.4" style={{ animationDelay: '0s' }} />
      <circle className="node" cx="78" cy="23" r="3.4" style={{ animationDelay: '0.3s' }} />
      <circle className="node" cx="78" cy="37" r="3.4" style={{ animationDelay: '0.6s' }} />
    </svg>
  )
}

export default function Page() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setCfg).catch((e) => setMsg(String(e)))
  }, [])

  // immer-lite: clone, mutate, store. cfg is plain JSON so structuredClone is safe.
  const patch = (fn: (d: Config) => void) => {
    setCfg((prev) => {
      const d = structuredClone(prev!)
      fn(d)
      return d
    })
    setDirty(true)
  }

  async function save() {
    setMsg('Saving…')
    const r = await fetch('/api/config', { method: 'PUT', body: JSON.stringify(cfg) })
    const j = await r.json()
    setMsg(r.ok ? 'Saved.' : `Error: ${j.error}`)
    if (r.ok) setDirty(false)
  }

  // Parse a Postman collection in the browser and load it INTO an existing
  // sub-API (replacing its endpoints/auth, merging variables). Persist via Save.
  async function loadCollectionInto(ai: number, collectionFile: File, envFile?: File) {
    try {
      const collection = JSON.parse(await collectionFile.text())
      const environment = envFile ? JSON.parse(await envFile.text()) : undefined
      const parsed = parseCollection(collection, environment)
      patch((d) => {
        const api = d.apis[ai]
        if (!api.name.trim() || api.name === 'New API') api.name = parsed.name
        api.auth = parsed.auth
        api.variables = parsed.variables // re-upload = fresh vars + endpoints
        api.endpoints = parsed.endpoints
        // endpoints got new ids, so this API's old route targets are stale — drop them
        d.routes.forEach((r) => (r.targets = r.targets.filter((t) => t.apiId !== api.id)))
      })
      setMsg(`Loaded ${parsed.endpoints.length} endpoints from "${parsed.name}". Save to persist.`)
    } catch (e) {
      setMsg(`Import failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!cfg) return <main>{msg || 'Loading…'}</main>

  return (
    <main>
      <div className="sticky between">
        <div className="brand">
          <FanOut />
          <div>
            <h1>API ROUTER<span className="dim">/</span>console</h1>
            <span className="tagline">Fan-out gateway · one route → many sub-APIs</span>
          </div>
        </div>
        <div className="row">
          {dirty && <span className="tag live">● unsaved</span>}
          <span className="muted mono" style={{ fontSize: 12 }}>{msg}</span>
          <button className="primary" onClick={save} disabled={!dirty}>Save</button>
        </div>
      </div>

      <section className="reveal" style={{ animationDelay: '60ms' }}>
        <div className="sec-head">
          <span className="idx">01</span>
          <h2>Sub-APIs</h2>
          <span className="count">{cfg.apis.length}</span>
          <span className="rule" />
          <button onClick={() => patch((d) => { d.apis.push({ id: crypto.randomUUID(), name: 'New API', auth: { type: 'none' }, variables: [], endpoints: [] }) })}>+ Add sub-API</button>
        </div>
        {cfg.apis.length === 0 && <p className="muted">No sub-APIs yet — add one, then upload its Postman collection.</p>}
        {cfg.apis.map((api, ai) => (
          <div className="card" key={api.id}>
            <div className="between">
              <input style={{ fontWeight: 600, maxWidth: 360 }} value={api.name} onChange={(e) => patch((d) => { d.apis[ai].name = e.target.value })} />
              <button className="danger" onClick={() => patch((d) => {
                const id = d.apis[ai].id
                d.apis.splice(ai, 1)
                d.routes.forEach((r) => (r.targets = r.targets.filter((t) => t.apiId !== id)))
              })}>Delete API</button>
            </div>

            <CollectionUploader hasEndpoints={api.endpoints.length > 0} onLoad={(c, e) => loadCollectionInto(ai, c, e)} />

            <AuthEditor auth={api.auth} onChange={(a) => patch((d) => { d.apis[ai].auth = a })} />

            <label>Variables (resolve {'{{name}}'} in URLs, headers, body & auth)</label>
            <VarsEditor vars={api.variables} onChange={(v) => patch((d) => { d.apis[ai].variables = v })} />

            <label style={{ marginTop: 12 }}>Endpoints ({api.endpoints.length})</label>
            {api.endpoints.map((ep, ei) => (
              <details className="sub endpoint" key={ep.id}>
                <summary className="row">
                  <span className="caret">▸</span>
                  <span className="method" data-method={ep.method}>{ep.method}</span>
                  <span>{ep.name}</span>
                  <span className="muted mono" style={{ fontSize: 11, marginLeft: 'auto' }}>{ep.url}</span>
                </summary>
                <EndpointEditor
                  ep={ep}
                  onChange={(fn) => patch((d) => fn(d.apis[ai].endpoints[ei]))}
                  onDelete={() => patch((d) => {
                    d.apis[ai].endpoints.splice(ei, 1)
                    d.routes.forEach((r) => (r.targets = r.targets.filter((t) => t.endpointId !== ep.id)))
                  })}
                />
              </details>
            ))}
          </div>
        ))}
      </section>

      <section className="reveal" style={{ animationDelay: '140ms' }}>
        <div className="sec-head">
          <span className="idx">02</span>
          <h2>Routes</h2>
          <span className="count">{cfg.routes.length}</span>
          <span className="rule" />
          <button onClick={() => patch((d) => { d.routes.push({ id: crypto.randomUUID(), path: '/new-route', targets: [] }) })}>+ Add route</button>
        </div>
        {cfg.routes.map((route, ri) => (
          <div className="card" key={route.id}>
            <div className="between">
              <div className="row">
                <span className="mono muted">/api/gw</span>
                <input className="mono" style={{ maxWidth: 280 }} value={route.path} onChange={(e) => patch((d) => { d.routes[ri].path = e.target.value })} />
              </div>
              <button className="danger" onClick={() => patch((d) => { d.routes.splice(ri, 1) })}>Delete</button>
            </div>
            <label>Fan out to ({route.targets.length} selected)</label>
            {cfg.apis.length === 0 && <span className="muted">Add a sub-API first.</span>}
            {cfg.apis.map((api) => (
              <div key={api.id} style={{ marginTop: 6 }}>
                <div className="muted" style={{ fontSize: 12 }}>{api.name}</div>
                {api.endpoints.map((ep) => {
                  const on = route.targets.some((t) => t.apiId === api.id && t.endpointId === ep.id)
                  return (
                    <label className="chk" key={ep.id}>
                      <input type="checkbox" checked={on} onChange={() => patch((d) => {
                        const ts = d.routes[ri].targets
                        const idx = ts.findIndex((t) => t.apiId === api.id && t.endpointId === ep.id)
                        if (idx >= 0) ts.splice(idx, 1)
                        else ts.push({ apiId: api.id, endpointId: ep.id })
                      })} />
                      <span className="method" data-method={ep.method}>{ep.method}</span> {ep.name}
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </section>

      <Tester routes={cfg.routes.map((r) => r.path)} dirty={dirty} />
    </main>
  )
}

function CollectionUploader({ hasEndpoints, onLoad }: { hasEndpoints: boolean; onLoad: (c: File, e?: File) => void }) {
  const [col, setCol] = useState<File | null>(null)
  const [env, setEnv] = useState<File | null>(null)
  return (
    <div className="sub">
      <div className="grid2">
        <div>
          <label>Postman collection (v2.1 JSON){hasEndpoints ? ' — re-upload replaces endpoints' : ''}</label>
          <input type="file" accept=".json,application/json" onChange={(e) => setCol(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <label>Environment (JSON) — optional, fills {'{{vars}}'}</label>
          <input type="file" accept=".json,application/json" onChange={(e) => setEnv(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <button style={{ marginTop: 10 }} disabled={!col} onClick={() => col && onLoad(col, env ?? undefined)}>
        {hasEndpoints ? 'Re-upload collection' : 'Upload collection'}
      </button>
    </div>
  )
}

function AuthEditor({ auth, onChange }: { auth: Auth; onChange: (a: Auth) => void }) {
  return (
    <>
      <label>Auth (sent to the sub-API; supports {'{{vars}}'})</label>
      <div className="row">
        <select className="inline" value={auth.type} onChange={(e) => onChange(defaultAuth(e.target.value))}>
          <option value="none">None</option>
          <option value="bearer">Bearer token</option>
          <option value="apikey">API key</option>
          <option value="basic">Basic</option>
        </select>
        {auth.type === 'bearer' && (
          <input placeholder="token" value={auth.token} onChange={(e) => onChange({ type: 'bearer', token: e.target.value })} />
        )}
        {auth.type === 'apikey' && (
          <>
            <input className="inline" placeholder="header / param name" value={auth.key} onChange={(e) => onChange({ ...auth, key: e.target.value })} />
            <input className="inline" placeholder="value" value={auth.value} onChange={(e) => onChange({ ...auth, value: e.target.value })} />
            <select className="inline" value={auth.in} onChange={(e) => onChange({ ...auth, in: e.target.value as 'header' | 'query' })}>
              <option value="header">in header</option>
              <option value="query">in query</option>
            </select>
          </>
        )}
        {auth.type === 'basic' && (
          <>
            <input className="inline" placeholder="username" value={auth.username} onChange={(e) => onChange({ ...auth, username: e.target.value })} />
            <input className="inline" placeholder="password" value={auth.password} onChange={(e) => onChange({ ...auth, password: e.target.value })} />
          </>
        )}
      </div>
    </>
  )
}

function VarsEditor({ vars, onChange }: { vars: Variable[]; onChange: (v: Variable[]) => void }) {
  // Fully controlled, index-keyed: reflects imports immediately and keeps input
  // focus stable while editing keys (no internal state, no record collapse).
  const set = (i: number, p: Partial<Variable>) => onChange(vars.map((r, j) => (j === i ? { ...r, ...p } : r)))
  return (
    <div>
      {vars.map((r, i) => (
        <div className="row" key={i} style={{ marginTop: 4 }}>
          <input className="mono inline" style={{ width: 200 }} placeholder="name" value={r.key} onChange={(e) => set(i, { key: e.target.value })} />
          <input className="mono" style={{ flex: 1 }} placeholder="value" value={r.value} onChange={(e) => set(i, { value: e.target.value })} />
          <button className="danger" onClick={() => onChange(vars.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button style={{ marginTop: 6 }} onClick={() => onChange([...vars, { key: '', value: '' }])}>+ Variable</button>
    </div>
  )
}

function EndpointEditor({ ep, onChange, onDelete }: { ep: Endpoint; onChange: (fn: (e: Endpoint) => void) => void; onDelete: () => void }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div className="row">
        <select className="inline" value={ep.method} onChange={(e) => onChange((x) => { x.method = e.target.value })}>
          {METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <input value={ep.name} onChange={(e) => onChange((x) => { x.name = e.target.value })} />
      </div>
      <label>URL</label>
      <input className="mono" value={ep.url} onChange={(e) => onChange((x) => { x.url = e.target.value })} />

      <label>Headers</label>
      {ep.headers.map((h, hi) => (
        <div className="row" key={hi} style={{ marginTop: 4 }}>
          <input type="checkbox" checked={h.enabled !== false} onChange={(e) => onChange((x) => { x.headers[hi].enabled = e.target.checked })} title="enabled" />
          <input className="mono inline" style={{ width: 200 }} placeholder="header" value={h.key} onChange={(e) => onChange((x) => { x.headers[hi].key = e.target.value })} />
          <input className="mono" style={{ flex: 1 }} placeholder="value" value={h.value} onChange={(e) => onChange((x) => { x.headers[hi].value = e.target.value })} />
          <button className="danger" onClick={() => onChange((x) => { x.headers.splice(hi, 1) })}>×</button>
        </div>
      ))}
      <button style={{ marginTop: 6 }} onClick={() => onChange((x) => { x.headers.push({ key: '', value: '', enabled: true }) })}>+ Header</button>

      <label style={{ marginTop: 10 }}>Body (raw)</label>
      <textarea rows={3} value={ep.body ?? ''} onChange={(e) => onChange((x) => { x.body = e.target.value || undefined })} />

      <label style={{ marginTop: 10 }} className="chk">
        <input type="checkbox" checked={!!ep.auth} onChange={(e) => onChange((x) => { x.auth = e.target.checked ? { type: 'none' } : undefined })} />
        Override API auth for this endpoint
      </label>
      {ep.auth && <AuthEditor auth={ep.auth} onChange={(a) => onChange((x) => { x.auth = a })} />}

      <div style={{ marginTop: 10 }}>
        <button className="danger" onClick={onDelete}>Delete endpoint</button>
      </div>
    </div>
  )
}

type GwResult = { status: number; ok: boolean; latencyMs: number; body: unknown } | { error: string; latencyMs?: number }

function Tester({ routes, dirty }: { routes: string[]; dirty: boolean }) {
  const [path, setPath] = useState(routes[0] ?? '/account')
  const [method, setMethod] = useState('GET')
  const [body, setBody] = useState('')
  const [res, setRes] = useState<{ http: number; text: string; data: any } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    setErr('')
    setRes(null)
    const url = '/api/gw/' + path.replace(/^\/+/, '')
    try {
      const r = await fetch(url, { method, body: method === 'GET' || method === 'HEAD' ? undefined : body || undefined })
      setRes({ http: r.status, text: r.statusText, data: await r.json() })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const results: Record<string, GwResult> | undefined = res?.data?.results
  const httpOk = res ? res.http >= 200 && res.http < 300 : false

  return (
    <section className="reveal" style={{ animationDelay: '220ms' }}>
      <div className="sec-head">
        <span className="idx">03</span>
        <h2>Test</h2>
        <span className="rule" />
      </div>
      <div className="card">
        {dirty && <p className="muted" style={{ margin: '0 0 12px' }}>Unsaved changes — the gateway reads the <strong>saved</strong> config on disk. Save before testing.</p>}
        <div className="row">
          <select className="inline" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <span className="mono muted" style={{ fontSize: 12 }}>/api/gw</span>
          <input className="mono" style={{ maxWidth: 260 }} value={path} onChange={(e) => setPath(e.target.value)} />
          {routes.length > 0 && (
            <select className="inline" value="" onChange={(e) => e.target.value && setPath(e.target.value)}>
              <option value="">routes…</option>
              {routes.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <button className="primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send ▸'}</button>
        </div>
        {method !== 'GET' && method !== 'HEAD' && (
          <>
            <label>Request body (forwarded to non-GET targets)</label>
            <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </>
        )}

        {err && (
          <div className="readout">
            <div className="readout-bar">Response<span className="status-pill" style={{ color: 'var(--err)' }}>NETWORK ERROR</span></div>
            <div className="target-row"><span className="dot err" /><span className="name">{err}</span></div>
          </div>
        )}

        {res && (
          <div className="readout">
            <div className="readout-bar">
              Response · <span style={{ color: 'var(--teal)' }}>{res.data?.route ?? path}</span>
              <span className="status-pill" style={{ color: httpOk ? 'var(--ok)' : 'var(--warn)' }}>{res.http} {res.text || (res.http === 207 ? 'Multi-Status' : '')}</span>
            </div>
            {results ? (
              Object.entries(results).map(([label, v]) => {
                const ok = 'ok' in v && v.ok
                return (
                  <div className="target-row" key={label}>
                    <span className={`dot ${ok ? 'ok' : 'err'}`} />
                    <span className="name">{label}</span>
                    {'error' in v && <span className="code" style={{ color: 'var(--err)' }}>{v.error}</span>}
                    {'status' in v && <span className="code">HTTP {v.status}</span>}
                    {typeof v.latencyMs === 'number' && <span className="lat">{v.latencyMs}ms</span>}
                  </div>
                )
              })
            ) : (
              <div className="target-row"><span className="dot err" /><span className="name">{res.data?.error ?? 'no targets resolved'}</span></div>
            )}
            <details className="raw">
              <summary>Raw response</summary>
              <pre>{JSON.stringify(res.data, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </section>
  )
}
