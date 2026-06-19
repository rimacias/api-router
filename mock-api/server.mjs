import { createServer } from 'node:http'

// One generic mock API, run as 3 services in docker-compose (different API_NAME).
// Every path returns a JSON envelope; a few well-known paths return canned shapes
// so fan-out responses look distinct per API. Add ?status=503 to simulate failure.
const PORT = Number(process.env.PORT || 8080)
const API = process.env.API_NAME || 'mock-api'

function payload(req, url) {
  const base = {
    api: API,
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    receivedAuth: req.headers['authorization'] ?? req.headers['x-api-key'] ?? null,
    at: new Date().toISOString(),
  }
  const p = url.pathname
  if (p === '/health') return { status: 'ok', api: API }
  if (p === '/account' || p === '/me') return { ...base, data: { id: 'acct_123', name: `${API} account`, plan: 'pro', active: true } }
  if (p.endsWith('s') || p.includes('list')) return { ...base, data: [{ id: 1, label: 'alpha' }, { id: 2, label: 'beta' }] }
  return { ...base, data: { ok: true, echo: base.query } }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  let bytes = 0
  for await (const chunk of req) bytes += chunk.length // drain body so POST/PUT complete
  const body = payload(req, url)
  if (bytes) body.receivedBodyBytes = bytes
  const forced = Number(url.searchParams.get('status'))
  const status = forced >= 100 && forced < 600 ? forced : 200
  res.writeHead(status, { 'content-type': 'application/json', 'x-mock-api': API })
  res.end(JSON.stringify(body))
}).listen(PORT, () => console.log(`[${API}] listening on :${PORT}`))
