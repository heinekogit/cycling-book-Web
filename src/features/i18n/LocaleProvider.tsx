import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Locale = 'ja' | 'en'

const messages = {
  ja: {
    'brand.tagline': '自転車で走る、残す、振り返る',
    'nav.drawRoute': 'ルートを描く',
    'nav.myPage': 'マイページ',
    'nav.logout': 'ログアウト',
    'nav.login': 'ログイン',
    'language.label': '表示言語',
    'explore.eyebrow': '自転車で探索する',
    'explore.title': '次に走りたい道を、見つけよう。',
    'explore.description': 'みんなが公開したサイクリングルートを眺めて、次の一走につなげる場所です。',
    'explore.newRoutes': '新着ルート',
    'explore.checkingLogin': 'ログイン状態を確認しています…',
    'explore.loggedInAs': '{{email}} でログイン中',
    'explore.viewRecords': '自分の記録を見る →',
    'explore.loginBenefit': 'ログインするとルートの作成と記録管理ができます。',
    'explore.loginLink': 'ログイン →',
    'explore.latestEyebrow': '新着ルート',
    'explore.publicRoutes': '公開ルート',
    'explore.latestTen': '新しく公開された10件',
    'explore.loadError': '公開ルートを読み込めませんでした。',
    'explore.retry': '再読み込み',
    'explore.empty': '現在、公開されているルートはありません。',
    'explore.untitled': '無題のルート',
    'explore.photos': '写真 {{count}}枚',
    'explore.noPhotos': '写真なし',
    'explore.loading': '公開ルートを読み込み中',
    'login.eyebrow': 'おかえりなさい',
    'login.title': 'ログイン',
    'login.description': '登録済みのCycling Bookアカウントでログインしてください。',
    'login.email': 'メールアドレス',
    'login.password': 'パスワード',
    'login.required': 'メールアドレスとパスワードを入力してください。',
    'login.invalid': 'メールアドレスまたはパスワードが一致しません。',
    'login.connectionError': '認証サービスに接続できませんでした（{{status}}）。',
    'login.connectionStatus': '接続エラー',
    'login.submitting': 'ログイン中…',
    'login.submit': 'ログイン',
    'login.back': '← トップへ戻る',
    'route.back': '← 公開ルートへ戻る',
    'route.loading': 'ルートを読み込んでいます…',
    'route.loadError': 'ルートを読み込めませんでした。',
    'route.missing': 'ルートが見つからないか、公開されていません。',
    'route.public': '公開',
    'route.private': '非公開',
    'route.publish': '公開する',
    'route.unpublish': '非公開にする',
    'route.updating': '更新中…',
    'route.edit': '編集',
    'route.publishConfirm': 'このルートを公開しますか？ 公開するとトップページから誰でも閲覧できます。',
    'route.unpublishConfirm': 'このルートを非公開にしますか？ トップページの公開一覧から外れます。',
    'route.publishing': '公開設定を更新しています…',
    'route.unpublishing': '非公開設定を更新しています…',
    'route.published': 'ルートを公開しました。',
    'route.unpublished': 'ルートを非公開にしました。',
    'route.updateError': '公開設定を更新できませんでした。',
    'route.ownerLabel': 'このルートを公開したライダー',
    'route.defaultRider': 'Cycling Book ライダー',
    'route.viewProfile': 'プロフィールを見る →',
    'route.distance': '距離',
    'route.type': 'ルート種別',
    'route.createdAt': '作成日時',
    'route.id': 'ルートID',
    'route.notSet': '未設定',
    'route.dateNotSet': '日付未設定',
    'route.typeDrawn': '描画ルート',
    'route.typeFromRun': '実走ログ由来',
    'route.fromRun': '実走ログから作成されたルート',
    'route.sourceRun': '元ログ #{{id}}',
    'map.empty': 'このルートには表示できる軌跡がありません。',
    'map.routePhoto': 'ルート写真',
    'map.openPhoto': '写真を開く',
    'photos.eyebrow': 'ルート写真',
    'photos.title': 'ルート写真',
    'photos.count': '{{count}}枚',
    'photos.empty': 'このルートには写真がありません。',
    'photos.unknownDate': '撮影日時不明',
    'photos.alt': '{{date}}のルート写真',
    'elevation.title': '標高プロフィール',
    'elevation.gain': '上昇',
    'elevation.loss': '下降',
    'elevation.grade': '平均勾配',
    'elevation.loading': '標高データを取得しています…',
    'elevation.unavailable': '標高データを取得できませんでした。',
    'elevation.chartLabel': '標高プロフィール。最低{{min}}m、最高{{max}}m',
    'profile.back': '← 公開ルートへ戻る',
    'profile.loading': 'プロフィールを読み込んでいます…',
    'profile.loadError': 'プロフィールを読み込めませんでした。',
    'profile.missingTitle': 'プロフィールが見つかりません',
    'profile.missingDescription': '削除されたか、公開されていない可能性があります。',
    'profile.defaultRider': 'Cycling Book ライダー',
    'profile.description': '公開したサイクリングルートをまとめています。',
    'profile.publicRoutes': '公開ルート',
    'profile.routesBy': '{{name}}さんのルート',
    'profile.publishedCount': '{{count}}件を公開中',
    'profile.empty': '現在、公開されているルートはありません。',
    'profile.distanceNotSet': '距離未設定',
    'footer.preview': 'React移行プレビュー',
  },
  en: {
    'brand.tagline': 'Ride, record, and rediscover by bike',
    'nav.drawRoute': 'Plan a route',
    'nav.myPage': 'My page',
    'nav.logout': 'Log out',
    'nav.login': 'Log in',
    'language.label': 'Display language',
    'explore.eyebrow': 'EXPLORE BY BIKE',
    'explore.title': 'Find your next road to ride.',
    'explore.description': 'Discover cycling routes shared by riders and find inspiration for your next journey.',
    'explore.newRoutes': 'New routes',
    'explore.checkingLogin': 'Checking your login status…',
    'explore.loggedInAs': 'Logged in as {{email}}',
    'explore.viewRecords': 'View your rides →',
    'explore.loginBenefit': 'Log in to plan routes and manage your ride history.',
    'explore.loginLink': 'Log in →',
    'explore.latestEyebrow': 'LATEST ROUTES',
    'explore.publicRoutes': 'Public routes',
    'explore.latestTen': '10 most recently published routes',
    'explore.loadError': 'We could not load the public routes.',
    'explore.retry': 'Try again',
    'explore.empty': 'There are no public routes yet.',
    'explore.untitled': 'Untitled route',
    'explore.photos': '{{count}} photos',
    'explore.noPhotos': 'No photos',
    'explore.loading': 'Loading public routes',
    'login.eyebrow': 'WELCOME BACK',
    'login.title': 'Log in',
    'login.description': 'Log in with your existing Cycling Book account.',
    'login.email': 'Email address',
    'login.password': 'Password',
    'login.required': 'Enter your email address and password.',
    'login.invalid': 'The email address or password is incorrect.',
    'login.connectionError': 'Could not connect to the authentication service ({{status}}).',
    'login.connectionStatus': 'connection error',
    'login.submitting': 'Logging in…',
    'login.submit': 'Log in',
    'login.back': '← Back to home',
    'route.back': '← Back to public routes',
    'route.loading': 'Loading route…',
    'route.loadError': 'We could not load this route.',
    'route.missing': 'This route could not be found or is not public.',
    'route.public': 'Public',
    'route.private': 'Private',
    'route.publish': 'Make public',
    'route.unpublish': 'Make private',
    'route.updating': 'Updating…',
    'route.edit': 'Edit',
    'route.publishConfirm': 'Make this route public? Anyone will be able to view it from the home page.',
    'route.unpublishConfirm': 'Make this route private? It will be removed from the public route list.',
    'route.publishing': 'Updating public visibility…',
    'route.unpublishing': 'Updating private visibility…',
    'route.published': 'The route is now public.',
    'route.unpublished': 'The route is now private.',
    'route.updateError': 'We could not update the visibility setting.',
    'route.ownerLabel': 'Route shared by',
    'route.defaultRider': 'Cycling Book rider',
    'route.viewProfile': 'View profile →',
    'route.distance': 'Distance',
    'route.type': 'Route type',
    'route.createdAt': 'Created',
    'route.id': 'Route ID',
    'route.notSet': 'Not set',
    'route.dateNotSet': 'Date not set',
    'route.typeDrawn': 'Planned route',
    'route.typeFromRun': 'From a recorded ride',
    'route.fromRun': 'Route created from a recorded ride',
    'route.sourceRun': 'Source ride #{{id}}',
    'map.empty': 'No route line is available to display.',
    'map.routePhoto': 'Route photo',
    'map.openPhoto': 'Open photo',
    'photos.eyebrow': 'ROUTE PHOTOS',
    'photos.title': 'Route photos',
    'photos.count': '{{count}} photos',
    'photos.empty': 'There are no photos for this route.',
    'photos.unknownDate': 'Date unknown',
    'photos.alt': 'Route photo from {{date}}',
    'elevation.title': 'Elevation profile',
    'elevation.gain': 'Gain',
    'elevation.loss': 'Loss',
    'elevation.grade': 'Average grade',
    'elevation.loading': 'Loading elevation data…',
    'elevation.unavailable': 'Elevation data is unavailable.',
    'elevation.chartLabel': 'Elevation profile. Minimum {{min}}m and maximum {{max}}m',
    'profile.back': '← Back to public routes',
    'profile.loading': 'Loading profile…',
    'profile.loadError': 'We could not load this profile.',
    'profile.missingTitle': 'Profile not found',
    'profile.missingDescription': 'It may have been removed or is not available.',
    'profile.defaultRider': 'Cycling Book rider',
    'profile.description': 'A collection of publicly shared cycling routes.',
    'profile.publicRoutes': 'Public routes',
    'profile.routesBy': '{{name}}’s routes',
    'profile.publishedCount': '{{count}} published',
    'profile.empty': 'There are no public routes yet.',
    'profile.distanceNotSet': 'Distance not set',
    'footer.preview': 'React migration preview',
  },
} as const

