export type Product =
  | 'Qodi'
  | 'Matriks MCP'
  | 'Quantex'
  | 'MatriksIQ'
  | 'Matriks Mobile'

export type Audience =
  | 'Retail Investor'
  | 'Corporate'
  | 'SPK Compliant Academic'

export type ChecklistStatus = 'pass' | 'fail' | 'warn'

export interface ChecklistItem {
  id: number
  text: string
  status: ChecklistStatus
  detail?: string
}

export interface QualityReport {
  score: number
  maxScore: number
  percent: number
  verdict: 'ready' | 'needs_revision' | 'reject'
  wordCount: number
  dimensions: Array<{
    area: string
    label: string
    score: number
    max: number
  }>
  checklist: ChecklistItem[]
  checklistSummary: { pass: number; fail: number; warn: number; total: number }
}

export interface PipelineAttempt {
  revision: number
  percent: number
  verdict: string
  score?: number
  maxScore?: number
  checklistSummary?: { pass: number; fail: number; warn: number; total: number }
  findings?: Array<{ code: string; severity: string; message: string }>
  revisionHints?: string[]
}

export interface PipelineMeta {
  source: 'real-pipeline' | 'mock'
  revisions: number
  maxRevisions: number
  scoreThreshold: number
  percent?: number
  verdict?: string
  blogPath?: string
  reviewPath?: string
  attempts: PipelineAttempt[]
  startedAt?: string
  finishedAt?: string
}

export interface BlogDraft {
  id: string
  title: string
  product: Product
  scope: string
  audience: Audience
  contentMarkdown: string
  quality: QualityReport
  createdAt: string
  /** İnsan onayı — otomatik kalite skorundan ayrı */
  status: 'draft' | 'approved' | 'rejected'
  feedbackNote?: string
  pipeline?: PipelineMeta
}

export interface GenerateFormInput {
  product: Product
  scope: string
  audience: Audience
  feedbackNote?: string
}

export type AppView = 'generate' | 'dashboard' | 'queue'

export interface QueueItem {
  id: string
  product: Product
  scope: string
  audience: Audience
  status: 'pending' | 'running' | 'done' | 'failed'
  blogId?: string | null
  error?: string | null
  createdAt: string
  updatedAt: string
}
