import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'

import { App } from './App'
import { AuthProvider } from './features/auth/AuthProvider'
import { LocaleProvider } from './features/i18n/LocaleProvider'
import './styles/global.css'

const baseUrl = import.meta.env.BASE_URL
const basename = baseUrl === '/' ? '/' : baseUrl.replace(/\/$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <LocaleProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  </StrictMode>,
)
