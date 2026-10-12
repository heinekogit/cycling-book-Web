type RouteMetadata = {
  title: string
  description: string
  image?: string | null
  isPublic: boolean
}

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.append(element)
  }
  element.content = content
}

export function applyRouteMetadata({ title, description, image, isPublic }: RouteMetadata) {
  const pageTitle = `${title} | Cycling Book`
  const url = window.location.href
  document.title = pageTitle
  setMeta('meta[name="description"]', 'name', 'description', description)
  setMeta('meta[name="robots"]', 'name', 'robots', isPublic ? 'index,follow' : 'noindex,nofollow')
  setMeta('meta[property="og:type"]', 'property', 'og:type', 'website')
  setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'Cycling Book')
  setMeta('meta[property="og:title"]', 'property', 'og:title', pageTitle)
  setMeta('meta[property="og:description"]', 'property', 'og:description', description)
  setMeta('meta[property="og:url"]', 'property', 'og:url', url)
  setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', image ? 'summary_large_image' : 'summary')
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', pageTitle)
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description)
  if (image) {
    setMeta('meta[property="og:image"]', 'property', 'og:image', image)
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image)
  }
}

export function resetRouteMetadata() {
  document.title = 'Cycling Book'
  document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.setAttribute('content', 'index,follow')
}
