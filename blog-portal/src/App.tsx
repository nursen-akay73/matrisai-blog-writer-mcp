import { useCallback, useEffect, useState } from 'react'
import type { AppView, BlogDraft, GenerateFormInput } from './types'
import { AUTH_STORAGE_KEY } from './config/auth'
import { apiDeleteBlog, apiListBlogs } from './lib/api'
import { LoginScreen } from './screens/LoginScreen'
import { GenerateForm } from './screens/GenerateForm'
import { Dashboard } from './screens/Dashboard'
import { MatriksLogo } from './components/MatriksLogo'

export default function App() {
  const [authed, setAuthed] = useState(
    () => localStorage.getItem(AUTH_STORAGE_KEY) === '1',
  )
  const [view, setView] = useState<AppView>('generate')
  const [drafts, setDrafts] = useState<BlogDraft[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingBlogs, setLoadingBlogs] = useState(false)
  const [apiError, setApiError] = useState('')
  const [reviseSeed, setReviseSeed] = useState<GenerateFormInput | null>(null)

  const refreshBlogs = useCallback(async () => {
    setLoadingBlogs(true)
    setApiError('')
    try {
      const blogs = await apiListBlogs()
      setDrafts(blogs)
      setSelectedId((prev) => prev ?? blogs[0]?.id ?? null)
    } catch (err) {
      setApiError(
        err instanceof Error
          ? err.message
          : 'Blog listesi alınamadı. API ayakta mı?',
      )
    } finally {
      setLoadingBlogs(false)
    }
  }, [])

  useEffect(() => {
    if (authed) {
      void refreshBlogs()
    }
  }, [authed, refreshBlogs])

  useEffect(() => {
    if (!selectedId && drafts[0]) setSelectedId(drafts[0].id)
  }, [drafts, selectedId])

  function handleLogin() {
    localStorage.setItem(AUTH_STORAGE_KEY, '1')
    setAuthed(true)
  }

  function handleLogout() {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    setAuthed(false)
    setDrafts([])
    setSelectedId(null)
  }

  async function handleGenerated(draft: BlogDraft) {
    setApiError('')
    // Pipeline endpoint zaten SQLite’a kaydetti
    setDrafts((prev) => [draft, ...prev.filter((d) => d.id !== draft.id)])
    setSelectedId(draft.id)
    setView('dashboard')
    await refreshBlogs()
  }

  async function handleDelete(id: string) {
    setApiError('')
    try {
      await apiDeleteBlog(id)
      const next = drafts.filter((d) => d.id !== id)
      setDrafts(next)
      setSelectedId(next[0]?.id ?? null)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  if (!authed) {
    return <LoginScreen onSuccess={handleLogin} />
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F7F9FC]">
      {/* Qodi-like soft mesh glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 45% at 15% 10%, rgba(120,170,255,0.28), transparent 60%), radial-gradient(ellipse 45% 40% at 85% 20%, rgba(200,160,255,0.16), transparent 55%), radial-gradient(ellipse 50% 35% at 50% 90%, rgba(140,200,255,0.12), transparent 50%)',
        }}
      />

      <header className="relative z-20 border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <MatriksLogo size="sm" />
            <div className="hidden h-6 w-px bg-slate-200 sm:block" />
            <span className="text-sm font-semibold text-[#2BB8A6]">MCP</span>
          </div>

          <nav className="flex items-center gap-1 rounded-2xl bg-white/80 p-1 shadow-sm ring-1 ring-slate-200/70">
            <button
              type="button"
              onClick={() => setView('generate')}
              className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold transition ${
                view === 'generate'
                  ? 'bg-[#3B82F6] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Üret
            </button>
            <button
              type="button"
              onClick={() => setView('dashboard')}
              className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold transition ${
                view === 'dashboard'
                  ? 'bg-[#3B82F6] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Dashboard
              {drafts.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px]">
                  {drafts.length}
                </span>
              ) : null}
            </button>
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
          >
            Çıkış
          </button>
        </div>
      </header>

      {apiError ? (
        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <div className="rounded-2xl border border-rose-200 bg-rose-50/95 px-4 py-3 text-sm text-rose-700 shadow-sm">
            {apiError}
          </div>
        </div>
      ) : null}

      <main className="relative z-10 mx-auto px-4 py-6 sm:px-6 sm:py-8">
        {loadingBlogs && view === 'dashboard' ? (
          <p className="text-center text-sm text-slate-500">
            SQLite’tan yükleniyor…
          </p>
        ) : null}

        {view === 'generate' ? (
          <GenerateForm
            onGenerated={handleGenerated}
            onError={(msg) => setApiError(msg)}
            reviseSeed={reviseSeed}
            onReviseSeedConsumed={() => setReviseSeed(null)}
          />
        ) : (
          <Dashboard
            drafts={drafts}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            onCreateNew={() => {
              setReviseSeed(null)
              setView('generate')
            }}
            onRevise={(seed) => {
              setReviseSeed(seed)
              setView('generate')
            }}
          />
        )}
      </main>

      <footer className="relative z-10 py-5 text-center text-xs text-slate-400">
        Powered by MATRIKS
      </footer>
    </div>
  )
}
