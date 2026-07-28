/**
 * Veri katmanı:
 * - Varsayılan: SQLite (blog-portal/data/blogs.db) — yerel demo
 * - DATABASE_URL varsa: PostgreSQL (Neon / Docker / prod)
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCAL_AUTH } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const sqlitePath = path.join(dataDir, 'blogs.db')

function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env')
    const text = fs.readFileSync(envPath, 'utf8')
    for (const line of text.split(/\n/)) {
      const s = line.trim()
      if (!s || s.startsWith('#') || !s.includes('=')) continue
      const i = s.indexOf('=')
      const k = s.slice(0, i).trim()
      let v = s.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!(k in process.env)) process.env[k] = v
    }
  } catch {
    /* no .env */
  }
}

loadEnvFile()

const databaseUrl = (process.env.DATABASE_URL || '').trim()
const usePostgres = Boolean(databaseUrl)

/** @type {import('pg').Pool | null} */
let pgPool = null
/** @type {import('better-sqlite3').Database | null} */
let sqlite = null

export const dbPath = usePostgres ? databaseUrl.replace(/:[^:@/]+@/, ':***@') : sqlitePath
export const dbDriver = usePostgres ? 'postgresql' : 'sqlite'

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const next = crypto.scryptSync(password, salt, 64).toString('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(next, 'hex'))
  } catch {
    return false
  }
}

async function ensureUsersTablePg(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT NOT NULL
    );
  `)
}

function ensureUsersTableSqlite(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT NOT NULL
    );
  `)
}

async function initPostgres() {
  if (pgPool) return pgPool
  const { default: pg } = await import('pg')
  pgPool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') || databaseUrl.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  })
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS blogs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      product TEXT NOT NULL,
      scope TEXT NOT NULL,
      audience TEXT NOT NULL,
      content_markdown TEXT NOT NULL,
      quality_json TEXT NOT NULL,
      feedback_note TEXT,
      pipeline_json TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL
    );
  `)
  await pgPool.query(`
    DO $$ BEGIN
      ALTER TABLE blogs ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `)
  await ensureUsersTablePg(pgPool)
  await ensureTopicQueuePg(pgPool)
  return pgPool
}

async function initSqlite() {
  if (sqlite) return sqlite
  const { default: Database } = await import('better-sqlite3')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  sqlite = new Database(sqlitePath)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS blogs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      product TEXT NOT NULL,
      scope TEXT NOT NULL,
      audience TEXT NOT NULL,
      content_markdown TEXT NOT NULL,
      quality_json TEXT NOT NULL,
      feedback_note TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL
    );
  `)
  const cols = sqlite.prepare(`PRAGMA table_info(blogs)`).all().map((c) => c.name)
  if (!cols.includes('pipeline_json')) {
    sqlite.exec(`ALTER TABLE blogs ADD COLUMN pipeline_json TEXT`)
  }
  if (!cols.includes('status')) {
    sqlite.exec(`ALTER TABLE blogs ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'`)
  }
  ensureUsersTableSqlite(sqlite)
  ensureTopicQueueSqlite(sqlite)
  return sqlite
}

const BLOG_SELECT = `id, title, product, scope, audience, content_markdown, quality_json, feedback_note, pipeline_json, COALESCE(status, 'draft') AS status, created_at`

function normalizeStatus(value) {
  if (value === 'approved' || value === 'rejected' || value === 'draft') return value
  return 'draft'
}

function rowToDraft(row) {
  return {
    id: row.id,
    title: row.title,
    product: row.product,
    scope: row.scope,
    audience: row.audience,
    contentMarkdown: row.content_markdown,
    quality: JSON.parse(row.quality_json),
    feedbackNote: row.feedback_note || undefined,
    pipeline: row.pipeline_json ? JSON.parse(row.pipeline_json) : undefined,
    status: normalizeStatus(row.status),
    createdAt: row.created_at,
  }
}

export async function listBlogs() {
  if (usePostgres) {
    const pool = await initPostgres()
    const { rows } = await pool.query(
      `SELECT ${BLOG_SELECT} FROM blogs ORDER BY created_at DESC`,
    )
    return rows.map(rowToDraft)
  }
  const db = await initSqlite()
  return db
    .prepare(`SELECT ${BLOG_SELECT} FROM blogs ORDER BY created_at DESC`)
    .all()
    .map(rowToDraft)
}

export async function getBlog(id) {
  if (usePostgres) {
    const pool = await initPostgres()
    const { rows } = await pool.query(
      `SELECT ${BLOG_SELECT} FROM blogs WHERE id = $1`,
      [id],
    )
    return rows[0] ? rowToDraft(rows[0]) : null
  }
  const db = await initSqlite()
  const row = db.prepare(`SELECT ${BLOG_SELECT} FROM blogs WHERE id = ?`).get(id)
  return row ? rowToDraft(row) : null
}

