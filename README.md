# API Router

A Next.js app that **fans out** one incoming route to multiple sub-APIs at once.
Hit `/api/gw/account` and it calls every endpoint you mapped to `/account` —
across all your sub-APIs — in parallel, then returns each response keyed by
sub-API. Sub-APIs are configured by uploading a **Postman collection** and
editing it in the UI.

## Run

```bash
npm install
npm run dev      # http://localhost:3000  — the management UI
npm test         # parser + auth/variable resolution checks
```

## How it works

- **UI** (`/`) — import a Postman v2.1 collection (+ optional environment),
  edit endpoints / headers / variables / auth, define routes, and test them.
- **Gateway** (`/api/gw/<your-route>`) — looks up the route, fans out to every
  mapped target in parallel, returns:
  ```json
  { "route": "/account", "results": {
      "Billing API › Get account": { "status": 200, "ok": true, "latencyMs": 42, "body": {...} },
      "CRM API › Lookup":          { "status": 200, "ok": true, "latencyMs": 88, "body": {...} }
  }}
  ```
  HTTP `200` if every target succeeded, `207` (Multi-Status) otherwise.
- **Config** lives in `data/config.json` (JSON on disk, no database).

## Decisions (and where the ceilings are)

- **Fan-out, not merge.** Differently-shaped APIs are returned per-target, not
  deep-merged — merging unknown shapes is a guessing game. Aggregate downstream.
- **Auth** is read from the collection (bearer / API key / basic) and editable
  per sub-API, with optional per-endpoint override. `{{variables}}` from the
  collection + environment resolve in URLs, headers, body, and auth.
- **Storage** is a single JSON file with in-process write serialization — fine
  for one instance. Cluster it → move to SQLite/Postgres.
