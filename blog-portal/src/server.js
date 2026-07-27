/**
 * Render Start Command uyumluluğu:
 * bazı servislerde `node src/server.js` tanımlı.
 * Asıl API: ../server/index.js
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ensure = spawnSync(process.execPath, ['scripts/ensure-dist.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})
if (ensure.status !== 0) process.exit(ensure.status || 1)

await import('../server/index.js')
