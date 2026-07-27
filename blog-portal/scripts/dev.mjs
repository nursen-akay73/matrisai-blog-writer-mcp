/**
 * Anında log veren dev başlatıcı (concurrently sessiz kalmasın diye).
 */
import { execSync, spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const API_PORT = 8789
const WEB_PORT = 5173

/** macOS: `lsof -ti :8789,:5173` çalışmaz — port başına TCP LISTEN gerekir. */
function freePort(port) {
  let pids = []
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
    }).trim()
    if (out) pids = out.split(/\s+/).filter(Boolean)
  } catch {
    return
  }
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM')
      console.log(`[dev] Port ${port} serbest (eski pid ${pid})`)
    } catch {
      /* already gone */
    }
  }
}

console.log('[dev] Blog portal başlıyor…')
freePort(API_PORT)
freePort(WEB_PORT)
// SIGTERM sonrası soketin kapanması için kısa bekle
await new Promise((r) => setTimeout(r, 400))

console.log('[dev] Not: Proje Desktop’taysa Vite/node_modules yavaş açılabilir (iCloud).')
console.log(
  `[dev] Hazır olunca → http://127.0.0.1:${WEB_PORT}  |  API → http://127.0.0.1:${API_PORT}`,
)
console.log('')

function run(name, command, args, color) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  const prefix = (line) => `${color}[${name}]\x1b[0m ${line}`

  const pipe = (stream) => {
    let buf = ''
    stream.on('data', (chunk) => {
      buf += chunk.toString()
      const parts = buf.split('\n')
      buf = parts.pop() || ''
      for (const line of parts) {
        if (line.length) console.log(prefix(line))
      }
    })
    stream.on('end', () => {
      if (buf.length) console.log(prefix(buf))
    })
  }

  pipe(child.stdout)
  pipe(child.stderr)

  child.on('exit', (code, signal) => {
    console.log(`[dev] ${name} çıktı (code=${code}, signal=${signal || '-'})`)
    for (const c of children) {
      if (c !== child && !c.killed) c.kill('SIGTERM')
    }
    process.exit(code ?? 1)
  })

  return child
}

const children = []
children.push(run('api', process.execPath, ['server/index.js'], '\x1b[32m'))
children.push(
  run(
    'web',
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(WEB_PORT),
    ],
    '\x1b[36m',
  ),
)

process.on('SIGINT', () => {
  for (const c of children) c.kill('SIGINT')
  process.exit(0)
})
