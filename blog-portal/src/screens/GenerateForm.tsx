import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Audience, BlogDraft, GenerateFormInput, Product } from '../types'
import { PROMPT_TEMPLATES } from '../lib/mockGenerator'
import { apiRunPipeline, apiSaveBlog } from '../lib/api'
import { buildLowScoreDemoDraft } from '../lib/demoLowScore'

const PRODUCTS: Product[] = [
  'Qodi',
  'Matriks MCP',
  'Quantex',
  'MatriksIQ',
  'Matriks Mobile',
]

const AUDIENCES: Audience[] = [
  'Retail Investor',
  'Corporate',
  'SPK Compliant Academic',
]

type ButtonPhase = 'idle' | 'busy' | 'done'

interface Props {
  onGenerated: (draft: BlogDraft) => void | Promise<void>
  onError?: (message: string) => void
  reviseSeed?: GenerateFormInput | null
  onReviseSeedConsumed?: () => void
}

export function GenerateForm({
  onGenerated,
  onError,
  reviseSeed,
  onReviseSeedConsumed,
}: Props) {
  const [product, setProduct] = useState<Product>('Qodi')
  const [scope, setScope] = useState(PROMPT_TEMPLATES.Qodi)
  const [audience, setAudience] = useState<Audience>('Corporate')
  const [feedbackNote, setFeedbackNote] = useState('')
  const [phase, setPhase] = useState<ButtonPhase>('idle')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!reviseSeed) return
    setProduct(reviseSeed.product)
    setScope(reviseSeed.scope)
    setAudience(reviseSeed.audience)
    setFeedbackNote(reviseSeed.feedbackNote || '')
    setPhase('idle')
    setStatus('')
    onReviseSeedConsumed?.()
  }, [reviseSeed, onReviseSeedConsumed])

  const templateHint = useMemo(() => PROMPT_TEMPLATES[product], [product])
  const busy = phase === 'busy'

  function applyTemplate() {
    setScope(templateHint)
  }

  async function handleDemoLowScore() {
    if (phase !== 'idle') return
    onError?.('')
    try {
      const draft = buildLowScoreDemoDraft()
      const saved = await apiSaveBlog(draft)
      setStatus('Demo düşük skor taslağı eklendi (skor ~30).')
      await onGenerated(saved)
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : 'Demo taslak eklenemedi',
      )
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!scope.trim() || phase !== 'idle') return
    setPhase('busy')
    setStatus('Blog üretiliyor…')
    onError?.('')

    try {
      const { blog, elapsedMs } = await apiRunPipeline({
        product,
        scope,
        audience,
        feedbackNote,
      })
      const secs = Math.max(1, Math.round(elapsedMs / 1000))
      setPhase('done')
      setStatus(`Üretildi · ${secs} sn · skor %${blog.quality.percent}`)
      // Kısa “Üretildi” gösterimi, sonra Dashboard
      await new Promise((r) => setTimeout(r, 900))
      await onGenerated(blog)
      setPhase('idle')
      setStatus('')
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Blog üretilemedi'
      setPhase('idle')
      setStatus('')
      onError?.(msg)
    }
  }

  const buttonLabel =
    phase === 'busy'
      ? 'Blog üretiliyor…'
      : phase === 'done'
        ? 'Üretildi'
        : 'Blog üret'

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Blog taslağı üret</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ürün bilgisi ve konuyla blog taslağı oluşturur; kalite kontrolünden
          geçirir.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-[24px] border border-white/80 bg-white/90 p-6 shadow-[0_12px_40px_rgba(40,70,140,0.08)] backdrop-blur sm:p-8"
      >
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            Ürün
          </label>
          <select
            value={product}
            onChange={(e) => {
              const next = e.target.value as Product
              setProduct(next)
              setScope(PROMPT_TEMPLATES[next])
            }}
            disabled={busy || phase === 'done'}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
          >
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="block text-sm font-semibold text-slate-700">
              Kapsam & konu
            </label>
            <button
              type="button"
              onClick={applyTemplate}
              disabled={busy || phase === 'done'}
              className="text-xs font-semibold text-[#3B5BDB] hover:underline"
            >
              Örnek prompt şablonunu uygula
            </button>
          </div>
          <textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            rows={5}
            required
            disabled={busy || phase === 'done'}
            placeholder="Hangi özellik / senaryo anlatılacak?"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            Hedef kitle & ton
          </label>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
            disabled={busy || phase === 'done'}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
          >
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            Revizyon notu{' '}
            <span className="font-normal text-slate-400">(opsiyonel)</span>
          </label>
          <textarea
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            rows={3}
            disabled={busy || phase === 'done'}
            placeholder="Örn: KVKK bölümünü güçlendir, kelime sayısını artır…"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
          />
        </div>

        {status ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className={busy ? 'font-medium animate-pulse' : 'font-medium'}>
              {status}
            </p>
            {busy ? (
              <p className="mt-1 text-xs text-slate-500">
                Bu işlem 30–90 sn sürebilir.
              </p>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={phase !== 'idle' || !scope.trim()}
          className={`w-full rounded-xl px-4 py-3.5 text-sm font-bold text-white shadow-sm transition sm:w-auto sm:min-w-[280px] disabled:cursor-not-allowed ${
            phase === 'done'
              ? 'bg-emerald-600'
              : 'bg-[#00D07B] hover:bg-[#00B86D] disabled:opacity-60'
          }`}
        >
          {buttonLabel}
        </button>

        <button
          type="button"
          onClick={() => void handleDemoLowScore()}
          disabled={phase !== 'idle'}
          className="ml-0 block text-xs font-semibold text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline sm:ml-3 sm:inline"
        >
          Demo: düşük skor örneği ekle (~30)
        </button>
      </form>
    </div>
  )
}
