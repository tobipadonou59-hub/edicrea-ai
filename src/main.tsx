import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/pwa'

registerServiceWorker()

// Écran d'ouverture : l'animation se joue, puis l'utilisateur appuie pour entrer dans l'application.
const splash = document.getElementById('splash')
if (splash) {
  let gone = false
  const hide = () => {
    if (gone) return
    gone = true
    splash.classList.add('out')
    window.removeEventListener('keydown', onKey)
    setTimeout(() => splash.remove(), 900)
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') hide() }
  splash.addEventListener('click', hide)
  window.addEventListener('keydown', onKey)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
