/**
 * Parent qodi-mcp kökünden gerçek otomasyonu çalıştırır.
 * Kullanım (blog-portal API tarafından spawn edilir):
 *   node --import tsx blog-portal/server/run-pipeline-once.mjs '{"force":true,...}'
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

process.chdir(ROOT)
process.env.QODI_MCP_ROOT = ROOT

const payload = JSON.parse(process.argv[2] || '{}')

const { runAutonomousPipeline } = await import(
  pathToFileURL(
    path.join(ROOT, 'src/autonomous/autonomous-orchestrator.ts'),
  ).href
)

const result = await runAutonomousPipeline('http', {
  force: true,
  ...payload,
})

process.stdout.write(JSON.stringify(result))
process.exit(result.ok ? 0 : 1)
