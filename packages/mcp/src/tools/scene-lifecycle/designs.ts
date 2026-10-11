import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { SceneOperations } from '../../operations'
import { SceneNotFoundError } from '../../storage/types'
import { ADDITIVE_TOOL_ANNOTATIONS, READ_ONLY_TOOL_ANNOTATIONS } from '../annotations'
import { ErrorCode, throwMcpError } from '../errors'
import { editorUrlFor } from './metadata'

const designEntry = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  depth: z.number(),
  nodeCount: z.number(),
  updatedAt: z.string(),
  editorUrl: z.string(),
})

export const createDesignInput = {
  name: z
    .string()
    .min(1)
    .max(200)
    .describe('Name of the new design, e.g. "Variante A – Wand offen".'),
  sourceId: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('The scene or design to clone. Default: the scene this session has loaded.'),
}

export const createDesignOutput = {
  id: z.string(),
  name: z.string(),
  parentId: z.string(),
  editorUrl: z.string(),
  nodeCount: z.number(),
}

export const listDesignsInput = {
  sceneId: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Any scene of the family. Default: the scene this session has loaded.'),
}

export const listDesignsOutput = { designs: z.array(designEntry) }

function activeSceneId(operations: SceneOperations): string | undefined {
  return operations.hasBridge ? operations.getActiveScene()?.id : undefined
}

export function registerDesignTools(server: McpServer, operations: SceneOperations): void {
  server.registerTool(
    'create_design',
    {
      title: 'Create design',
      description:
        'Clone a stored scene into a new design (an alternative to try changes in) without touching the original. The clone keeps a pointer to its source, so designs can branch into sub-designs. Save the source first: the clone copies what is stored. It does not load the clone: call load_scene with the returned id to edit it, and the person switches designs in the editor.',
      inputSchema: createDesignInput,
      outputSchema: createDesignOutput,
      annotations: ADDITIVE_TOOL_ANNOTATIONS,
    },
    async ({ name, sourceId }) => {
      const source = sourceId ?? activeSceneId(operations)
      if (!source) {
        throwMcpError(
          ErrorCode.InvalidParams,
          'source_required: pass sourceId or load a scene first',
        )
      }
      try {
        const meta = await operations.createDesign(source, name)
        const payload = {
          id: meta.id,
          name: meta.name,
          parentId: source,
          editorUrl: editorUrlFor(meta),
          nodeCount: meta.nodeCount,
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
          structuredContent: payload,
        }
      } catch (err) {
        if (err instanceof SceneNotFoundError) {
          throwMcpError(ErrorCode.InvalidParams, 'scene_not_found', { id: source })
        }
        throwMcpError(ErrorCode.InternalError, err instanceof Error ? err.message : String(err))
      }
    },
  )

  server.registerTool(
    'list_designs',
    {
      title: 'List designs',
      description:
        'List the designs of a scene family — the base scene and every design cloned from it or from them, parents first, with their depth in the tree.',
      inputSchema: listDesignsInput,
      outputSchema: listDesignsOutput,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ sceneId }) => {
      const id = sceneId ?? activeSceneId(operations)
      if (!id) {
        throwMcpError(ErrorCode.InvalidParams, 'scene_required: pass sceneId or load a scene first')
      }
      try {
        const family = await operations.listDesignFamily(id)
        const depthOf = new Map<string, number>()
        const designs = family.map((scene) => {
          const depth = scene.parentId ? (depthOf.get(scene.parentId) ?? 0) + 1 : 0
          depthOf.set(scene.id, depth)
          return {
            id: scene.id,
            name: scene.name,
            parentId: scene.parentId ?? null,
            depth,
            nodeCount: scene.nodeCount,
            updatedAt: scene.updatedAt,
            editorUrl: editorUrlFor(scene),
          }
        })
        const payload = { designs }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
          structuredContent: payload,
        }
      } catch (err) {
        throwMcpError(ErrorCode.InternalError, err instanceof Error ? err.message : String(err))
      }
    },
  )
}
