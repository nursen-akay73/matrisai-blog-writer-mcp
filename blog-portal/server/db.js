/**
 * Veri katmanı:
 * - Varsayılan: SQLite (blog-portal/data/blogs.db) — yerel demo
 * - DATABASE_URL varsa: PostgreSQL (Neon / Docker / prod)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** Başlangıçta bağlantıyı ısıt */
export async function ensureDbReady() {
  if (usePostgres) {
    await initPostgres()
    return { driver: 'postgresql', target: dbPath }
  }
  await initSqlite()
  return { driver: 'sqlite', target: sqlitePath }
}
