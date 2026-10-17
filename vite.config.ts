import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.GITHUB_ACTIONS === 'true' && repositoryName ? `/${repositoryName}/` : '/'

const projectRefs = {
  development: 'cyutxspjthlodvgchnst',
  production: 'cqiqhczxuiyakptdjowr',
} as const

export default defineConfig(({ mode }) => {
  if (mode !== 'development' && mode !== 'production') {
    throw new Error(`未対応のビルドモードです: ${mode}`)
  }

  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const expectedHost = `${projectRefs[mode]}.supabase.co`
  let actualHost: string
  try {
    actualHost = new URL(env.VITE_SUPABASE_URL).hostname
  } catch {
    throw new Error(`${mode} 用の VITE_SUPABASE_URL が正しくありません`)
  }

  if (actualHost !== expectedHost) {
    throw new Error(`${mode} 用のSupabase接続先が違います。期待値: ${expectedHost}`)
  }
  if (!env.VITE_SUPABASE_ANON_KEY) {
    throw new Error(`${mode} 用の VITE_SUPABASE_ANON_KEY がありません`)
  }

  return {
    base,
    plugins: [react()],
  }
})
