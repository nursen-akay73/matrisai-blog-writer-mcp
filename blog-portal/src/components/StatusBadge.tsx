import type { BlogDraft } from '../types'

export function VerdictBadge({ verdict }: { verdict: BlogDraft['quality']['verdict'] }) {
  const map = {
    ready: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    needs_revision: 'bg-amber-50 text-amber-700 ring-amber-200',
    reject: 'bg-rose-50 text-rose-700 ring-rose-200',
  } as const

  const label = {
    ready: 'Ready',
    needs_revision: 'Needs revision',
    reject: 'Reject',
  } as const

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${map[verdict]}`}
    >
      {label[verdict]}
    </span>
  )
}

export function ApprovalBadge({ status }: { status: BlogDraft['status'] }) {
  const map = {
    draft: 'bg-slate-100 text-slate-600 ring-slate-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  } as const

  const label = {
    draft: 'Taslak',
    approved: 'Onaylandı',
    rejected: 'Reddedildi',
  } as const

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${map[status]}`}
    >
      {label[status]}
    </span>
  )
}

export function ScoreBadge({ percent }: { percent: number }) {
  const tone =
    percent >= 80
      ? 'bg-[#E8FFF5] text-[#067647] ring-[#A6F4C5]'
      : percent >= 50
        ? 'bg-amber-50 text-amber-800 ring-amber-200'
        : 'bg-rose-50 text-rose-700 ring-rose-200'

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tone}`}
    >
      {percent}/100
    </span>
  )
}
