import type { BlogDraft } from '../types'

const DRAFTS_KEY = 'matriks-mcp-blog-drafts'

export function loadDrafts(): BlogDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as BlogDraft[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveDrafts(drafts: BlogDraft[]): void {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}

export function upsertDraft(draft: BlogDraft): BlogDraft[] {
  const existing = loadDrafts().filter((d) => d.id !== draft.id)
  const next = [draft, ...existing]
  saveDrafts(next)
  return next
}

export function deleteDraft(id: string): BlogDraft[] {
  const next = loadDrafts().filter((d) => d.id !== id)
  saveDrafts(next)
  return next
}
