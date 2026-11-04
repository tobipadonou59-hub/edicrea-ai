import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/pwa'

registerServiceWorker()

// Écran d'ouverture : visible environ 4,7 s (le temps de l'animation), puis fondu vers l'application.
const splash = document.getElementById('splash')
if (splash) {
  const hide = () => { splash.classList.add('out'); setTimeout(() => splash.remove(), 700) }
  splash.addEventListener('click', hide)
  const elapsed = performance.now()
  setTimeout(hide, Math.max(800, 4700 - elapsed))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