type MessageKey = keyof typeof messages.ja
type Replacements = Record<string, string | number>

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, replacements?: Replacements) => string
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)
const storageKey = 'cycling-book.locale'

function getInitialLocale(): Locale {
  const stored = window.localStorage.getItem(storageKey)
  if (stored === 'ja' || stored === 'en') return stored
  return window.navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale)

  useEffect(() => {
    window.localStorage.setItem(storageKey, locale)
    document.documentElement.lang = locale
    document.title = locale === 'ja' ? 'Cycling Book | 次に走りたい道を見つけよう' : 'Cycling Book | Find your next cycling route'
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (description) description.content = locale === 'ja'
      ? 'みんなのサイクリングルートを探し、描き、記録できるCycling Book。'
      : 'Discover, plan, and record cycling routes with Cycling Book.'
  }, [locale])

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    t: (key, replacements = {}) => {
      let translated: string = messages[locale][key]
      for (const [name, replacement] of Object.entries(replacements)) {
        translated = translated.replaceAll(`{{${name}}}`, String(replacement))
      }
      return translated
    },
    formatDate: (value, options = { dateStyle: 'medium' }) => new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en', options).format(new Date(value)),
    formatNumber: (number, options) => new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en', options).format(number),
  }), [locale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used inside LocaleProvider')
  return context
}
