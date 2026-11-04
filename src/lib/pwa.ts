import { useEffect, useState } from 'react'

// Installation de l'application (PWA) sur téléphone et ordinateur.
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: BIP | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; emit() })
  window.addEventListener('appinstalled', () => { deferred = null; emit() })
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => null) })
}

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
export const platform = (): 'ios' | 'android' | 'desktop' => {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

export function useInstall() {
  const [, set] = useState(0)
  useEffect(() => { const l = () => set((x) => x + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    platform: platform(),
    async prompt() {
      if (!deferred) return false
      await deferred.prompt()
      const r = await deferred.userChoice
      deferred = null; emit()
      return r.outcome === 'accepted'
    },
  }
}
