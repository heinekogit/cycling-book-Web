import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from './app/AppLayout'
import { ExplorePage } from './pages/ExplorePage'
import { LoginPage } from './pages/LoginPage'
import { MyPage } from './pages/MyPage'
import { NotFoundPage } from './pages/NotFoundPage'

const RouteDetailPage = lazy(() => import('./pages/RouteDetailPage').then((module) => ({ default: module.RouteDetailPage })))
const RunDetailPage = lazy(() => import('./pages/RunDetailPage').then((module) => ({ default: module.RunDetailPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage').then((module) => ({ default: module.PublicProfilePage })))
const RouteEditorPage = lazy(() => import('./pages/RouteEditorPage').then((module) => ({ default: module.RouteEditorPage })))

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<ExplorePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="routes/:routeId" element={<Suspense fallback={<main className="detail-page"><div className="detail-card">地図を準備しています…</div></main>}><RouteDetailPage /></Suspense>} />
        <Route path="mypage" element={<MyPage />} />
        <Route path="profile" element={<Suspense fallback={<main className="profile-page"><div className="state-panel">プロフィールを準備しています…</div></main>}><ProfilePage /></Suspense>} />
        <Route path="riders/:accountId" element={<Suspense fallback={<main className="public-profile-page"><div className="state-panel">公開プロフィールを準備しています…</div></main>}><PublicProfilePage /></Suspense>} />
        <Route path="routes/new" element={<Suspense fallback={<main className="route-editor-page"><div className="state-panel">ルート作成画面を準備しています…</div></main>}><RouteEditorPage /></Suspense>} />
        <Route path="routes/:routeId/edit" element={<Suspense fallback={<main className="route-editor-page"><div className="state-panel">ルート編集画面を準備しています…</div></main>}><RouteEditorPage /></Suspense>} />
        <Route path="runs/:runId" element={<Suspense fallback={<main className="detail-page"><div className="detail-card">実走ログを準備しています…</div></main>}><RunDetailPage /></Suspense>} />
        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  )
}
