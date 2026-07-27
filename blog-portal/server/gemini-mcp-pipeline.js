/**
 * Gemini + MCP tool yolu:
 * getQodiInfo (MD) → Gemini blog yazar → writeBlog / checkBlog → skor < 80 ise max 3 tur
 * Claude Desktop MCP bozulmaz; aynı tool sözleşmesi (blog.js / MD).
 */
import fs from 'node:fs'
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

const SCORE_THRESHOLD = 80
const MAX_REVISIONS = 3

/** blog-portal/.env dosyasını process.env'e yükle */
export function loadPortalEnv() {
  const envPath = path.join(PORTAL_ROOT, '.env')
  try {
    const text = fs.readFileSync(envPath, 'utf8')
    for (const line of text.split(/\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env) || key.startsWith('GEMINI_')) {
        process.env[key] = val
      }
    }
  } catch {
    /* .env yoksa sessiz */
  }
}

export function hasGeminiKey() {
  loadPortalEnv()
  const k = process.env.GEMINI_API_KEY?.trim() || ''
  if (k.length < 20) return false
  if (/buraya|your_|xxx|paste/i.test(k)) return false
  return true
}

async function loadToolRuntime() {
  const href = pathToFileURL(
    path.join(QODI_ROOT, 'src/autonomous/services/tool-runtime.ts'),
  ).href
  // tsx olmadan .js yolu — blog portal node ile çalışıyor; runtime ts
  // Doğrudan blog + md okuma: tool-runtime.ts için parent'tan dinamik
  // En güvenlisi: getQodiInfo mantığını blog.js + fs ile çağırmak
  const blogHref = pathToFileURL(path.join(QODI_ROOT, 'src/blog.js')).href
  const blog = await import(blogHref)
  return { blog }
}

async function getQodiInfo(topic) {
  const mdPath = path.join(QODI_ROOT, 'data', 'qodi-bilgi-dosyasi-v2.md')
  const md = await fs.promises.readFile(mdPath, 'utf8')
  const lines = md.split(/\r?\n/)
  const re = /<!--\s*topic:\s*([a-z0-9_]+)\s*-->/i
  const markers = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re)
    if (m) markers.push({ topic: m[1], line: i })
  }
  const idx = markers.findIndex((x) => x.topic === topic)
  if (idx < 0) throw new Error(`MCP getQodiInfo: topic yok → ${topic}`)
  const start = markers[idx].line + 1
  let end = idx + 1 < markers.length ? markers[idx + 1].line : lines.length
  return lines.slice(start, end).join('\n').trim()
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error('GEMINI_API_KEY yok')

  // Ücretsiz / güncel isimler — sırayla dene
  const preferred = process.env.GEMINI_MODEL?.trim()
  const candidates = [
    preferred,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
  ].filter(Boolean)
  // unique
  const models = [...new Set(candidates)]

  let lastErr = ''
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 8192,
        },
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
        ''
      if (!text.trim()) {
        lastErr = `${model}: boş yanıt`
        continue
      }
      console.log('[gemini-mcp] model OK →', model)
      return text.trim()
    }

    const msg = data?.error?.message || `Gemini HTTP ${res.status}`
    lastErr = `${model}: ${msg}`
    console.warn('[gemini-mcp]', lastErr)

    if (/leaked|reported as leaked/i.test(msg)) {
      throw new Error(
        'Gemini API key sızdırılmış (leaked) olarak işaretlenmiş. ' +
          'AI Studio’da ESKİ key’i silip YENİ key oluşturun → blog-portal/.env içine yazın → npm run dev yeniden. ' +
          'https://aistudio.google.com/apikey',
      )
    }
    // model not found → sonraki adaya geç
    if (/not found|not supported/i.test(msg)) continue
    if (/quota|rate limit|exceeded/i.test(msg)) {
      throw new Error(
        `Gemini kotası doldu. 1–2 dk bekleyin veya yeni key/billing. (${msg})`,
      )
    }
  }

  throw new Error(
    `Gemini model bulunamadı / yanıt yok. Son hata: ${lastErr}. ` +
      `.env içinde GEMINI_MODEL=gemini-2.5-flash deneyin veya yeni API key alın.`,
  )
}

function extractMarkdown(raw) {
  let t = raw.trim()
  const fence = t.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  return t
}

