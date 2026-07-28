import type { BlogDraft, QueueItem } from '../types'

const API_BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      ...init,
    })
  } catch {
    throw new Error(
      'API’ye ulaşılamıyor (Failed to fetch). Terminalde: cd blog-portal && npm run dev',
    )
  }

  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string
  }

  if (!res.ok) {
    throw new Error(data.error || `API hata: ${res.status}`)
  }

  return data
}

export async function apiLogin(email: string, password: string) {
  return request<{
    ok: boolean
    token: string
    user?: { id: string; email: string; displayName?: string }
    authSource?: string
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function apiRegister(
  email: string,
  password: string,
  displayName?: string,
) {
  return request<{
    ok: boolean
    token: string
    user?: { id: string; email: string; displayName?: string }
    authSource?: string
  }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  })
}

export async function apiListBlogs() {
  const data = await request<{ ok: boolean; blogs: BlogDraft[] }>('/blogs')
  return data.blogs
}

export async function apiSaveBlog(draft: BlogDraft) {
  const data = await request<{ ok: boolean; blog: BlogDraft }>('/blogs', {
    method: 'POST',
    body: JSON.stringify(draft),
  })
  return data.blog
}

export async function apiDeleteBlog(id: string) {
  return request<{ ok: boolean }>(`/blogs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function apiUpdateBlogStatus(
  id: string,
  status: BlogDraft['status'],
) {
  const data = await request<{ ok: boolean; blog: BlogDraft }>(
    `/blogs/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  )
  return data.blog
}

export async function apiHealth() {
  return request<{
    ok: boolean
    db?: string | null
    dbDriver?: string | null
    gemini?: boolean
    mcpLlm?: string | null
    auth?: string | null
    ready?: boolean
  }>('/health')
}

/** Gerçek MD pipeline + self-correction (uzun sürebilir) */
export async function apiRunPipeline(input: {
  product: string
  scope: string
  audience: string
  feedbackNote?: string
}) {
  return request<{ ok: boolean; blog: BlogDraft; elapsedMs: number }>(
    '/pipeline/generate',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export async function apiListQueue() {
  const data = await request<{ ok: boolean; items: QueueItem[] }>('/queue')
  return data.items
}

export async function apiAddQueueItem(input: {
  product: string
  scope: string
  audience: string
}) {
  const data = await request<{ ok: boolean; item: QueueItem }>('/queue', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return data.item
}

export async function apiDeleteQueueItem(id: string) {
  return request<{ ok: boolean }>(`/queue/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function apiRetryQueueItem(id: string) {
  return request<{ ok: boolean }>(
    `/queue/${encodeURIComponent(id)}/retry`,
    { method: 'POST' },
  )
}

export async function apiRunNextQueue() {
  return request<{
    ok: boolean
    ran?: boolean
    message?: string
    error?: string
    blog?: BlogDraft
    queueId?: string
    elapsedMs?: number
  }>('/queue/run-next', { method: 'POST' })
}
