import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'

import cyclingBookLogo from '../assets/cycling-book-logo.png'
import { useAccount } from '../features/accounts/AccountProvider'
import { useAuth } from '../features/auth/AuthProvider'
import { useLocale } from '../features/i18n/LocaleProvider'

export function AppLayout() {
  const { session, isLoading, signOut } = useAuth()
  const { accounts, activeAccountId, setActiveAccountId } = useAccount()
  const { locale, setLocale, t } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`)

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return <div className="app-shell">
    <header className="site-header">
      <Link className="brand" to="/" aria-label="Cycling Book トップ">
        <img className="brand-mark" src={cyclingBookLogo} alt="" width={44} height={44} />
        <span><strong>Cycling Book</strong><small>{t('brand.tagline')}</small></span>
      </Link>
      <nav className="header-actions" aria-label="メインナビゲーション">
        <div className="language-switcher" role="group" aria-label={t('language.label')}>
          <button type="button" className={locale === 'ja' ? 'active' : ''} aria-pressed={locale === 'ja'} onClick={() => setLocale('ja')}>日本語</button>
          <button type="button" className={locale === 'en' ? 'active' : ''} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
        </div>
        {session && accounts.length > 1 && <label className="account-switcher">
          <span>{t('account.current')}</span>
          <select value={activeAccountId ?? ''} onChange={(event) => setActiveAccountId(event.target.value)}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}
          </select>
        </label>}
        <Link className="button button-primary" to={session ? '/routes/new' : `/login?returnTo=${encodeURIComponent('/routes/new')}`}>{t('nav.drawRoute')}</Link>
        {!isLoading && (session ? <>
          <Link className="button button-quiet" to="/mypage">{t('nav.myPage')}</Link>
          <button className="button button-quiet" type="button" onClick={() => void handleSignOut()}>{t('nav.logout')}</button>
        </> : <Link className="button button-quiet" to={`/login?returnTo=${returnTo}`}>{t('nav.login')}</Link>)}
      </nav>
    </header>
    <Outlet />
    <footer className="site-footer"><span>Cycling Book Web</span><span>{t('footer.preview')}</span></footer>
  </div>
}