export async function upsertBlog(draft) {
  const payload = {
    id: draft.id,
    title: draft.title,
    product: draft.product,
    scope: draft.scope,
    audience: draft.audience,
    content_markdown: draft.contentMarkdown,
    quality_json: JSON.stringify(draft.quality),
    feedback_note: draft.feedbackNote ?? null,
    pipeline_json: draft.pipeline ? JSON.stringify(draft.pipeline) : null,
    status: normalizeStatus(draft.status),
    created_at: draft.createdAt,
  }

  if (usePostgres) {
    const pool = await initPostgres()
    await pool.query(
      `INSERT INTO blogs (id, title, product, scope, audience, content_markdown, quality_json, feedback_note, pipeline_json, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         product = EXCLUDED.product,
         scope = EXCLUDED.scope,
         audience = EXCLUDED.audience,
         content_markdown = EXCLUDED.content_markdown,
         quality_json = EXCLUDED.quality_json,
         feedback_note = EXCLUDED.feedback_note,
         pipeline_json = EXCLUDED.pipeline_json,
         status = EXCLUDED.status,
         created_at = EXCLUDED.created_at`,
      [
        payload.id,
        payload.title,
        payload.product,
        payload.scope,
        payload.audience,
        payload.content_markdown,
        payload.quality_json,
        payload.feedback_note,
        payload.pipeline_json,
        payload.status,
        payload.created_at,
      ],
    )
    return getBlog(draft.id)
  }

  const db = await initSqlite()
  db.prepare(
    `INSERT INTO blogs (id, title, product, scope, audience, content_markdown, quality_json, feedback_note, pipeline_json, status, created_at)
     VALUES (@id, @title, @product, @scope, @audience, @content_markdown, @quality_json, @feedback_note, @pipeline_json, @status, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       product = excluded.product,
       scope = excluded.scope,
       audience = excluded.audience,
       content_markdown = excluded.content_markdown,
       quality_json = excluded.quality_json,
       feedback_note = excluded.feedback_note,
       pipeline_json = excluded.pipeline_json,
       status = excluded.status,
       created_at = excluded.created_at`,
  ).run(payload)
  return getBlog(draft.id)
}

/** İnsan onayı: draft | approved | rejected */
export async function updateBlogStatus(id, status) {
  const next = normalizeStatus(status)
  if (usePostgres) {
    const pool = await initPostgres()
    const result = await pool.query(
      `UPDATE blogs SET status = $1 WHERE id = $2`,
      [next, id],
    )
    if (!result.rowCount) return null
    return getBlog(id)
  }
  const db = await initSqlite()
  const result = db.prepare(`UPDATE blogs SET status = ? WHERE id = ?`).run(next, id)
  if (!result.changes) return null
  return getBlog(id)
}

export async function deleteBlog(id) {
  if (usePostgres) {
    const pool = await initPostgres()
    const result = await pool.query(`DELETE FROM blogs WHERE id = $1`, [id])
    return result.rowCount > 0
  }
  const db = await initSqlite()
  const result = db.prepare(`DELETE FROM blogs WHERE id = ?`).run(id)
  return result.changes > 0
}

