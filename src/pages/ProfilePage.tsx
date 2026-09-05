import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthProvider'
import { HomeLocationMap, type HomeLocation } from '../features/maps/HomeLocationMap'
import { getProfile, updateProfile } from '../features/profile/api'

export function ProfilePage() {
  const { session, isLoading: isAuthLoading } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [homeName, setHomeName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [isLocating, setIsLocating] = useState(false)

  useEffect(() => {
    if (isAuthLoading || !session?.user.id) return
    let isMounted = true
    void getProfile(session.user.id).then((profile) => {
      if (!isMounted) return
      setDisplayName(profile?.display_name || '')
      setHomeName(profile?.home_name || '')
      setLatitude(profile?.home_lat == null ? '' : Number(profile.home_lat).toFixed(6))
      setLongitude(profile?.home_lng == null ? '' : Number(profile.home_lng).toFixed(6))
      setStatus('ready')
    }).catch((error) => { console.error('プロフィールを読み込めませんでした', error); if (isMounted) { setStatus('error'); setMessage('プロフィールを読み込めませんでした。') } })
    return () => { isMounted = false }
  }, [isAuthLoading, session?.user.id])

  const location = useMemo<HomeLocation | null>(() => {
    const lat = Number(latitude); const lng = Number(longitude)
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null
  }, [latitude, longitude])

  const changeLocation = useCallback((next: HomeLocation) => {
    setLatitude(next.lat.toFixed(6)); setLongitude(next.lng.toFixed(6)); setMessage('')
  }, [])

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setMessage('この端末では現在地を取得できません。'); return }
    setIsLocating(true); setMessage('現在地を取得しています…')
    navigator.geolocation.getCurrentPosition((position) => {
      setIsLocating(false); changeLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
      setMessage('現在地をホーム地点候補に設定しました。確認して保存してください。')
    }, (error) => {
      setIsLocating(false)
      setMessage(error.code === error.PERMISSION_DENIED ? '位置情報の利用が許可されていません。ブラウザ設定を確認してください。' : '現在地を取得できませんでした。')
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!session?.user.id) return
    const hasLatitude = latitude.trim() !== ''; const hasLongitude = longitude.trim() !== ''
    if (hasLatitude !== hasLongitude) { setMessage('緯度と経度は両方を入力するか、両方を空欄にしてください。'); return }
    if ((hasLatitude || hasLongitude) && !location) { setMessage('緯度・経度の値を確認してください。'); return }
    setStatus('saving'); setMessage('保存しています…')
    try {
      await updateProfile(session.user.id, {
        display_name: displayName.trim() || null,
        home_name: homeName.trim() || null,
        home_lat: location?.lat ?? null,
        home_lng: location?.lng ?? null,
      })
      setStatus('ready'); setMessage('プロフィールを保存しました。')
    } catch (error) {
      console.error('プロフィールを保存できませんでした', error)
      setStatus('error'); setMessage('プロフィールを保存できませんでした。')
    }
  }

  if (isAuthLoading) return <main className="profile-page"><div className="state-panel">ログイン状態を確認しています…</div></main>
  if (!session) return <main className="profile-page"><section className="state-panel"><p className="eyebrow">MEMBERS ONLY</p><h1>ログインが必要です</h1><Link className="button button-primary" to="/login?returnTo=/profile">ログインへ</Link></section></main>

  return <main className="profile-page">
    <div className="profile-title"><div><p className="eyebrow">PROFILE & HOME</p><h1>プロフィール設定</h1><p>表示名と、ルート作成時の起点になるホーム地点を設定します。</p></div><Link className="button button-quiet" to="/mypage">マイページへ戻る</Link></div>
    <form className="profile-form" onSubmit={(event) => void handleSubmit(event)}>
      <section className="profile-card profile-basic"><div className="profile-section-copy"><p className="eyebrow">BASIC</p><h2>基本情報</h2></div><div className="profile-fields">
        <label htmlFor="display-name">表示名</label><input id="display-name" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="表示名を入力" disabled={status === 'saving'} />
        <p className="field-note">プロフィール画像は今後の工程で対応します。</p>
      </div></section>
      <section className="profile-card"><div className="profile-section-copy"><p className="eyebrow">HOME LOCATION</p><h2>ホーム地点</h2><p>マイルート作成時の初期表示地点です。自宅ではなく、近くの駅や公園でも構いません。</p></div><div className="profile-fields">
        <label htmlFor="home-name">ホーム地点名</label><input id="home-name" maxLength={120} value={homeName} onChange={(event) => setHomeName(event.target.value)} placeholder="例：○○駅／○○公園" disabled={status === 'saving'} />
        <HomeLocationMap location={location} onChange={changeLocation} />
        <button className="button button-quiet current-location-button" type="button" onClick={useCurrentLocation} disabled={isLocating || status === 'saving'}>{isLocating ? '現在地を取得中…' : '現在地をホーム地点にする'}</button>
        <div className="coordinate-grid"><label htmlFor="home-lat">緯度<input id="home-lat" type="number" step="0.000001" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="35.680000" disabled={status === 'saving'} /></label><label htmlFor="home-lng">経度<input id="home-lng" type="number" step="0.000001" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="139.760000" disabled={status === 'saving'} /></label></div>
      </div></section>
      {message && <div className={`profile-message${status === 'error' ? ' error' : ''}`} role="status">{message}</div>}
      <div className="profile-submit"><button className="button button-primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? '保存中…' : 'プロフィールを保存'}</button></div>
    </form>
  </main>
}
