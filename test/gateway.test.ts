import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { fanout } from '../lib/gateway.ts'
import type { Config } from '../lib/types.ts'

function startMock(name: string, status = 200) {
  return new Promise<{ port: number; close: () => void }>((resolve) => {
    const srv = createServer((req, res) => {
      const auth = req.headers['authorization'] ?? req.headers['x-api-key'] ?? null
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ from: name, url: req.url, auth }))
    })
    srv.listen(0, () => resolve({ port: (srv.address() as { port: number }).port, close: () => srv.close() }))
  })
}

let a: { port: number; close: () => void }
let b: { port: number; close: () => void }
before(async () => {
  a = await startMock('A')
  b = await startMock('B', 503)
})
after(() => {
  a.close()
  b.close()
})

function cfg(): Config {
  return {
    apis: [
      { id: 'a', name: 'API A', auth: { type: 'bearer', token: '{{tok}}' }, variables: [{ key: 'tok', value: 'T0K' }, { key: 'base', value: `http://localhost:${a.port}` }], endpoints: [{ id: 'ea', name: 'ping', method: 'GET', url: '{{base}}/ping', headers: [] }] },
      { id: 'b', name: 'API B', auth: { type: 'none' }, variables: [], endpoints: [{ id: 'eb', name: 'ping', method: 'GET', url: `http://localhost:${b.port}/ping`, headers: [] }] },
      { id: 'dead', name: 'Dead', auth: { type: 'none' }, variables: [], endpoints: [{ id: 'ed', name: 'x', method: 'GET', url: 'http://localhost:1/nope', headers: [] }] },
    ],
    routes: [{ id: 'r', path: '/account', targets: [{ apiId: 'a', endpointId: 'ea' }, { apiId: 'b', endpointId: 'eb' }, { apiId: 'dead', endpointId: 'ed' }] }],
  }
}

test('fans out to all targets, keyed per sub-API; resolves vars + auth', async () => {
  const { httpStatus, body } = await fanout(cfg(), '/account', { method: 'GET' })
  const results = (body as { results: Record<string, any> }).results
  assert.equal(Object.keys(results).length, 3)
  assert.equal(results['API A › ping'].status, 200)
  assert.equal(results['API A › ping'].body.auth, 'Bearer T0K')
  assert.equal(results['API B › ping'].status, 503)
  assert.ok('error' in results['Dead › x']) // connection refused isolated per-target
  assert.equal(httpStatus, 207) // not all ok
})

test('unknown route -> 404', async () => {
  const { httpStatus, body } = await fanout(cfg(), '/missing')
  assert.equal(httpStatus, 404)
  assert.match((body as { error: string }).error, /no route/)
})

test('forwards incoming query string to every target', async () => {
  const { body } = await fanout(cfg(), '/account', { query: '?q=1', method: 'GET' })
  assert.match((body as any).results['API A › ping'].body.url, /[?&]q=1/)
})

test('all targets ok -> 200', async () => {
  const c = cfg()
  c.routes[0].targets = [{ apiId: 'a', endpointId: 'ea' }]
  const { httpStatus } = await fanout(c, '/account', { method: 'GET' })
  assert.equal(httpStatus, 200)
})