function buildPrompt({ product, scope, audience, feedbackNote, topicBundle, revisionHints }) {
  const hints = revisionHints?.length
    ? `\n\nÖNCEKİ EDİTÖR UYARILARI (düzelt):\n- ${revisionHints.join('\n- ')}`
    : ''

  return `Sen Matriks içerik editörüsün. Aşağıdaki MCP bilgi kaynağına (getQodiInfo çıktısı) dayanarak Türkçe bir blog yazısı yaz.

KURALLAR:
- Sadece verilen kaynaktaki bilgilere dayan; uydurma.
- Yatırım tavsiyesi verme; "yatırım tavsiyesi değildir" yasal uyarısı olsun.
- Abartılı getiri / garantili kazanç dili kullanma.
- Qodi ≠ Quantex ≠ Matriks MCP konumlandırmasını karıştırma.
- KVKK / yerel işleme vurgusu yap.
- En az 3 adet ## alt başlık kullan.
- ## Sonuç ve ## Yasal uyarı bölümleri olsun.
- Hedef kelime: 800–1800.
- Çıktı SADECE markdown olsun (başka açıklama yok). İlk satır # başlık.

Ürün: ${product}
Hedef kitle / ton: ${audience}
Kapsam: ${scope}
${feedbackNote ? `Kullanıcı revizyon notu: ${feedbackNote}` : ''}
${hints}

--- MCP KAYNAK (getQodiInfo) ---
${topicBundle}
`
}

async function buildQuality(blog, title, content, keywords) {
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
 * Gemini LLM + MCP getQodiInfo/writeBlog/checkBlog
 */
export async function runGeminiMcpPipelineAndSave(input) {
  loadPortalEnv()
  if (!hasGeminiKey()) {
    throw new Error(
      'GEMINI_API_KEY bulunamadı. blog-portal/.env dosyasına ekleyin.',
    )
  }

  const product = input.product || 'Qodi'
  const scope = String(input.scope || '').trim()
  const audience = input.audience || 'Corporate'
  const feedbackNote = input.feedbackNote || ''
  const topics = PRODUCT_TOPICS[product] || PRODUCT_TOPICS.Qodi
  const keywords = [
    product,
    'Matriks',
    'KVKK',
    'finansal asistan',
    audience === 'Retail Investor' ? 'yatırımcı' : 'kurumsal',
  ]

  console.log('[gemini-mcp] getQodiInfo topic’leri çekiliyor…', topics.join(', '))
  const chunks = []
  for (const topic of topics) {
    const text = await getQodiInfo(topic)
    chunks.push(`### topic: ${topic}\n${text}`)
  }
  const topicBundle = chunks.join('\n\n')

  const { blog } = await loadToolRuntime()
  const postsDir = path.join(QODI_ROOT, 'data', 'posts')
  await fs.promises.mkdir(postsDir, { recursive: true })

  const attempts = []
  let content = ''
  let title = `${product}: ${scope.slice(0, 50)}`
  let quality = null
  let postId = null
  let revisionHints = []

  const startedAt = new Date().toISOString()

  for (let revision = 0; revision <= MAX_REVISIONS; revision++) {
    console.log(`[gemini-mcp] LLM tur ${revision + 1}…`)
    const prompt = buildPrompt({
      product,
      scope,
      audience,
      feedbackNote,
      topicBundle,
      revisionHints,
    })
    const raw = await callGemini(prompt)
    content = extractMarkdown(raw)
    title =
      content.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
      title

    const written = await blog.writeBlog(postsDir, {
      title,
      content,
      keywords,
      category: 'Finansal',
      sourceTopics: topics,
    })
    postId = written.record?.id || written.postId
    content = written.record?.content || content

    quality = await buildQuality(blog, title, content, keywords)
    attempts.push({
      revision,
      percent: quality.percent,
      verdict: quality.verdict,
      revisionHints: quality.checklist
        .filter((c) => c.status !== 'pass')
        .map((c) => c.text)
        .slice(0, 6),
    })

    console.log(
      `[gemini-mcp] tur ${revision + 1} skor %${quality.percent} (${quality.verdict})`,
    )

    if (quality.percent >= SCORE_THRESHOLD) break
    if (revision === MAX_REVISIONS) break

    revisionHints = attempts[attempts.length - 1].revisionHints
    if (feedbackNote) revisionHints.push(feedbackNote)
  }

  const draft = {
    id: postId || `gemini-${Date.now()}`,
    title,
    product,
    scope,
    audience,
    contentMarkdown: content,
    quality,
    status: 'draft',
    createdAt: new Date().toISOString(),
    feedbackNote: feedbackNote || undefined,
    pipeline: {
      source: 'gemini-mcp',
      revisions: Math.max(0, attempts.length - 1),
      maxRevisions: MAX_REVISIONS,
      scoreThreshold: SCORE_THRESHOLD,
      percent: quality.percent,
      verdict: quality.verdict,
      blogPath: postId
        ? path.join(postsDir, `${postId}.json`)
        : undefined,
      attempts,
      startedAt,
      finishedAt: new Date().toISOString(),
      llm: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
  }

  await upsertBlog(draft)
  console.log('[gemini-mcp] DB’ye kaydedildi', draft.id)
  return draft
}
