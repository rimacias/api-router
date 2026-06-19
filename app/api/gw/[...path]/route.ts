import type { NextRequest } from 'next/server'
import { readConfig } from '@/lib/store'
import { fanout } from '@/lib/gateway'

export const dynamic = 'force-dynamic'

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params
  const incoming = '/' + (path ?? []).join('/')
  const cfg = await readConfig()
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const body = hasBody ? await req.text() : undefined
  const { httpStatus, body: payload } = await fanout(cfg, incoming, { query: req.nextUrl.search, method: req.method, body })
  return Response.json(payload, { status: httpStatus })
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
