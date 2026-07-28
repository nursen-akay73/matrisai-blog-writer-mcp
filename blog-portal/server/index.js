/**
 * Hafif API — Express yok (Desktop/iCloud node_modules okuması ETIMEDOUT veriyordu).
 * Prod’da Vite `dist/` aynı porttan servis edilir (Render).
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasGeminiKey, loadPortalEnv } from './gemini-mcp-pipeline.js'

loadPortalEnv()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, '..', 'dist')
const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(DIST_DIR)
const PORT = Number(process.env.PORT || process.env.BLOG_API_PORT || 8789)
const HOST = process.env.HOST || (isProd ? '0.0.0.0' : '127.0.0.1')

console.log('[blog-api] başlıyor…')
console.log('[blog-api] Not: Desktop’ta ilk yükleme yavaş olabilir; port hemen açılır.')
console.log(
  hasGeminiKey()
    ? '[blog-api] Gemini API key bulundu → Blog üret = LLM + MCP'
    : '[blog-api] GEMINI_API_KEY yok → şablon pipeline (blog-portal/.env ekleyin)',
)

let ready = false
let pipelineBusy = false
/** @type {null | typeof import('./db.js')} */
let db = null
/** @type {null | typeof import('./pipeline-bridge.js')} */
let bridge = null

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

async function ensureDb() {
  if (db) return db
  console.log('[blog-api] veritabanı yükleniyor…')
  db = await import('./db.js')
  const info = await db.ensureDbReady()
  console.log(`[blog-api] DB hazır → ${info.driver} · ${info.target}`)
  ready = true
  return db
}

async function ensureBridge() {
  if (bridge) return bridge
  console.log('[blog-api] pipeline-bridge yükleniyor…')
  bridge = await import('./pipeline-bridge.js')
  console.log('[blog-api] pipeline-bridge hazır →', bridge.QODI_ROOT)
  return bridge
}

async function runPipelineOnce(input) {
  const useGemini = hasGeminiKey()
  if (useGemini) {
    const { runGeminiMcpPipelineAndSave } = await import(
      './gemini-mcp-pipeline.js'
    )
    return {
      blog: await runGeminiMcpPipelineAndSave(input),
      mode: 'gemini-mcp',
    }
  }
  const { runRealPipelineAndSave } = await ensureBridge()
  return {
    blog: await runRealPipelineAndSave(input),
    mode: 'template-pipeline',
  }
}

function cronAuthorized(req) {
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) {
    // Yerel/dev: secret yoksa açık (UI “Şimdi çalıştır” için)
    return !isProd
  }
  const header =
    req.headers['x-cron-secret'] ||
    (String(req.headers.authorization || '').startsWith('Bearer ')
      ? String(req.headers.authorization).slice(7)
      : '')
  return header === secret
}

