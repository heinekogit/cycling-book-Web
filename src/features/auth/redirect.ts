export function authRedirectUrl(path: 'auth/callback' | 'reset-password') {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
  return new URL(path, base).toString()
}

export function safeReturnTo(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/'
}
