import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Audience, Product, QueueItem } from '../types'
import {
  apiAddQueueItem,
  apiDeleteQueueItem,
  apiListQueue,
  apiRetryQueueItem,
  apiRunNextQueue,
} from '../lib/api'

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

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  pending: 'Bekliyor',
  running: 'Üretiliyor',
  done: 'Draft hazır',
  failed: 'Hata',
}

interface Props {
  onError?: (message: string) => void
  onDraftCreated?: () => void
}

export function QueueScreen({ onError, onDraftCreated }: Props) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [product, setProduct] = useState<Product>('Qodi')
  const [audience, setAudience] = useState<Audience>('Corporate')
  const [scope, setScope] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiListQueue()
      setItems(list)
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : 'Kuyruk yüklenemedi',
      )
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!scope.trim() || busy) return
    setBusy(true)
    onError?.('')
    try {
      await apiAddQueueItem({ product, scope: scope.trim(), audience })
      setScope('')
      await refresh()
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setBusy(false)
    }
  }

  async function handleRunNext() {
    if (busy) return
    setBusy(true)
    onError?.('')
    try {
      const result = await apiRunNextQueue()
      if (!result.ran) {
        onError?.(result.message || 'Kuyrukta bekleyen konu yok')
      } else if (!result.ok) {
        onError?.(result.error || 'Üretim başarısız')
      } else {
        onDraftCreated?.()
      }
      await refresh()
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Çalıştırılamadı')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiDeleteQueueItem(id)
      await refresh()
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  async function handleRetry(id: string) {
    try {
      await apiRetryQueueItem(id)
      await refresh()
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Yeniden kuyruğa alınamadı')
    }
  }

  const pendingCount = items.filter((i) => i.status === 'pending').length

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Konu kuyruğu</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Cron veya “Şimdi 1 üret” sıradaki konuyu aynı MCP + Gemini
            pipeline’ına verir; sonuç Dashboard’da draft olarak bekler.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || pendingCount === 0}
          onClick={() => void handleRunNext()}
          className="rounded-xl bg-[#00D07B] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#00B86D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Çalışıyor…' : `Şimdi 1 üret (${pendingCount})`}
        </button>
      </div>

      <form
        onSubmit={handleAdd}
        className="mb-6 space-y-3 rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_12px_40px_rgba(40,70,140,0.08)] sm:p-6"
      >
        <p className="text-sm font-semibold text-slate-700">Kuyruğa konu ekle</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value as Product)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6D5EFC]"
          >
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6D5EFC]"
          >
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={3}
          required
          placeholder="Blog konusu / kapsam…"
          className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#6D5EFC]"
        />
        <button
          type="submit"
          disabled={busy || !scope.trim()}
          className="rounded-xl bg-[#3B82F6] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          Kuyruğa ekle
        </button>
      </form>

      {loading ? (
        <p className="text-center text-sm text-slate-500">Yükleniyor…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
          Kuyruk boş. Konu ekle veya sunucu yeniden başlayınca örnek konular
          seed edilir.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {item.product}{' '}
                    <span className="font-medium text-slate-400">
                      · {item.audience}
                    </span>
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {item.scope}
                  </p>
                  {item.error ? (
                    <p className="mt-2 text-xs text-rose-600">{item.error}</p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    item.status === 'pending'
                      ? 'bg-amber-50 text-amber-800'
                      : item.status === 'running'
                        ? 'bg-sky-50 text-sky-800'
                        : item.status === 'done'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-rose-50 text-rose-800'
                  }`}
                >
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.status === 'failed' || item.status === 'done' ? (
                  <button
                    type="button"
                    onClick={() => void handleRetry(item.id)}
                    className="text-xs font-semibold text-[#3B5BDB] hover:underline"
                  >
                    Yeniden kuyruğa al
                  </button>
                ) : null}
                {item.status !== 'running' ? (
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    className="text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Sil
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
