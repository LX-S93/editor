import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import { SqliteSceneStore } from '../storage/sqlite-scene-store'
import { SceneNotFoundError } from '../storage/types'
import { createSceneOperations } from './scene-operations'

const graph: SceneGraph = {
  nodes: {
    site_abc: {
      object: 'node',
      id: 'site_abc',
      type: 'site',
      parentId: null,
      visible: true,
      metadata: {},
    },
  } as SceneGraph['nodes'],
  rootNodeIds: ['site_abc'] as SceneGraph['rootNodeIds'],
}

describe('designs', () => {
  let root: string
  let store: SqliteSceneStore

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'pascal-designs-test-'))
    store = new SqliteSceneStore({ databasePath: path.join(root, 'pascal.db') })
  })

  afterEach(async () => {
    store.close()
    await fs.rm(root, { recursive: true, force: true })
  })

  test('a design is a copy that points back at its source and leaves it untouched', async () => {
    const operations = createSceneOperations({ store })
    const base = await operations.saveScene({ id: 'bestand', name: 'Bestand', graph })

    const design = await operations.createDesign(base.id, 'Variante A')

    expect(design.parentId).toBe('bestand')
    expect(design.nodeCount).toBe(base.nodeCount)
    expect((await store.load('bestand'))?.version).toBe(base.version)
    expect((await store.load('bestand'))?.parentId ?? null).toBeNull()
  })

  test('the family lists the base first and nests sub-designs under their parent', async () => {
    const operations = createSceneOperations({ store })
    await operations.saveScene({ id: 'bestand', name: 'Bestand', graph })
    const a = await operations.createDesign('bestand', 'Variante A')
    const b = await operations.createDesign('bestand', 'Variante B')
    const a1 = await operations.createDesign(a.id, 'Variante A1')
    await operations.saveScene({ id: 'other', name: 'Anderes Haus', graph })

    const fromSubDesign = await operations.listDesignFamily(a1.id)

    expect(fromSubDesign.map((scene) => scene.id)).toEqual(['bestand', a.id, a1.id, b.id])
  })

  test('saving a design again keeps its parent', async () => {
    const operations = createSceneOperations({ store })
    await operations.saveScene({ id: 'bestand', name: 'Bestand', graph })
    const design = await operations.createDesign('bestand', 'Variante A')

    const saved = await operations.saveScene({
      id: design.id,
      name: 'Variante A',
      graph,
      expectedVersion: design.version,
    })

    expect(saved.parentId).toBe('bestand')
  })

  test('cloning a scene that does not exist fails', async () => {
    const operations = createSceneOperations({ store })

    await expect(operations.createDesign('missing', 'x')).rejects.toBeInstanceOf(SceneNotFoundError)
  })

  test('deleting a design moves its sub-designs up to its parent', async () => {
    const operations = createSceneOperations({ store })
    await operations.saveScene({ id: 'bestand', name: 'Bestand', graph })
    const a = await operations.createDesign('bestand', 'Variante A')
    const a1 = await operations.createDesign(a.id, 'Variante A1')

    await operations.deleteStoredScene(a.id)

    expect((await store.load(a1.id))?.parentId).toBe('bestand')
    expect((await operations.listDesignFamily(a1.id)).map((scene) => scene.id)).toEqual([
      'bestand',
      a1.id,
    ])
  })
})
