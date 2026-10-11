import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { guardSceneApiRequest, sceneApiJson, sceneApiPreflight } from '@/lib/scene-api-security'
import { getSceneOperations } from '@/lib/scene-store-server'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

const createDesignSchema = z.object({
  name: z.string().min(1).max(200),
})

export function OPTIONS(request: NextRequest) {
  return sceneApiPreflight(request)
}

/** The scene's family: base, designs cloned from it and theirs, parents first. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const guard = guardSceneApiRequest(request)
  if (guard) return guard

  const { id } = await params
  const operations = await getSceneOperations()
  const designs = await operations.listDesignFamily(id)
  if (designs.length === 0) {
    return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
  }
  return sceneApiJson(request, { designs })
}

/** Clones the stored scene into a new design that points back at it. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const guard = guardSceneApiRequest(request)
  if (guard) return guard

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: 'body must be valid JSON' },
      { status: 400 },
    )
  }
  const parsed = createDesignSchema.safeParse(body)
  if (!parsed.success) {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { id } = await params
  const operations = await getSceneOperations()
  try {
    const meta = await operations.createDesign(id, parsed.data.name)
    return sceneApiJson(request, meta, {
      status: 201,
      headers: { Location: `/scene/${meta.id}` },
    })
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === 'not_found') return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
    if (code === 'too_large') return sceneApiJson(request, { error: 'too_large' }, { status: 413 })
    const message = error instanceof Error ? error.message : 'unexpected_error'
    return sceneApiJson(request, { error: 'internal_error', message }, { status: 500 })
  }
}
