import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type {
  BlogDraft,
  ChecklistItem,
  ChecklistStatus,
  GenerateFormInput,
} from '../types'
import { ScoreBadge } from '../components/StatusBadge'
import {
  downloadPdf,
  downloadText,
  markdownToSimpleHtml,
  slugifyFilename,
} from '../lib/download'

interface Props {
  drafts: BlogDraft[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onCreateNew: () => void
  onRevise: (seed: GenerateFormInput) => void
}

type FilterTab = 'all' | 'issues' | 'pass'

function statusLabel(status: ChecklistStatus) {
  if (status === 'pass') return 'Uygun'
  if (status === 'warn') return 'Dikkat'
  return 'Eksik'
}

function statusTone(status: ChecklistStatus) {
  if (status === 'pass')
    return {
      bar: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700',
      row: 'border-slate-100 bg-white',
    }
  if (status === 'warn')
    return {
      bar: 'bg-amber-400',
      badge: 'bg-amber-50 text-amber-800',
      row: 'border-amber-100 bg-amber-50/40',
    }
  return {
    bar: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700',
    row: 'border-rose-100 bg-rose-50/40',
  }
}

export function Dashboard({
  drafts,
  selectedId,
  onSelect,
  onDelete,
  onCreateNew,
  onRevise,
}: Props) {
  const selected =
    drafts.find((d) => d.id === selectedId) ?? drafts[0] ?? null
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [picked, setPicked] = useState<number[]>([])
  const [freeNote, setFreeNote] = useState('')

  const checklist = selected?.quality.checklist ?? []
  const summary = selected?.quality.checklistSummary ?? {
    pass: 0,
    warn: 0,
    fail: 0,
    total: 0,
  }

  useEffect(() => {
    setPicked([])
    setFreeNote('')
    setFilter('all')
  }, [selected?.id])

  const visibleItems = useMemo(() => {
    if (filter === 'issues')
      return checklist.filter((c) => c.status !== 'pass')
    if (filter === 'pass') return checklist.filter((c) => c.status === 'pass')
    return [...checklist].sort((a, b) => {
      const rank = (s: ChecklistStatus) =>
        s === 'fail' ? 0 : s === 'warn' ? 1 : 2
      return rank(a.status) - rank(b.status)
    })
  }, [filter, checklist])

  if (!selected) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
        <h2 className="text-xl font-bold text-slate-800">Henüz taslak yok</h2>
        <p className="mt-2 text-sm text-slate-500">
          Formdan ilk blog taslağını üretin.
        </p>
        <button
          type="button"
          onClick={onCreateNew}
          className="mt-6 rounded-xl bg-[#00D07B] px-5 py-3 text-sm font-bold text-white hover:bg-[#00B86D]"
        >
          Blog üretmeye git
        </button>
      </div>
    )
  }

  const q = selected.quality
  const base = slugifyFilename(selected.title)
  const total = summary.total || checklist.length || 1
  const passPct = Math.round((summary.pass / total) * 100)

  function handleDownload(format: 'md' | 'txt' | 'html' | 'pdf') {
    if (format === 'pdf') {
      downloadPdf(selected.title, selected.contentMarkdown)
      return
    }
    if (format === 'md') {
      downloadText(
        `${base}.md`,
        selected.contentMarkdown,
        'text/markdown;charset=utf-8',
      )
      return
    }
    if (format === 'txt') {
      downloadText(`${base}.txt`, selected.contentMarkdown)
      return
    }
    downloadText(
      `${base}.html`,
      markdownToSimpleHtml(selected.title, selected.contentMarkdown),
      'text/html;charset=utf-8',
    )
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(selected.contentMarkdown)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  function togglePick(item: ChecklistItem) {
    if (item.status === 'pass') return
    setPicked((prev) =>
      prev.includes(item.id)
        ? prev.filter((id) => id !== item.id)
        : [...prev, item.id],
    )
  }

  function startRevise(ids?: number[], draft?: BlogDraft) {
    const target = draft ?? selected
    if (!target) return
    const useIds = ids?.length
      ? ids
      : picked.length
        ? picked
        : []
    const fromChecks = useIds.length ? buildReviseNote(useIds, target) : ''
    const manual = freeNote.trim()
    const feedbackNote =
      [fromChecks, manual].filter(Boolean).join('\n\n') ||
      target.feedbackNote ||
      ''

    onRevise({
      product: target.product,
      scope: target.scope,
      audience: target.audience,
      feedbackNote,
    })
    setPicked([])
  }

  function buildReviseNote(ids: number[], draft: BlogDraft) {
    const lines = (draft.quality.checklist || [])
      .filter((c) => ids.includes(c.id))
      .map((c) => `- ${c.text}${c.detail ? ` (${c.detail})` : ''}`)
    if (!lines.length) return ''
    return `Lütfen şu maddeleri düzelt:\n${lines.join('\n')}`
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_12px_40px_rgba(40,70,140,0.08)] backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Geçmiş taslaklar</h3>
          <button
            type="button"
            onClick={onCreateNew}
            className="text-xs font-semibold text-[#3B5BDB] hover:underline"
          >
            + Yeni
          </button>
        </div>
        <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {drafts.map((d) => {
            const active = d.id === selected.id
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onSelect(d.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? 'border-[#6D5EFC]/40 bg-[#F5F4FF]'
                      : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <p className="line-clamp-2 text-xs font-semibold text-slate-800">
                    {d.title}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ScoreBadge percent={d.quality.percent} />
                    <span className="text-[10px] text-slate-400">
                      {new Date(d.createdAt).toLocaleString('tr-TR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <div className="space-y-5">
        <div className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(40,70,140,0.08)] backdrop-blur sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#5B4ED6]">
                Kalite özeti
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-800">
                {selected.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selected.product} · {selected.audience}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ScoreBadge percent={q.percent} />
              <button
                type="button"
                onClick={() => startRevise()}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                Revize et
              </button>
              <button
                type="button"
                onClick={() => onDelete(selected.id)}
                className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                Sil
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {q.dimensions.map((dim) => (
              <div
                key={dim.area}
                className="rounded-xl bg-slate-50 px-3 py-3 ring-1 ring-slate-100"
              >
                <p className="text-[11px] font-medium text-slate-500">
                  {dim.label}
                </p>
                <p className="mt-1 text-lg font-bold text-slate-800">
                  {dim.score}
                  <span className="text-sm font-medium text-slate-400">
                    /{dim.max}
                  </span>
                </p>
              </div>
            ))}
          </div>

          {selected.pipeline?.attempts?.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {selected.pipeline.attempts.map((a) => (
                <span
                  key={a.revision}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                >
                  Tur {a.revision + 1}: %{a.percent}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(40,70,140,0.08)] backdrop-blur sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-800">
                Üretilen blog
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {copied ? 'Kopyalandı' : 'Kopyala'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('md')}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  İndir .md
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('txt')}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  .txt
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('html')}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  .html
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('pdf')}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  .pdf
                </button>
              </div>
            </div>
            <div className="prose-blog max-h-[60vh] overflow-y-auto pr-1">
              <ReactMarkdown>{selected.contentMarkdown}</ReactMarkdown>
            </div>
          </section>

          <section className="flex flex-col rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(40,70,140,0.08)] backdrop-blur sm:p-6">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Kalite kontrol
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  İstek yazabilir veya uyarı seçebilirsiniz.
                </p>
              </div>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                %{q.percent}
              </span>
            </div>

            <div className="mb-4">
              <div className="mb-1.5 flex justify-between text-[11px] text-slate-500">
                <span>{summary.pass} uygun</span>
                <span>
                  {summary.warn} dikkat · {summary.fail} eksik
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${passPct}%` }}
                />
                <div
                  className="bg-amber-400 transition-all"
                  style={{
                    width: `${Math.round((summary.warn / total) * 100)}%`,
                  }}
                />
                <div
                  className="bg-rose-500 transition-all"
                  style={{
                    width: `${Math.round((summary.fail / total) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1">
              {(
                [
                  ['all', `Tümü (${checklist.length})`],
                  ['issues', `Sorunlar (${summary.warn + summary.fail})`],
                  ['pass', `Uygun (${summary.pass})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                    filter === key
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <ul className="max-h-[36vh] flex-1 space-y-2 overflow-y-auto pr-1">
              {visibleItems.length === 0 ? (
                <li className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                  {filter === 'issues'
                    ? 'Otomatik sorun yok — yine de aşağıya isteğinizi yazabilirsiniz.'
                    : 'Bu filtrede madde yok.'}
                </li>
              ) : (
                visibleItems.map((item) => {
                  const tone = statusTone(item.status)
                  const isPickable = item.status !== 'pass'
                  const isPicked = picked.includes(item.id)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={!isPickable}
                        onClick={() => togglePick(item)}
                        className={`flex w-full items-stretch gap-0 overflow-hidden rounded-xl border text-left transition ${tone.row} ${
                          isPickable
                            ? 'cursor-pointer hover:ring-1 hover:ring-indigo-200'
                            : 'cursor-default'
                        } ${isPicked ? 'ring-2 ring-indigo-400' : ''}`}
                      >
                        <span className={`w-1 shrink-0 ${tone.bar}`} />
                        <div className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5">
                          {isPickable ? (
                            <span
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                                isPicked
                                  ? 'border-indigo-500 bg-indigo-500 text-white'
                                  : 'border-slate-300 bg-white text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                          ) : (
                            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-emerald-100 ring-2 ring-emerald-400/40" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-slate-700">
                                {item.text}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}
                              >
                                {statusLabel(item.status)}
                              </span>
                            </div>
                            {item.detail ? (
                              <p className="mt-0.5 text-xs text-slate-400">
                                {item.detail}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>

            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Revizyon isteği
                </label>
                <textarea
                  value={freeNote}
                  onChange={(e) => setFreeNote(e.target.value)}
                  rows={3}
                  placeholder="Örn: Girişi kısalt, KVKK’yı güçlendir, daha kurumsal ton…"
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    startRevise(picked.length ? picked : undefined)
                  }
                  disabled={!freeNote.trim() && picked.length === 0}
                  className="rounded-xl bg-[#3B82F6] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {picked.length
                    ? `Seçim + istek ile revize et`
                    : freeNote.trim()
                      ? 'İstek ile revize et'
                      : 'Not yazın veya uyarı seçin'}
                </button>
                {picked.length ? (
                  <button
                    type="button"
                    onClick={() => setPicked([])}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Seçimi temizle
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
