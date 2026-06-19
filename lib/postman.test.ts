import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCollection } from './postman.ts'
import { buildRequest, applyVars } from './resolve.ts'

const collection = {
  info: { name: 'Accounts API' },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{api_token}}' }] },
  variable: [{ key: 'base', value: 'https://acc.example.com' }],
  item: [
    {
      name: 'Accounts',
      item: [
        {
          name: 'Get account',
          request: {
            method: 'get',
            url: { raw: '{{base}}/account?id=1' },
            header: [
              { key: 'Accept', value: 'application/json' },
              { key: 'X-Debug', value: 'on', disabled: true },
            ],
          },
        },
      ],
    },
    {
      name: 'Create account',
      request: {
        method: 'post',
        url: '{{base}}/account',
        body: { mode: 'raw', raw: '{"name":"{{who}}"}' },
        auth: { type: 'apikey', apikey: [{ key: 'key', value: 'X-Api-Key' }, { key: 'value', value: 'secret' }, { key: 'in', value: 'header' }] },
      },
    },
  ],
}

test('parseCollection: name, auth, vars, flattened folders', () => {
  const api = parseCollection(collection, { values: [{ key: 'api_token', value: 'T0K3N' }, { key: 'who', value: 'neo' }] })
  assert.equal(api.name, 'Accounts API')
  assert.deepEqual(api.auth, { type: 'bearer', token: '{{api_token}}' })
  assert.equal(api.variables.find((v) => v.key === 'base')?.value, 'https://acc.example.com')
  assert.equal(api.variables.find((v) => v.key === 'api_token')?.value, 'T0K3N') // env merged over collection
  assert.equal(api.endpoints.length, 2)
  assert.equal(api.endpoints[0].name, 'Accounts / Get account')
  assert.equal(api.endpoints[0].method, 'GET')
})

test('buildRequest: vars + collection bearer auth + disabled header dropped', () => {
  const api = parseCollection(collection, { values: [{ key: 'api_token', value: 'T0K3N' }] })
  const r = buildRequest(api.endpoints[0], api)
  assert.equal(r.url, 'https://acc.example.com/account?id=1')
  assert.equal(r.headers['Authorization'], 'Bearer T0K3N')
  assert.equal(r.headers['Accept'], 'application/json')
  assert.equal(r.headers['X-Debug'], undefined) // disabled
})

test('buildRequest: per-endpoint apikey overrides collection auth, body vars resolved', () => {
  const api = parseCollection(collection, { values: [{ key: 'who', value: 'neo' }] })
  const r = buildRequest(api.endpoints[1], api)
  assert.equal(r.method, 'POST')
  assert.equal(r.headers['X-Api-Key'], 'secret')
  assert.equal(r.headers['Authorization'], undefined) // bearer NOT applied — endpoint override wins
  assert.equal(r.body, '{"name":"neo"}')
})

test('applyVars: leaves unknown vars untouched', () => {
  assert.equal(applyVars('{{a}}/{{missing}}', { a: 'x' }), 'x/{{missing}}')
})