async function runNextFromQueue(database) {
  if (pipelineBusy) {
    return { status: 409, body: { ok: false, error: 'Pipeline zaten çalışıyor' } }
  }
  const claimed = await database.claimNextPending()
  if (!claimed) {
    return {
      status: 200,
      body: { ok: true, ran: false, message: 'Kuyrukta pending konu yok' },
    }
  }

  pipelineBusy = true
  const started = Date.now()
  console.log(
    `[blog-api] queue → ${claimed.product}: ${claimed.scope.slice(0, 60)}…`,
  )
  try {
    const { blog, mode } = await runPipelineOnce({
      product: claimed.product,
      scope: claimed.scope,
      audience: claimed.audience,
    })
    await database.completeQueueItem(claimed.id, blog.id)
    console.log('[blog-api] queue OK', blog.id, Date.now() - started, 'ms')
    return {
      status: 201,
      body: {
        ok: true,
        ran: true,
        queueId: claimed.id,
        blog,
        elapsedMs: Date.now() - started,
        mode,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await database.failQueueItem(claimed.id, msg)
    console.error('[blog-api] queue FAIL', msg)
    return {
      status: 500,
      body: {
        ok: false,
        ran: true,
        queueId: claimed.id,
        error: msg,
        elapsedMs: Date.now() - started,
      },
    }
  } finally {
    pipelineBusy = false
  }
}

async function handle(req, res) {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const { pathname } = url
  const method = req.method || 'GET'

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    return res.end()
  }

  res.setHeader('Access-Control-Allow-Origin', '*')

  try {
    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'matriks-mcp-content-portal-api',
        ready,
        db: db?.dbPath ?? null,
        dbDriver: db?.dbDriver ?? null,
        auth: 'users-table',
        gemini: hasGeminiKey(),
        mcpLlm: hasGeminiKey() ? 'gemini+mcp' : 'template',
        qodiRoot: bridge?.QODI_ROOT ?? null,
        pipelineBusy,
      })
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJson(req)
      if (body === null) {
        return sendJson(res, 400, { ok: false, error: 'Geçersiz JSON' })
      }
      const database = await ensureDb()
      const email = String(body.email || '')
        .trim()
        .toLowerCase()
      const password = String(body.password || '')
      const user = await database.authenticateUser(email, password)
      if (!user) {
        return sendJson(res, 401, {
          ok: false,
          error: 'E-posta veya şifre hatalı',
        })
      }
      return sendJson(res, 200, {
        ok: true,
        token: `db-${user.id}`,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        authSource: 'database',
      })
    }

    if (method === 'POST' && pathname === '/api/auth/register') {
      const body = await readJson(req)
      if (body === null) {
        return sendJson(res, 400, { ok: false, error: 'Geçersiz JSON' })
      }
      const database = await ensureDb()
      const result = await database.registerUser({
        email: body.email,
        password: body.password,
        displayName: body.displayName,
      })
      if (!result.ok) {
        const status = /zaten kayıtlı/i.test(result.error || '') ? 409 : 400
        return sendJson(res, status, { ok: false, error: result.error })
      }
      return sendJson(res, 201, {
        ok: true,
        token: `db-${result.user.id}`,
        user: result.user,
        authSource: 'database',
      })
    }

    // Aşağıdaki route'lar sqlite ister
    const database = await ensureDb()

    if (method === 'GET' && pathname === '/api/blogs') {
      return sendJson(res, 200, { ok: true, blogs: await database.listBlogs() })
    }

    const blogMatch = pathname.match(/^\/api\/blogs\/([^/]+)$/)
    if (method === 'GET' && blogMatch) {
      const blog = await database.getBlog(decodeURIComponent(blogMatch[1]))
      if (!blog) return sendJson(res, 404, { ok: false, error: 'Bulunamadı' })
      return sendJson(res, 200, { ok: true, blog })
    }

    if (method === 'POST' && pathname === '/api/blogs') {
      const draft = await readJson(req)
      if (draft === null) {
        return sendJson(res, 400, { ok: false, error: 'Geçersiz JSON' })
      }
      if (
        !draft?.id ||
        !draft?.title ||
        !draft?.contentMarkdown ||
        !draft?.quality
      ) {
        return sendJson(res, 400, { ok: false, error: 'Eksik blog alanları' })
      }
      const saved = await database.upsertBlog(draft)
      return sendJson(res, 201, { ok: true, blog: saved })
    }

    if (method === 'DELETE' && blogMatch) {
      const removed = await database.deleteBlog(decodeURIComponent(blogMatch[1]))
      if (!removed) return sendJson(res, 404, { ok: false, error: 'Bulunamadı' })
      return sendJson(res, 200, { ok: true })
    }

    if (method === 'PATCH' && blogMatch) {
      const body = await readJson(req)
      if (body === null) {
        return sendJson(res, 400, { ok: false, error: 'Geçersiz JSON' })
      }
      const status = String(body.status || '')
      if (!['draft', 'approved', 'rejected'].includes(status)) {
        return sendJson(res, 400, {
          ok: false,
          error: 'status: draft | approved | rejected olmalı',
        })
      }
      const updated = await database.updateBlogStatus(
        decodeURIComponent(blogMatch[1]),
        status,
      )
      if (!updated) return sendJson(res, 404, { ok: false, error: 'Bulunamadı' })
      return sendJson(res, 200, { ok: true, blog: updated })
    }

    if (method === 'POST' && pathname === '/api/pipeline/generate') {
      if (pipelineBusy) {
        return sendJson(res, 409, {
          ok: false,
          error: 'Pipeline zaten çalışıyor — bitmesini bekleyin',
        })
      }

      const body = await readJson(req)
      if (body === null) {
        return sendJson(res, 400, { ok: false, error: 'Geçersiz JSON' })
      }
      const { product, scope, audience, feedbackNote } = body
      if (!scope || !String(scope).trim()) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Kapsam / konu zorunlu',
        })
      }

      pipelineBusy = true
      const started = Date.now()
      const useGemini = hasGeminiKey()
      console.log(
        useGemini
          ? '[blog-api] Gemini + MCP pipeline başladı…'
          : '[blog-api] şablon pipeline başladı…',
      )
      try {
        const { blog, mode } = await runPipelineOnce({
          product,
          scope,
          audience,
          feedbackNote,
        })
        console.log('[blog-api] pipeline OK', Date.now() - started, 'ms')
        return sendJson(res, 201, {
          ok: true,
          blog,
          elapsedMs: Date.now() - started,
          mode,
        })
      } catch (err) {
        console.error('[blog-api] pipeline FAIL', err)
        return sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          elapsedMs: Date.now() - started,
        })
      } finally {
        pipelineBusy = false
      }
    }

    if (method === 'GET' && pathname === '/api/queue') {
      return sendJson(res, 200, {
        ok: true,
        items: await database.listQueue(),
      })
    }

    if (method === 'POST' && pathname === '/api/queue') {
      const body = await readJson(req)
      if (body === null) {
        return sendJson(res, 400, { ok: false, error: 'Geçersiz JSON' })
      }
      try {
        const item = await database.addQueueItem({
          product: body.product,
          scope: body.scope,
          audience: body.audience,
        })
        return sendJson(res, 201, { ok: true, item })
      } catch (err) {
        return sendJson(res, 400, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const queueMatch = pathname.match(/^\/api\/queue\/([^/]+)$/)
    if (method === 'DELETE' && queueMatch) {
      const removed = await database.deleteQueueItem(
        decodeURIComponent(queueMatch[1]),
      )
      if (!removed) return sendJson(res, 404, { ok: false, error: 'Bulunamadı' })
      return sendJson(res, 200, { ok: true })
    }

    if (method === 'POST' && pathname === '/api/queue/run-next') {
      const result = await runNextFromQueue(database)
      return sendJson(res, result.status, result.body)
    }

    const queueRetry = pathname.match(/^\/api\/queue\/([^/]+)\/retry$/)
    if (method === 'POST' && queueRetry) {
      const ok = await database.resetQueueItemToPending(
        decodeURIComponent(queueRetry[1]),
      )
      if (!ok) {
        return sendJson(res, 404, {
          ok: false,
          error: 'Yeniden kuyruğa alınamadı',
        })
      }
      return sendJson(res, 200, { ok: true })
    }

    // Render Cron / harici zamanlayıcı — CRON_SECRET ile
    if (method === 'POST' && pathname === '/api/cron/run-next') {
      if (!cronAuthorized(req)) {
        return sendJson(res, 401, { ok: false, error: 'CRON_SECRET gerekli' })
      }
      const result = await runNextFromQueue(database)
      return sendJson(res, result.status, result.body)
    }

    return sendJson(res, 404, { ok: false, error: 'Not found' })
  } catch (err) {
    console.error('[blog-api] handler error', err)
    return sendJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0] || '/')
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  const full = path.join(root, cleaned)
  if (!full.startsWith(root)) return null
  return full
}

function serveStatic(req, res) {
  if (!fs.existsSync(DIST_DIR)) {
    return sendJson(res, 404, {
      ok: false,
      error: 'UI build yok (npm run build). API ayakta.',
    })
  }
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
  let filePath = safeJoin(DIST_DIR, url.pathname === '/' ? '/index.html' : url.pathname)
  if (!filePath) {
    res.writeHead(403)
    return res.end('Forbidden')
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
  }
  const ext = path.extname(filePath).toLowerCase()
  const body = fs.readFileSync(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0]
  if (!pathname.startsWith('/api')) {
    return serveStatic(req, res)
  }
  void handle(req, res)
})

server.listen(PORT, HOST, () => {
  console.log(`[blog-api] HAZIR → http://${HOST}:${PORT}`)
  ensureDb().catch((err) => {
    console.error('[blog-api] DB yüklenemedi', err)
  })
})

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `[blog-api] Port ${PORT} dolu. Önce:\n` +
        `  lsof -ti :${PORT} | xargs kill -9\n` +
        `Sonra: npm run dev`,
    )
    process.exit(1)
  }
  throw err
})
