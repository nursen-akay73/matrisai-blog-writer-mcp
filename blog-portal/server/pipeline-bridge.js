import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { upsertBlog } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORTAL_ROOT = path.resolve(__dirname, '..')
const QODI_ROOT = path.resolve(PORTAL_ROOT, '..')

const PRODUCT_TOPICS = {
  Qodi: ['genel_tanim', 'farklar', 'entegrasyon_genel', 'guvenlik'],
  'Matriks MCP': [
    'entegrasyon_genel',
    'api_key_olusturma',
    'mcp_kurulum_cursor',
    'guvenlik',
  ],
  Quantex: ['quantex_genel', 'quantex_moduller', 'quantex_neden', 'guvenlik'],
  MatriksIQ: ['genel_tanim', 'ozellikler', 'farklar', 'guvenlik'],
  'Matriks Mobile': ['genel_tanim', 'ozellikler', 'kullanim_senaryolari', 'guvenlik'],
}

function buildPayload(input) {
  const product = input.product || 'Qodi'
  const scope = String(input.scope || '').trim()
  const audience = input.audience || 'Corporate'
  const keywords = [
    product,
    'Matriks',
    'KVKK',
    'finansal asistan',
    audience === 'Retail Investor' ? 'yatırımcı' : 'kurumsal',
  ]

  return {
    force: true,
    source: 'blog-portal-ui',
    titleHint: `${product}: ${scope.slice(0, 60) || 'ürün yetenekleri'}`,
    category: 'Finansal',
    keywords,
    sourceTopics: PRODUCT_TOPICS[product] || PRODUCT_TOPICS.Qodi,
    metadata: {
      product,
      scope,
      audience,
      feedbackNote: input.feedbackNote || '',
    },
  }
}

function runPipelineProcess(payload) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, 'run-pipeline-once.mjs')
    const args = ['--import', 'tsx', script, JSON.stringify(payload)]
    const child = spawn(process.execPath, args, {
      cwd: QODI_ROOT,
      env: { ...process.env, QODI_MCP_ROOT: QODI_ROOT },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      const jsonLine = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .at(-1)
      try {
        const result = JSON.parse(jsonLine || '{}')
        if (code !== 0 && !result.ok) {
          reject(
            new Error(
              result.error ||
                `Pipeline çıkış kodu ${code}. ${stderr.slice(-500)}`,
            ),
          )
          return
        }
        resolve({ result, stderr })
      } catch {
        reject(
          new Error(
            `Pipeline JSON parse hatası (code=${code}): ${stdout.slice(0, 300)} | ${stderr.slice(-400)}`,
          ),
        )
      }
    })
  })
}

async function loadRevisionAttempts(postsDir, day) {
  const attempts = []
  for (let r = 0; r < 5; r++) {
    const p = path.join(postsDir, `${day}-editor-feedback-r${r}.json`)
    try {
      const raw = await fs.readFile(p, 'utf8')
      const report = JSON.parse(raw)
      attempts.push({
        revision: r,
        percent: report.percent,
        verdict: report.verdict,
        score: report.score,
        maxScore: report.maxScore,
        checklistSummary: report.checklistSummary,
        findings: report.findings?.slice(0, 8) || [],
        revisionHints: report.revisionHints?.slice(0, 6) || [],
      })
    } catch {
      break
    }
  }
  return attempts
}

function stripFrontmatter(md) {
  if (!md.startsWith('---')) return md
  const end = md.indexOf('\n---', 3)
  if (end === -1) return md
  return md.slice(end + 4).trim()
}

async function buildQualityFromContent(content) {
  const blogUrl = pathToFileURL(path.join(QODI_ROOT, 'src/blog.js')).href
  const blog = await import(blogUrl)
  const title = content.match(/^#\s+(.+)$/m)?.[1] || 'Blog'
  const keywords = ['Qodi', 'Matriks', 'KVKK', 'finansal asistan', 'yerel AI']
  const quality = blog.checkBlogQuality({
    title,
    content,
    keywords,
    category: 'Finansal',
  })
  const checklist = blog.runMatriksChecklist({
    title,
    content,
    keywords,
    wordCount: quality.wordCount,
  })

  const dimLabels = {
    yapi_uzunluk: 'Yapı / uzunluk',
    yasal_uyumluluk: 'Yasal / SPK dili',
    marka_ton: 'Marka / ton',
    seo: 'SEO',
  }

  return {
    score: quality.score,
    maxScore: quality.maxScore,
    percent: quality.percent,
    verdict: quality.verdict,
    wordCount: quality.wordCount,
    dimensions: quality.dimensions.map((d) => ({
      area: d.area,
      label: dimLabels[d.area] || d.area,
      score: d.score,
      max: d.max,
    })),
    checklist: checklist.items,
    checklistSummary: checklist.summary,
  }
}

/**
 * UI form → gerçek Writer/Editor pipeline (MD topic'ler + self-correction)
 */
export async function runRealPipelineAndSave(input) {
  const payload = buildPayload(input)
  const { result, stderr } = await runPipelineProcess(payload)

  if (!result.ok || !result.blogPath) {
    throw new Error(result.error || 'Pipeline başarısız')
  }

  const rawMd = await fs.readFile(result.blogPath, 'utf8')
  const contentMarkdown = stripFrontmatter(rawMd)
  const title =
    contentMarkdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    payload.titleHint ||
    'Qodi Blog'

  const day = new Date().toISOString().slice(0, 10)
  const postsDir = path.join(QODI_ROOT, 'data', 'posts')
  const attempts = await loadRevisionAttempts(postsDir, day)
  const quality = await buildQualityFromContent(contentMarkdown)

  // Pipeline editor skorunu önceliklendir
  if (typeof result.percent === 'number') {
    quality.percent = result.percent
    quality.verdict =
      result.verdict === 'ready' ||
      result.verdict === 'needs_revision' ||
      result.verdict === 'reject'
        ? result.verdict
        : quality.verdict
  }

  const draft = {
    id: result.postId || `pipeline-${Date.now()}`,
    title,
    product: input.product || 'Qodi',
    scope: String(input.scope || '').trim(),
    audience: input.audience || 'Corporate',
    contentMarkdown,
    quality,
    status: 'draft',
    createdAt: new Date().toISOString(),
    feedbackNote: input.feedbackNote || undefined,
    pipeline: {
      source: 'real-pipeline',
      revisions: result.revisions ?? 0,
      maxRevisions: 3,
      scoreThreshold: 80,
      percent: result.percent,
      verdict: result.verdict,
      blogPath: result.blogPath,
      reviewPath: result.reviewPath,
      attempts,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      stderrTail: stderr.slice(-800),
    },
  }

  await upsertBlog(draft)
  return draft
}

export { QODI_ROOT }
