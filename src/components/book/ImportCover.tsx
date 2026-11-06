import { useState } from 'react'
import { Upload, FileImage, X, AlertTriangle, Check } from 'lucide-react'
import { fileToImage, imageSize } from '../../lib/importers'
import { buildImportedCover, renderThumbOf, type CoverFit, type CoverParts } from '../../graphics/templates'
import type { coverSpec } from '../../lib/defaults'
import type { DesignDoc } from '../../lib/types'
import { FileButton, Seg, Spinner, Toggle } from '../ui'
import { HelpButton } from '../Help'

type Spec = ReturnType<typeof coverSpec>
type Slot = Exclude<keyof CoverParts, 'fullHasBleed'>

const r2 = (n: number) => Math.round(n * 10) / 10

/** Diagnostic des proportions de l'image importée par rapport au gabarit attendu. */
function diagnose(w: number, h: number, spec: Spec) {
  const r = w / h
  const withBleed = spec.totalW / spec.totalH
  const noBleed = (spec.totalW - 2 * spec.bleed) / (spec.totalH - 2 * spec.bleed)
  const front = spec.trimW / spec.trimH
  const d = (a: number) => Math.abs(r - a) / a
  if (d(withBleed) < 0.015) return { ok: true, hasBleed: true, msg: `Proportions conformes au gabarit avec fonds perdus (${r2(spec.totalW)} × ${r2(spec.totalH)} mm).` }
  if (d(noBleed) < 0.015) return { ok: true, hasBleed: false, msg: `Proportions conformes au format fini sans fonds perdus (${r2(spec.totalW - 2 * spec.bleed)} × ${r2(spec.totalH - 2 * spec.bleed)} mm) : les fonds perdus seront prolongés automatiquement.` }
  if (d(front) < 0.03) return { ok: false, hasBleed: true, front: true, msg: 'Cette image a les proportions d’une 1ʳᵉ de couverture seule, pas d’une couverture complète. Utilisez plutôt l’import « Par parties » → 1ʳᵉ de couverture.' }
  return { ok: false, hasBleed: true, msg: `Les proportions ne correspondent pas : image ${r2(r)} : 1, gabarit attendu ${r2(withBleed)} : 1 (${r2(spec.totalW)} × ${r2(spec.totalH)} mm). Vérifiez le nombre de pages, le papier et les rabats, ou choisissez « Remplir » / « Ajuster ».` }
}

