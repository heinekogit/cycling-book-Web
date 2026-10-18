#!/usr/bin/env node
const environments = {
  production: {
    repository: 'cycling-book-Web',
    project: 'cqiqhczxuiyakptdjowr',
    otherProject: 'cyutxspjthlodvgchnst',
  },
  development: {
    repository: 'cycling-book-web-dev',
    project: 'cyutxspjthlodvgchnst',
    otherProject: 'cqiqhczxuiyakptdjowr',
  },
}

const [environment, expectedSha] = process.argv.slice(2)
if (!environments[environment] || process.argv.length > 4) {
  throw new Error('Usage: npm run check:pages -- <production|development> [expected-commit-sha]')
}

const { repository, project, otherProject } = environments[environment]
const repoPath = `heinekogit/${repository}`
const site = `https://heinekogit.github.io/${repository}/`

async function load(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response
}

const deployments = await (await load(
  `https://api.github.com/repos/${repoPath}/deployments?environment=github-pages&per_page=1`,
  { Accept: 'application/vnd.github+json' },
)).json()
const latest = deployments[0]
if (!latest) throw new Error('No GitHub Pages deployment found')
const statuses = await (await load(
  `https://api.github.com/repos/${repoPath}/deployments/${latest.id}/statuses?per_page=1`,
  { Accept: 'application/vnd.github+json' },
)).json()
if (statuses[0]?.state !== 'success') throw new Error(`Latest Pages deployment is ${statuses[0]?.state ?? 'unknown'}`)
if (expectedSha && !latest.sha.startsWith(expectedSha)) {
  throw new Error(`Deployed commit ${latest.sha.slice(0, 7)} differs from expected ${expectedSha}`)
}

const html = await (await load(site)).text()
const fallback = await (await load(`${site}404.html`)).text()
if (fallback !== html) throw new Error('GitHub Pages SPA fallback differs from index.html')
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((match) => match[1])
if (!assets.length || assets.some((path) => !path.startsWith(`/${repository}/assets/`))) {
  throw new Error('Unexpected Pages asset base path')
}
const code = (await Promise.all(assets.map(async (path) =>
  (await load(new URL(path, site))).text()))).join('\n')
if (!code.includes(project) || code.includes(otherProject)) {
  throw new Error('Published JavaScript has the wrong Supabase reference')
}
if (code.includes('CB_DEV_MAPBOX_TOKEN_PLACEHOLDER')) {
  throw new Error('Published JavaScript still contains the Mapbox placeholder')
}
console.log(`${environment}: deployment ${latest.id}, commit ${latest.sha.slice(0, 7)}, Pages success, HTTPS/SPA and Supabase reference OK`)
