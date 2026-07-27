#!/usr/bin/env node
/**
 * Render bazen repo kökünden start eder.
 * Root Directory boş olsa bile blog-portal’ı ayağa kaldırır.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'blog-portal')
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', (code) => process.exit(code ?? 1))
