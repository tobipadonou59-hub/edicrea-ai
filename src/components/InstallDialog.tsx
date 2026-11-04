import { Download, Monitor, Smartphone, Share, PlusSquare, MoreVertical, Check } from 'lucide-react'
import { Modal } from './ui'
import { useInstall } from '../lib/pwa'
import { useStore } from '../lib/store'

export default function InstallDialog({ onClose }: { onClose: () => void }) {
  const inst = useInstall()
  const notify = useStore((s) => s.notify)
  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{n}</span><span className="pt-0.5">{children}</span></li>
  )
  return (
    <Modal title="Installer EDICREA AI" subtitle="Une icône sur votre écran d’accueil ou votre bureau, l’application en plein écran et utilisable hors-ligne." icon={Download} onClose={onClose}>
      {inst.installed ? (
        <div className="flex items-center gap-3 rounded-lg border border-ok/30 bg-ok/10 p-3 text-[13px]"><Check size={16} className="text-ok" /> L’application est déjà installée sur cet appareil.</div>
      ) : (
        <div className="space-y-5 text-[13px]">
          {inst.canPrompt && (
            <button className="btn-accent h-10 w-full" onClick={async () => { if (await inst.prompt()) { notify('EDICREA AI est installée.'); onClose() } }}><Download size={16} /> Installer maintenant</button>
          )}
          <section className={inst.platform === 'ios' ? '' : 'opacity-80'}>
            <div className="mb-2 flex items-center gap-2 font-semibold"><Smartphone size={15} /> iPhone et iPad (Safari)</div>
            <ol className="space-y-2">
              <Step n={1}>Ouvrez le site dans <b>Safari</b>.</Step>
              <Step n={2}>Touchez le bouton <b>Partager</b> <Share size={13} className="inline" /> en bas de l’écran.</Step>
              <Step n={3}>Choisissez <b>Sur l’écran d’accueil</b> <PlusSquare size={13} className="inline" />, puis <b>Ajouter</b>.</Step>
            </ol>
          </section>
          <section className={inst.platform === 'android' ? '' : 'opacity-80'}>
            <div className="mb-2 flex items-center gap-2 font-semibold"><Smartphone size={15} /> Android (Chrome)</div>
            <ol className="space-y-2">
              <Step n={1}>Touchez le menu <MoreVertical size={13} className="inline" /> en haut à droite.</Step>
              <Step n={2}>Choisissez <b>Installer l’application</b> (ou « Ajouter à l’écran d’accueil »).</Step>
            </ol>
          </section>
          <section className={inst.platform === 'desktop' ? '' : 'opacity-80'}>
            <div className="mb-2 flex items-center gap-2 font-semibold"><Monitor size={15} /> Ordinateur Windows ou Mac (Chrome, Edge)</div>
            <ol className="space-y-2">
              <Step n={1}>Cliquez sur l’icône <b>Installer</b> <Download size={13} className="inline" /> à droite de la barre d’adresse.</Step>
              <Step n={2}>Confirmez : EDICREA AI s’ouvre dans sa propre fenêtre et apparaît dans le menu Démarrer ou le Launchpad.</Step>
            </ol>
          </section>
          <p className="text-[12px] text-subtle">Vos projets restent enregistrés sur l’appareil. Les mises à jour de l’application s’installent automatiquement.</p>
        </div>
      )}
    </Modal>
  )
}
