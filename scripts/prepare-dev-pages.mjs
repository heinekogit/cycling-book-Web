#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const sourceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const targetArg = process.argv[2]
if (process.argv.length > 3 || (targetArg && targetArg.startsWith('-'))) {
  throw new Error('Usage: npm run prepare:dev-pages -- [dev-pages-repository]')
}

const target = targetArg ? resolve(targetArg) : null
if (target) {
  const remote = execFileSync('git', ['-C', target, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim()
  if (remote !== 'https://github.com/heinekogit/cycling-book-web-dev.git') {
    throw new Error('Target is not the cycling-book-web-dev repository')
  }
  const branch = execFileSync('git', ['-C', target, 'branch', '--show-current'], { encoding: 'utf8' }).trim()
  if (branch !== 'main') throw new Error('Target must be on main')
  const changes = execFileSync('git', ['-C', target, 'status', '--porcelain'], { encoding: 'utf8' }).trim()
  if (changes) throw new Error('Target has uncommitted changes; review them before preparing another build')
}

const devEnv = loadEnv('development', sourceRoot, 'VITE_')
if (new URL(devEnv.VITE_SUPABASE_URL).hostname !== 'cyutxspjthlodvgchnst.supabase.co') {
  throw new Error('development 用のSupabase接続先が違います')
}
if (!devEnv.VITE_SUPABASE_ANON_KEY) throw new Error('Development Supabase publishable key is missing')
const settings = await fetch(`${devEnv.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, {
  headers: { apikey: devEnv.VITE_SUPABASE_ANON_KEY },
  signal: AbortSignal.timeout(15000),
})
if (!settings.ok) throw new Error(`Development Supabase URL/key pair was rejected (HTTP ${settings.status})`)

const placeholder = 'CB_DEV_MAPBOX_TOKEN_PLACEHOLDER'
const result = spawnSync('npm', ['run', 'build', '--', '--mode', 'development', '--base', '/cycling-book-web-dev/'], {
  cwd: sourceRoot,
  env: { ...process.env, VITE_MAPBOX_TOKEN: placeholder },
  stdio: 'inherit',
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

const dist = join(sourceRoot, 'dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')
if (!html.includes('/cycling-book-web-dev/assets/') || html.includes('/cycling-book-Web/assets/')) {
  throw new Error('Wrong GitHub Pages base path in development HTML')
}
const assets = join(dist, 'assets')
if (!existsSync(assets)) throw new Error('Build has no assets directory')

const js = readdirSync(assets).filter((name) => name.endsWith('.js'))
const code = js.map((name) => readFileSync(join(assets, name), 'utf8')).join('\n')
if (!code.includes('cyutxspjthlodvgchnst') || code.includes('cqiqhczxuiyakptdjowr')) {
  throw new Error('Development build has the wrong Supabase project reference')
}
const placeholderCount = code.split(placeholder).length - 1
if (placeholderCount !== 2 || /pk\.[A-Za-z0-9._-]{20,}/.test(code)) {
  throw new Error('Mapbox token placeholder check failed; do not publish this build')
}
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'))
console.log('Development build verified: dev Supabase, dev base path, Mapbox placeholder (2 uses).')

if (target) {
  rmSync(join(target, 'assets'), { recursive: true, force: true })
  cpSync(assets, join(target, 'assets'), { recursive: true })
  copyFileSync(join(dist, 'index.html'), join(target, 'index.html'))
  copyFileSync(join(dist, '404.html'), join(target, '404.html'))
  console.log(`Prepared local development Pages repository: ${target}`)
  console.log('Review git diff there before committing and pushing.')
}
