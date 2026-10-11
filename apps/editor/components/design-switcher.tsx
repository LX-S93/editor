'use client'

import { CornerDownRight, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface DesignEntry {
  id: string
  name: string
  parentId?: string | null
}

interface DesignSwitcherProps {
  sceneId: string
}

/**
 * Switches between the base scene and its designs. A design is a clone of a scene that keeps a
 * pointer to its source, so designs branch into sub-designs; the original is never touched.
 */
export function DesignSwitcher({ sceneId }: DesignSwitcherProps) {
  const router = useRouter()
  const [designs, setDesigns] = useState<DesignEntry[]>([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/scenes/${sceneId}/designs`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { designs?: DesignEntry[] } | null) => {
        if (!cancelled && payload?.designs) setDesigns(payload.designs)
      })
      .catch(() => {
        // The switcher is a convenience; the editor works without it.
      })
    return () => {
      cancelled = true
    }
  }, [sceneId])

  const depthOf = useCallback(
    (entry: DesignEntry) => {
      let depth = 0
      let parent = entry.parentId
      while (parent && depth < 8) {
        const next = designs.find((design) => design.id === parent)
        if (!next) break
        depth++
        parent = next.parentId
      }
      return depth
    },
    [designs],
  )

  const createDesign = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/scenes/${sceneId}/designs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!response.ok) {
        setError(`Entwurf konnte nicht angelegt werden (${response.status})`)
        return
      }
      const meta = (await response.json()) as { id: string }
      router.push(`/scene/${meta.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entwurf konnte nicht angelegt werden')
    } finally {
      setBusy(false)
    }
  }, [name, busy, sceneId, router])

  const current = designs.find((design) => design.id === sceneId)

  return (
    <div className="pointer-events-none absolute top-2 left-1/2 z-40 flex max-w-[60vw] -translate-x-1/2 flex-col items-center gap-1">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-background/90 p-1 shadow-sm backdrop-blur">
        {designs.map((design) => {
          const depth = depthOf(design)
          const active = design.id === sceneId
          return (
            <button
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 font-medium text-xs transition-colors',
                active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/40',
              )}
              key={design.id}
              onClick={() => {
                if (!active) router.push(`/scene/${design.id}`)
              }}
              title={design.name}
              type="button"
            >
              {depth > 0 && <CornerDownRight className="h-3 w-3 opacity-60" />}
              <span className="max-w-40 truncate">{design.name}</span>
            </button>
          )
        })}
        {naming ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault()
              void createDesign()
            }}
          >
            <input
              // biome-ignore lint/a11y/noAutofocus: opened by an explicit click on "Neuer Entwurf"
              autoFocus
              className="w-44 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-ring"
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setNaming(false)
              }}
              placeholder={current ? `Entwurf von „${current.name}“` : 'Name des Entwurfs'}
              value={name}
            />
            <button
              className="rounded-md bg-accent px-2 py-1 font-medium text-xs hover:bg-accent/80 disabled:opacity-50"
              disabled={busy || name.trim().length === 0}
              type="submit"
            >
              Anlegen
            </button>
          </form>
        ) : (
          <button
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-muted-foreground text-xs hover:bg-accent/40"
            onClick={() => {
              setName('')
              setError(null)
              setNaming(true)
            }}
            title="Aktuellen Stand klonen und in einem neuen Entwurf weiterarbeiten"
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            Neuer Entwurf
          </button>
        )}
      </div>
      {error && (
        <p className="pointer-events-auto rounded-md border border-destructive/50 bg-background px-2 py-1 text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  )
}
