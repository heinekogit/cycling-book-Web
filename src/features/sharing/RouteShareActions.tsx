import { useState } from 'react'

import { useLocale } from '../i18n/LocaleProvider'

type RouteShareActionsProps = {
  title: string
  description: string
  isPublic: boolean
}

export function RouteShareActions({ title, description, isPublic }: RouteShareActionsProps) {
  const { t } = useLocale()
  const [message, setMessage] = useState('')
  const url = window.location.href
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(`${title} | Cycling Book`)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setMessage(t('share.copied'))
    } catch {
      setMessage(t('share.copyError'))
    }
  }

  const shareFromDevice = async () => {
    if (!navigator.share) return
    try {
      await navigator.share({ title, text: description, url })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage(t('share.shareError'))
    }
  }

  if (!isPublic) {
    return <aside className="route-share route-share-private">
      <div><strong>{t('share.privateTitle')}</strong><p>{t('share.privateDescription')}</p></div>
    </aside>
  }

  return <aside className="route-share" aria-labelledby="route-share-title">
    <div><strong id="route-share-title">{t('share.title')}</strong><p>{t('share.description')}</p></div>
    <div className="route-share-actions">
      {'share' in navigator && <button type="button" onClick={() => void shareFromDevice()}>{t('share.device')}</button>}
      <a href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`} target="_blank" rel="noreferrer">X</a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noreferrer">Facebook</a>
      <a href={`https://social-plugins.line.me/lineit/share?url=${encodedUrl}`} target="_blank" rel="noreferrer">LINE</a>
      <button type="button" onClick={() => void copyLink()}>{t('share.copy')}</button>
    </div>
    {message && <p className="route-share-message" role="status">{message}</p>}
  </aside>
}
