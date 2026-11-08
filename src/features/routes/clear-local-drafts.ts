import { clearMarkerFilesDrafts } from './marker-draft'

const routeDraftPrefix = 'cycling-book.route-draft.'

/** Called only after the server has completed account deletion. */
export async function clearLocalRouteDrafts() {
  let storageError: unknown
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    for (const key of keys) if (key?.startsWith(routeDraftPrefix)) window.localStorage.removeItem(key)
  } catch (error) {
    storageError = error
  }

  await clearMarkerFilesDrafts()
  if (storageError) throw storageError
}
