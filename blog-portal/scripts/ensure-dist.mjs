/**
 * Render’da Build Command boş kalırsa dist oluşmaz.
 * Start öncesi dist yoksa bir kez vite build çalıştırır.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist', 'index.html')

if (!fs.existsSync(dist)) {
  console.log('[start] dist yok → npm run build…')
  const r = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) {
    console.error('[start] build başarısız')
    process.exit(r.status || 1)
  }
}