async function ensureTopicQueuePg(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS topic_queue (
      id TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      scope TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'Corporate',
      status TEXT NOT NULL DEFAULT 'pending',
      blog_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
}

function ensureTopicQueueSqlite(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS topic_queue (
      id TEXT PRIMARY KEY,
      product TEXT NOT NULL,
      scope TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'Corporate',
      status TEXT NOT NULL DEFAULT 'pending',
      blog_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
}

function rowToQueueItem(row) {
  return {
    id: row.id,
    product: row.product,
    scope: row.scope,
    audience: row.audience || 'Corporate',
    status: row.status || 'pending',
    blogId: row.blog_id || null,
    error: row.error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const DEFAULT_QUEUE_TOPICS = [
  {
    product: 'Qodi',
    scope:
      'Qodi’nin Analitik MCP ile doğal dilde BIST teknik analiz ve KAP özeti sunmasını; güvenli/yerel işleme vurgusuyla anlat.',
    audience: 'Corporate',
  },
  {
    product: 'Matriks MCP',
    scope:
      'Matriks MCP Portal’da API key alıp Claude / Cursor’a bağlanma adımlarını kurumsal tonla anlat.',
    audience: 'Corporate',
  },
  {
    product: 'Quantex',
    scope:
      'Quantex’in anomali ve emir defteri sinyallerini Qodi ekosisteminde nasıl değer yarattığını anlat.',
    audience: 'Corporate',
  },
]

/** Başlangıçta bağlantıyı ısıt + demo kullanıcıyı seed et */
export async function ensureDbReady() {
  if (usePostgres) {
    await initPostgres()
    await seedDemoUser()
    await seedDefaultQueueTopics()
    return { driver: 'postgresql', target: dbPath, auth: 'users-table' }
  }
  await initSqlite()
  await seedDemoUser()
  await seedDefaultQueueTopics()
  return { driver: 'sqlite', target: sqlitePath, auth: 'users-table' }
}

/** Kuyruk boşsa örnek konular ekle (cron demosu) */
export async function seedDefaultQueueTopics() {
  const existing = await listQueue()
  if (existing.length > 0) return { seeded: 0 }
  let seeded = 0
  for (const t of DEFAULT_QUEUE_TOPICS) {
    await addQueueItem(t)
    seeded += 1
  }
  return { seeded }
}

export async function listQueue() {
  if (usePostgres) {
    const pool = await initPostgres()
    const { rows } = await pool.query(
      `SELECT * FROM topic_queue ORDER BY
         CASE status
           WHEN 'pending' THEN 0
           WHEN 'running' THEN 1
           WHEN 'failed' THEN 2
           ELSE 3
         END,
         created_at ASC`,
    )
    return rows.map(rowToQueueItem)
  }
  const db = await initSqlite()
  return db
    .prepare(
      `SELECT * FROM topic_queue ORDER BY
         CASE status
           WHEN 'pending' THEN 0
           WHEN 'running' THEN 1
           WHEN 'failed' THEN 2
           ELSE 3
         END,
         created_at ASC`,
    )
    .all()
    .map(rowToQueueItem)
}

export async function addQueueItem(input) {
  const now = new Date().toISOString()
  const item = {
    id: `q-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    product: String(input.product || 'Qodi').trim(),
    scope: String(input.scope || '').trim(),
    audience: String(input.audience || 'Corporate').trim(),
    status: 'pending',
    blog_id: null,
    error: null,
    created_at: now,
    updated_at: now,
  }
  if (!item.scope) throw new Error('scope zorunlu')

  if (usePostgres) {
    const pool = await initPostgres()
    await pool.query(
      `INSERT INTO topic_queue (id, product, scope, audience, status, blog_id, error, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        item.id,
        item.product,
        item.scope,
        item.audience,
        item.status,
        item.blog_id,
        item.error,
        item.created_at,
        item.updated_at,
      ],
    )
    return rowToQueueItem(item)
  }

  const db = await initSqlite()
  db.prepare(
    `INSERT INTO topic_queue (id, product, scope, audience, status, blog_id, error, created_at, updated_at)
     VALUES (@id, @product, @scope, @audience, @status, @blog_id, @error, @created_at, @updated_at)`,
  ).run(item)
  return rowToQueueItem(item)
}

/** En eski pending’i running yapıp döndür (tek worker) */
export async function claimNextPending() {
  const now = new Date().toISOString()
  if (usePostgres) {
    const pool = await initPostgres()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT * FROM topic_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      )
      if (!rows[0]) {
        await client.query('COMMIT')
        return null
      }
      await client.query(
        `UPDATE topic_queue SET status = 'running', updated_at = $1, error = NULL WHERE id = $2`,
        [now, rows[0].id],
      )
      await client.query('COMMIT')
      return rowToQueueItem({
        ...rows[0],
        status: 'running',
        updated_at: now,
        error: null,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  const db = await initSqlite()
  const row = db
    .prepare(
      `SELECT * FROM topic_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`,
    )
    .get()
  if (!row) return null
  db.prepare(
    `UPDATE topic_queue SET status = 'running', updated_at = ?, error = NULL WHERE id = ?`,
  ).run(now, row.id)
  return rowToQueueItem({ ...row, status: 'running', updated_at: now, error: null })
}

export async function completeQueueItem(id, blogId) {
  const now = new Date().toISOString()
  if (usePostgres) {
    const pool = await initPostgres()
    await pool.query(
      `UPDATE topic_queue SET status = 'done', blog_id = $1, updated_at = $2, error = NULL WHERE id = $3`,
      [blogId, now, id],
    )
    return
  }
  const db = await initSqlite()
  db.prepare(
    `UPDATE topic_queue SET status = 'done', blog_id = ?, updated_at = ?, error = NULL WHERE id = ?`,
  ).run(blogId, now, id)
}

export async function failQueueItem(id, error) {
  const now = new Date().toISOString()
  const msg = String(error || 'Hata').slice(0, 2000)
  if (usePostgres) {
    const pool = await initPostgres()
    await pool.query(
      `UPDATE topic_queue SET status = 'failed', error = $1, updated_at = $2 WHERE id = $3`,
      [msg, now, id],
    )
    return
  }
  const db = await initSqlite()
  db.prepare(
    `UPDATE topic_queue SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
  ).run(msg, now, id)
}

export async function deleteQueueItem(id) {
  if (usePostgres) {
    const pool = await initPostgres()
    const result = await pool.query(`DELETE FROM topic_queue WHERE id = $1`, [
      id,
    ])
    return result.rowCount > 0
  }
  const db = await initSqlite()
  const result = db.prepare(`DELETE FROM topic_queue WHERE id = ?`).run(id)
  return result.changes > 0
}

export async function resetQueueItemToPending(id) {
  const now = new Date().toISOString()
  if (usePostgres) {
    const pool = await initPostgres()
    const result = await pool.query(
      `UPDATE topic_queue SET status = 'pending', error = NULL, blog_id = NULL, updated_at = $1
       WHERE id = $2 AND status IN ('failed', 'done')`,
      [now, id],
    )
    return result.rowCount > 0
  }
  const db = await initSqlite()
  const result = db
    .prepare(
      `UPDATE topic_queue SET status = 'pending', error = NULL, blog_id = NULL, updated_at = ?
       WHERE id = ? AND status IN ('failed', 'done')`,
    )
    .run(now, id)
  return result.changes > 0
}

/** Demo hesabı users tablosuna yazar (yoksa). Şifre scrypt hash. */
export async function seedDemoUser() {
  const email = LOCAL_AUTH.email.trim().toLowerCase()
  const password = LOCAL_AUTH.password
  const id = 'user-demo-nursen'
  const displayName = 'Nurşen Akay'
  const createdAt = new Date().toISOString()

  if (usePostgres) {
    const pool = await initPostgres()
    const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email])
    if (existing.rows.length) return { seeded: false, email }
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, email, hashPassword(password), displayName, createdAt],
    )
    console.log('[db] demo kullanıcı seed edildi →', email)
    return { seeded: true, email }
  }

  const db = await initSqlite()
  const row = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email)
  if (row) return { seeded: false, email }
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, email, hashPassword(password), displayName, createdAt)
  console.log('[db] demo kullanıcı seed edildi →', email)
  return { seeded: true, email }
}

/** Login: users tablosundan doğrula */
export async function authenticateUser(email, password) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase()
  if (!normalized || !password) return null

  if (usePostgres) {
    const pool = await initPostgres()
    const { rows } = await pool.query(
      `SELECT id, email, password_hash, display_name FROM users WHERE email = $1`,
      [normalized],
    )
    const user = rows[0]
    if (!user || !verifyPassword(password, user.password_hash)) return null
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name || undefined,
    }
  }

  const db = await initSqlite()
  const user = db
    .prepare(`SELECT id, email, password_hash, display_name FROM users WHERE email = ?`)
    .get(normalized)
  if (!user || !verifyPassword(password, user.password_hash)) return null
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name || undefined,
  }
}

/**
 * Ücretsiz kayıt — users tablosuna yazar.
 * @returns {{ ok: true, user: object } | { ok: false, error: string }}
 */
export async function registerUser({ email, password, displayName }) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase()
  const pass = String(password || '')
  const name = String(displayName || '')
    .trim()
    .slice(0, 80)

  if (!normalized || !normalized.includes('@')) {
    return { ok: false, error: 'Geçerli bir e-posta girin' }
  }
  if (pass.length < 6) {
    return { ok: false, error: 'Şifre en az 6 karakter olmalı' }
  }

  const id = `user-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
  const createdAt = new Date().toISOString()
  const passwordHash = hashPassword(pass)

  if (usePostgres) {
    const pool = await initPostgres()
    const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [
      normalized,
    ])
    if (existing.rows.length) {
      return { ok: false, error: 'Bu e-posta zaten kayıtlı — giriş yapın' }
    }
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, normalized, passwordHash, name || null, createdAt],
    )
    return {
      ok: true,
      user: { id, email: normalized, displayName: name || undefined },
    }
  }

  const db = await initSqlite()
  const row = db.prepare(`SELECT id FROM users WHERE email = ?`).get(normalized)
  if (row) {
    return { ok: false, error: 'Bu e-posta zaten kayıtlı — giriş yapın' }
  }
  try {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, normalized, passwordHash, name || null, createdAt)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Kayıt başarısız',
    }
  }
  return {
    ok: true,
    user: { id, email: normalized, displayName: name || undefined },
  }
}