export default function ImportCover({ spec, onDone, disabled }: { spec: Spec; onDone: (doc: DesignDoc, thumb: string) => void; disabled?: boolean }) {
  const [mode, setMode] = useState<'full' | 'parts'>('full')
  const [parts, setParts] = useState<CoverParts>({})
  const [diag, setDiag] = useState<ReturnType<typeof diagnose> | null>(null)
  const [fit, setFit] = useState<CoverFit>('stretch')
  const [busy, setBusy] = useState('')

  const load = async (slot: Slot, f: File) => {
    setBusy('Lecture du fichier…')
    try {
      const src = await fileToImage(f, Math.round(spec.totalW * 6))
      if (slot === 'full') {
        const s = await imageSize(src)
        const dg = diagnose(s.w, s.h, spec)
        setDiag(dg)
        setParts((p) => ({ ...p, full: src, fullHasBleed: dg.hasBleed }))
        setFit(dg.ok ? 'stretch' : 'fill')
      } else setParts((p) => ({ ...p, [slot]: src }))
    } finally { setBusy('') }
  }

  const go = async () => {
    setBusy('Montage de la couverture…')
    try {
      const use: CoverParts = mode === 'full' ? { full: parts.full, fullHasBleed: parts.fullHasBleed } : { ...parts, full: undefined }
      const r = await buildImportedCover(spec, use, fit)
      onDone(r.doc, await renderThumbOf(r.json, r.doc.width, r.doc.height))
    } finally { setBusy('') }
  }

  const slots: { k: Slot; label: string; size: string }[] = [
    ...(spec.flap ? [{ k: 'flapBack' as Slot, label: 'Rabat arrière', size: `${spec.flap} × ${spec.trimH} mm` }] : []),
    { k: 'back', label: '4ᵉ de couverture', size: `${spec.trimW} × ${spec.trimH} mm` },
    { k: 'spine', label: 'Dos', size: `${spec.spine} × ${spec.trimH} mm` },
    { k: 'front', label: '1ʳᵉ de couverture', size: `${spec.trimW} × ${spec.trimH} mm` },
    ...(spec.flap ? [{ k: 'flapFront' as Slot, label: 'Rabat avant', size: `${spec.flap} × ${spec.trimH} mm` }] : []),
  ]
  const ready = mode === 'full' ? !!parts.full : slots.some((s) => parts[s.k])

  return (
    <div className="rounded-xl border border-line bg-panel p-5" style={{ boxShadow: 'var(--shadow)' }}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel3 text-ink"><Upload size={18} /></span>
        <div className="min-w-0 flex-1"><h2 className="text-[15px] font-semibold">Couverture déjà réalisée</h2><p className="mt-0.5 text-[12.5px] text-muted">Importez votre couverture complète (4ᵉ + dos + 1ʳᵉ{spec.flap ? ' + rabats' : ''}) ou chaque partie séparément. Image ou PDF.</p></div>
        <HelpButton topic="importcouv" />
      </div>
      <Seg className="mt-3 w-full" value={mode} onChange={setMode} options={[{ v: 'full', label: 'Couverture complète' }, { v: 'parts', label: 'Par parties' }]} />
      {mode === 'full' ? (
        <div className="mt-3">
          {parts.full ? (
            <div className="relative rounded-lg border border-line bg-panel2 p-2">
              <img src={parts.full} className="mx-auto max-h-28 rounded-[2px]" />
              <button className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white" onClick={() => { setParts((p) => ({ ...p, full: undefined })); setDiag(null) }}><X size={12} /></button>
            </div>
          ) : (
            <FileButton accept="image/*,application/pdf" className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line2 text-[12px] text-muted hover:border-accent" onFiles={(f) => f[0] && void load('full', f[0])}>
              <FileImage size={18} />Choisir l’image ou le PDF de la couverture
            </FileButton>
          )}
          <p className="mt-1.5 text-[11px] text-subtle">Attendu : {r2(spec.totalW)} × {r2(spec.totalH)} mm avec fonds perdus ({r2(spec.totalW - 2 * spec.bleed)} × {r2(spec.totalH - 2 * spec.bleed)} mm sans).</p>
          {diag && <div className={`mt-2 flex items-start gap-2 rounded-md px-2.5 py-2 text-[11.5px] ${diag.ok ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{diag.ok ? <Check size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}<span>{diag.msg}</span></div>}
          {parts.full && <Toggle label="L’image inclut déjà les fonds perdus" checked={parts.fullHasBleed !== false} onChange={(v) => setParts((p) => ({ ...p, fullHasBleed: v }))} />}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {slots.map((s) => (
            <div key={s.k} className="rounded-lg border border-line bg-panel2 p-2">
              <div className="flex items-center justify-between text-[11.5px] font-medium">{s.label}{parts[s.k] && <button className="text-subtle hover:text-ink" onClick={() => setParts((p) => ({ ...p, [s.k]: undefined }))}><X size={12} /></button>}</div>
              <div className="text-[10.5px] text-subtle">{s.size}</div>
              {parts[s.k] ? <img src={parts[s.k]} className="mt-1 h-14 w-full rounded object-contain" /> : <FileButton accept="image/*,application/pdf" className="mt-1 flex h-14 w-full items-center justify-center rounded border border-dashed border-line2 text-[11px] text-muted hover:border-accent" onFiles={(f) => f[0] && void load(s.k, f[0])}>+ Fichier</FileButton>}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3"><span className="label">Adaptation</span><Seg className="w-full" value={fit} onChange={setFit} options={[{ v: 'stretch', label: 'Exacte', tip: 'L’image occupe exactement la zone (déformation si les proportions diffèrent)' }, { v: 'fill', label: 'Remplir', tip: 'Remplit la zone sans déformer, en rognant le surplus' }, { v: 'fit', label: 'Ajuster', tip: 'Image entière, sans rognage (marges possibles)' }]} /></div>
      {busy ? <div className="mt-3"><Spinner label={busy} /></div> : <button className="btn-accent mt-3 h-9 w-full" disabled={!ready || disabled} onClick={go}><Upload size={15} /> Importer et ouvrir dans l’éditeur</button>}
    </div>
  )
}
