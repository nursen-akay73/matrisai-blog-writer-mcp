/**
 * Hafif API — Express yok (Desktop/iCloud node_modules okuması ETIMEDOUT veriyordu).
 * Önce port açılır, sonra sqlite yüklenir; loglar anında görünür.
 */
import http from 'node:http'
import { LOCAL_AUTH } from './config.js'

const PORT = Number(process.env.BLOG_API_PORT || 8789)

console.log('[blog-api] başlıyor…')
console.log('[blog-api] Not: Desktop’ta ilk yükleme yavaş olabilir; port hemen açılır.')

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
  console.log('[blog-api] sqlite yükleniyor…')
  db = await import('./db.js')
  console.log('[blog-api] sqlite hazır →', db.dbPath)
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

async function handle(req, res) {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const { pathname } = url
  const method = req.method || 'GET'

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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
        qodiRoot: bridge?.QODI_ROOT ?? null,
        pipelineBusy,
      })
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJson(req)
      if (body === null) {
        return sendJson(res, 400, { ok: false, error: 'Geçersiz JSON' })
      }
      const email = String(body.email || '')
        .trim()
        .toLowerCase()
      const password = String(body.password || '')
      if (
        email === LOCAL_AUTH.email.toLowerCase() &&
        password === LOCAL_AUTH.password
      ) {
        return sendJson(res, 200, { ok: true, token: 'local-demo-token' })
      }
      return sendJson(res, 401, {
        ok: false,
        error: 'E-posta veya şifre hatalı',
      })
    }

    // Aşağıdaki route'lar sqlite ister
    const database = await ensureDb()

    if (method === 'GET' && pathname === '/api/blogs') {
      return sendJson(res, 200, { ok: true, blogs: database.listBlogs() })
    }

    const blogMatch = pathname.match(/^\/api\/blogs\/([^/]+)$/)
    if (method === 'GET' && blogMatch) {
      const blog = database.getBlog(decodeURIComponent(blogMatch[1]))
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
      const saved = database.upsertBlog(draft)
      return sendJson(res, 201, { ok: true, blog: saved })
    }

    if (method === 'DELETE' && blogMatch) {
      const removed = database.deleteBlog(decodeURIComponent(blogMatch[1]))
      if (!removed) return sendJson(res, 404, { ok: false, error: 'Bulunamadı' })
      return sendJson(res, 200, { ok: true })
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
      console.log('[blog-api] pipeline başladı…')
      try {
        const { runRealPipelineAndSave } = await ensureBridge()
        const blog = await runRealPipelineAndSave({
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

    return sendJson(res, 404, { ok: false, error: 'Not found' })
  } catch (err) {
    console.error('[blog-api] handler error', err)
    return sendJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

const server = http.createServer((req, res) => {
  void handle(req, res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[blog-api] HAZIR → http://127.0.0.1:${PORT}`)
  // Arka planda sqlite ısıt
  ensureDb().catch((err) => {
    console.error('[blog-api] sqlite yüklenemedi', err)
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
