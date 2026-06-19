'use client'

import { useEffect, useState } from 'react'
import type { Auth, Config, Endpoint } from '@/lib/types'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

function defaultAuth(type: string): Auth {
  if (type === 'bearer') return { type: 'bearer', token: '' }
  if (type === 'apikey') return { type: 'apikey', key: '', value: '', in: 'header' }
  if (type === 'basic') return { type: 'basic', username: '', password: '' }
  return { type: 'none' }
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

  async function importCollection(collectionFile: File, envFile?: File) {
    setMsg('Importing…')
    const collection = JSON.parse(await collectionFile.text())
    const environment = envFile ? JSON.parse(await envFile.text()) : undefined
    const r = await fetch('/api/import', { method: 'POST', body: JSON.stringify({ collection, environment }) })
    const j = await r.json()
    if (!r.ok) return setMsg(`Error: ${j.error}`)
    setCfg(await (await fetch('/api/config')).json())
    setDirty(false)
    setMsg(`Imported "${j.api.name}" (${j.api.endpoints.length} endpoints).`)
  }

  if (!cfg) return <main>{msg || 'Loading…'}</main>

  return (
    <main>
      <div className="sticky between">
        <div>
          <h1>API Router</h1>
          <span className="muted">Fan-out to all mapped sub-APIs at once · configs in data/config.json</span>
        </div>
        <div className="row">
          {dirty && <span className="tag" style={{ color: 'var(--warn)' }}>unsaved</span>}
          <span className="muted">{msg}</span>
          <button className="primary" onClick={save} disabled={!dirty}>Save</button>
        </div>
      </div>

      <ImportBox onImport={importCollection} />

      <section>
        <h2>Sub-APIs ({cfg.apis.length})</h2>
        {cfg.apis.length === 0 && <p className="muted">None yet — import a Postman collection above.</p>}
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

            <AuthEditor auth={api.auth} onChange={(a) => patch((d) => { d.apis[ai].auth = a })} />

            <label>Variables (resolve {'{{name}}'} in URLs, headers, body & auth)</label>
            <VarsEditor key={api.id} vars={api.variables} onChange={(v) => patch((d) => { d.apis[ai].variables = v })} />

            <label style={{ marginTop: 12 }}>Endpoints ({api.endpoints.length})</label>
            {api.endpoints.map((ep, ei) => (
              <details className="sub" key={ep.id}>
                <summary className="row">
                  <span className="method" style={{ color: 'var(--accent)' }}>{ep.method}</span>
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

      <section>
        <div className="between">
          <h2>Routes ({cfg.routes.length})</h2>
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
            {cfg.apis.length === 0 && <span className="muted">Import an API first.</span>}
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
                      <span className="method">{ep.method}</span> {ep.name}
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

function ImportBox({ onImport }: { onImport: (c: File, e?: File) => void }) {
  const [col, setCol] = useState<File | null>(null)
  const [env, setEnv] = useState<File | null>(null)
  return (
    <section className="card">
      <h3>Import Postman collection</h3>
      <div className="grid2" style={{ marginTop: 10 }}>
        <div>
          <label>Collection (v2.1 JSON) — required</label>
          <input type="file" accept=".json,application/json" onChange={(e) => setCol(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <label>Environment (JSON) — optional, fills {'{{vars}}'}</label>
          <input type="file" accept=".json,application/json" onChange={(e) => setEnv(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <button className="primary" style={{ marginTop: 12 }} disabled={!col} onClick={() => col && onImport(col, env ?? undefined)}>Import</button>
    </section>
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

function VarsEditor({ vars, onChange }: { vars: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  // Local array keeps row order/identity stable while editing keys; record is derived.
  const [rows, setRows] = useState<[string, string][]>(() => Object.entries(vars))
  const sync = (next: [string, string][]) => {
    setRows(next)
    onChange(Object.fromEntries(next.filter(([k]) => k.trim())))
  }
  return (
    <div>
      {rows.map(([k, v], i) => (
        <div className="row" key={i} style={{ marginTop: 4 }}>
          <input className="mono inline" style={{ width: 200 }} placeholder="name" value={k} onChange={(e) => sync(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
          <input className="mono" style={{ flex: 1 }} placeholder="value" value={v} onChange={(e) => sync(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
          <button className="danger" onClick={() => sync(rows.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button style={{ marginTop: 6 }} onClick={() => sync([...rows, ['', '']])}>+ Variable</button>
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

function Tester({ routes, dirty }: { routes: string[]; dirty: boolean }) {
  const [path, setPath] = useState(routes[0] ?? '/account')
  const [method, setMethod] = useState('GET')
  const [body, setBody] = useState('')
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    setOut('')
    const url = '/api/gw/' + path.replace(/^\/+/, '')
    try {
      const r = await fetch(url, { method, body: method === 'GET' || method === 'HEAD' ? undefined : body || undefined })
      const j = await r.json()
      setOut(`${r.status} ${r.statusText}\n\n` + JSON.stringify(j, null, 2))
    } catch (e) {
      setOut(String(e))
    }
    setBusy(false)
  }

  return (
    <section className="card">
      <h3>Test a route</h3>
      {dirty && <p className="muted">Save first — the gateway reads the saved config on disk.</p>}
      <div className="row" style={{ marginTop: 8 }}>
        <select className="inline" value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span className="mono muted">/api/gw</span>
        <input className="mono" style={{ maxWidth: 280 }} value={path} onChange={(e) => setPath(e.target.value)} />
        {routes.length > 0 && (
          <select className="inline" value="" onChange={(e) => e.target.value && setPath(e.target.value)}>
            <option value="">pick a route…</option>
            {routes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <button className="primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      </div>
      {method !== 'GET' && method !== 'HEAD' && (
        <>
          <label>Request body (forwarded to non-GET targets)</label>
          <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </>
      )}
      {out && <pre style={{ marginTop: 12 }}>{out}</pre>}
    </section>
  )
}
