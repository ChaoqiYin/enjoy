/**
 * Startup smoke test.
 *
 * Starts `cordis-app dev --no-open`, waits for `.cordis/runtime.json`, then
 * probes `/__health` until it returns 200. Always stops the dev process tree
 * before exiting. Runs standalone: `node scripts/startup-smoke.mjs`.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const runtimeFile = join(projectRoot, '.cordis', 'runtime.json')
const cordisBin = join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'cordis-app.cmd' : 'cordis-app',
)
const timeoutMs = 120_000
const pollMs = 500
const shutdownMs = 10_000

if (!existsSync(cordisBin)) {
  console.error(`FAIL missing CLI: ${cordisBin}（先在 cordis/ 下执行 pnpm install）`)
  process.exit(1)
}

// A stale runtime.json from a killed process would otherwise hand us a dead port.
rmSync(runtimeFile, { force: true })

let output = ''
const child = spawn(cordisBin, ['dev', '--no-open'], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',
})

child.stdout.on('data', (chunk) => {
  output += chunk
  process.stdout.write(chunk)
})
child.stderr.on('data', (chunk) => {
  output += chunk
  process.stderr.write(chunk)
})
child.on('error', (error) => {
  output += `${error.message}\n`
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function probeHealth() {
  if (!existsSync(runtimeFile)) return undefined
  try {
    const info = JSON.parse(readFileSync(runtimeFile, 'utf8'))
    if (typeof info.port !== 'number' || typeof info.token !== 'string') return undefined
    const response = await fetch(`http://127.0.0.1:${info.port}/__health`)
    return response.status === 200 ? info.port : undefined
  } catch {
    return undefined
  }
}

async function waitForExit(ms) {
  if (child.exitCode !== null) return true
  return Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    sleep(ms).then(() => false),
  ])
}

async function stop() {
  if (child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  if (await waitForExit(shutdownMs)) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
  await waitForExit(shutdownMs)
}

async function main() {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const port = await probeHealth()
    if (port !== undefined) {
      console.log(`OK /__health returned 200 on http://127.0.0.1:${port}`)
      return
    }
    if (child.exitCode !== null) {
      throw new Error(`cordis-app dev exited early with code ${child.exitCode}\n${output}`)
    }
    await sleep(pollMs)
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for /__health\n${output}`)
}

try {
  await main()
} catch (error) {
  console.error(`FAIL ${error.message}`)
  process.exitCode = 1
} finally {
  await stop()
}
