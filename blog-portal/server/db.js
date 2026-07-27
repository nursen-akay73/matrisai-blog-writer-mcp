import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const dbPath = path.join(dataDir, 'blogs.db')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const db = new Database(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS blogs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    product TEXT NOT NULL,
    scope TEXT NOT NULL,
    audience TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    quality_json TEXT NOT NULL,
    feedback_note TEXT,
    created_at TEXT NOT NULL
  );
`)

const cols = db.prepare(`PRAGMA table_info(blogs)`).all().map((c) => c.name)
if (!cols.includes('pipeline_json')) {
  db.exec(`ALTER TABLE blogs ADD COLUMN pipeline_json TEXT`)
}

export function listBlogs() {
  const rows = db
    .prepare(
      `SELECT id, title, product, scope, audience, content_markdown, quality_json, feedback_note, pipeline_json, created_at
       FROM blogs ORDER BY created_at DESC`,
    )
    .all()

  return rows.map(rowToDraft)
}

export function getBlog(id) {
  const row = db
    .prepare(
      `SELECT id, title, product, scope, audience, content_markdown, quality_json, feedback_note, pipeline_json, created_at
       FROM blogs WHERE id = ?`,
    )
    .get(id)
  return row ? rowToDraft(row) : null
}

export function upsertBlog(draft) {
  db.prepare(
    `INSERT INTO blogs (id, title, product, scope, audience, content_markdown, quality_json, feedback_note, pipeline_json, created_at)
     VALUES (@id, @title, @product, @scope, @audience, @content_markdown, @quality_json, @feedback_note, @pipeline_json, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       product = excluded.product,
       scope = excluded.scope,
       audience = excluded.audience,
       content_markdown = excluded.content_markdown,
       quality_json = excluded.quality_json,
       feedback_note = excluded.feedback_note,
       pipeline_json = excluded.pipeline_json,
       created_at = excluded.created_at`,
  ).run({
    id: draft.id,
    title: draft.title,
    product: draft.product,
    scope: draft.scope,
    audience: draft.audience,
    content_markdown: draft.contentMarkdown,
    quality_json: JSON.stringify(draft.quality),
    feedback_note: draft.feedbackNote ?? null,
    pipeline_json: draft.pipeline ? JSON.stringify(draft.pipeline) : null,
    created_at: draft.createdAt,
  })
  return getBlog(draft.id)
}

export function deleteBlog(id) {
  const result = db.prepare(`DELETE FROM blogs WHERE id = ?`).run(id)
  return result.changes > 0
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
    createdAt: row.created_at,
  }
}

export { dbPath }
