import { useEffect, useState } from 'react'
import { StaticCanvas, type FabricObject } from 'fabric'
import { jsPDF } from 'jspdf'
import { CheckCircle2, AlertTriangle, XCircle, FileDown, Printer, MousePointerClick, FileType2, Package, Image as ImageIcon, RefreshCcw, Eye, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useStore } from '../../lib/store'
import { exportBookPdf, exportDocx, preflight, download, slug, drawCropMarks, type Check } from '../../lib/exportBook'
import { Spinner, Toggle } from '../ui'
import { useLayout, metaOf } from './useLayout'
import { PageView } from './PageView'
import '../../graphics/setup'

async function renderCover(json: unknown, w: number, h: number, mult: number, region?: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement('canvas')
  const sc = new StaticCanvas(el, { width: w, height: h })
  await sc.loadFromJSON(json as Record<string, unknown>)
  sc.getObjects().forEach((o) => { if ((o as FabricObject & { edRole?: string }).edRole === 'guide') o.visible = false })
  sc.renderAll()
  const url = sc.toDataURL({ format: 'jpeg', quality: 0.95, multiplier: mult, ...(region || {}) })
  sc.dispose()
  return url
}

export default function FinalizeStep() {
  const project = useStore((s) => s.project)!
  const notify = useStore((s) => s.notify)
  const log = useStore((s) => s.log)
  const book = project.book!
  const L = book.layout
  const meta = metaOf(book)
  const { res, busy } = useLayout(book)
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [working, setWorking] = useState('')
  const [cmyk, setCmyk] = useState(true)
  const [marks, setMarks] = useState(true)
  const [front, setFront] = useState<string>('')
  const [spine, setSpine] = useState<string>('')
  const [flip, setFlip] = useState(0)
  const d = book.cover.design

  useEffect(() => { if (res) void preflight(book.blocks, res, L, meta, !!d).then(setChecks) }, [res]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!d?.json || !d.coverGuides) return
    const g = d.coverGuides
    void renderCover(d.json, d.width, d.height, 0.5, { left: g.bleed + (g.flap || 0) + g.back + g.spine, top: g.bleed, width: g.front, height: d.height - 2 * g.bleed }).then(setFront)
    void renderCover(d.json, d.width, d.height, 0.5, { left: g.bleed + (g.flap || 0) + g.back, top: g.bleed, width: g.spine, height: d.height - 2 * g.bleed }).then(setSpine)
  }, [d])

  const run = async (label: string, fn: () => Promise<void>) => { setWorking(label); try { await fn(); log(label + ' : ' + (meta.title || project.name), project.id) } catch (e) { notify('Erreur : ' + (e as Error).message) } finally { setWorking('') } }
  const base = slug(meta.title || project.name)

  const exportCoverPdf = () => run('Export couverture PDF', async () => {
    if (!d?.json) throw new Error('Aucune couverture conçue (étape 5).')
    const mult = 300 / 25.4 / d.unitsPerMm
    const url = await renderCover(d.json, d.width, d.height, mult)
    const wmm = d.width / d.unitsPerMm, hmm = d.height / d.unitsPerMm
    const s = marks ? 10 : 0
    const pdf = new jsPDF({ unit: 'mm', format: [wmm + 2 * s, hmm + 2 * s], orientation: 'landscape' })
    pdf.addImage(url, 'JPEG', s, s, wmm, hmm)
    if (s) {
      drawCropMarks(pdf, s, d.bleedMm, wmm - 2 * d.bleedMm, hmm - 2 * d.bleedMm, false)
      const g = d.coverGuides!
      pdf.setLineWidth(0.2)
      for (const x of [...(g.flap ? [g.bleed + g.flap, g.bleed + g.flap * 1 + g.back * 2 + g.spine] : []), g.bleed + (g.flap || 0) + g.back, g.bleed + (g.flap || 0) + g.back + g.spine].map((px) => px / d.unitsPerMm + s)) { pdf.line(x, 0, x, s - 3); pdf.line(x, hmm + s + 3, x, hmm + 2 * s) }
    }
    download(pdf.output('blob'), base + '-couverture.pdf')
  })

  const pages = res?.pages || []
  const ok = checks?.filter((c) => c.level === 'ok').length || 0
  const warn = checks?.filter((c) => c.level === 'warn').length || 0
  const err = checks?.filter((c) => c.level === 'error').length || 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1320px] gap-6 p-4 md:p-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {/* Prévisualisation réaliste */}
          <div className="card overflow-hidden">
            <div className="panel-title justify-between"><span className="flex items-center gap-2"><Eye size={14} /> Prévisualisation réaliste</span><span className="text-[11px] font-normal text-subtle">{L.width} × {L.height} mm · {pages.length} pages</span></div>
            <div className="canvas-bg flex min-h-[380px] flex-wrap items-center justify-center gap-14 p-10">
              <div style={{ perspective: 1400 }}>
                <div className="relative" style={{ transform: 'rotateY(-24deg) rotateX(3deg)', transformStyle: 'preserve-3d', width: 220, height: (220 * L.height) / L.width }}>
                  <div className="absolute inset-0 rounded-r-sm" style={{ boxShadow: '3px 2px 0 #f3efe6, 6px 4px 0 #e4ddcf, 9px 6px 0 #f3efe6, 12px 8px 0 #d9d1c1, 24px 24px 40px rgba(0,0,0,.45)' }} />
                  {front ? <img src={front} className="absolute inset-0 h-full w-full rounded-r-sm" /> : <div className="absolute inset-0 flex items-center justify-center rounded-r-sm bg-panel2 p-4 text-center text-sm text-muted">Couverture à concevoir (étape 5)</div>}
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/35 to-transparent" />
                  {spine && <img src={spine} className="absolute inset-y-0 h-full" style={{ left: -16, width: 16, transform: 'rotateY(-90deg)', transformOrigin: 'right center' }} />}
                </div>
              </div>
              {pages.length > 1 && (
                <div className="text-center">
                  <div className="paper-shadow flex">
                    {[flip * 2 - 1, flip * 2].map((i) => i >= 0 && i < pages.length ? <PageView key={i} page={pages[i]} L={L} scale={1.15} guides={false} /> : <div key={i} style={{ width: L.width * 1.15 }} />)}
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                    <button className="btn-icon border border-line bg-panel" disabled={flip <= 0} onClick={() => setFlip(flip - 1)}><ChevronLeft size={14} /></button>
                    <span className="min-w-20 text-[12px] tabular-nums text-muted">{[pages[flip * 2 - 1]?.label, pages[flip * 2]?.label].filter(Boolean).join('–')} / {pages.length}</span>
                    <button className="btn-icon border border-line bg-panel" disabled={flip * 2 + 1 >= pages.length} onClick={() => setFlip(flip + 1)}><ChevronRight size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Vérification technique */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-4 border-b border-line p-5">
              {(() => { const total = (checks?.length || 1), score = Math.round(((ok + warn * 0.5) / total) * 100), col = err ? 'var(--danger)' : warn ? 'var(--warn)' : 'var(--ok)'; return (
                <div className="relative h-14 w-14 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--line)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={col} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(checks ? score : 0) * 0.974} 100`} /></svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums">{checks ? score : '—'}</span>
                </div>
              ) })()}
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-semibold">Contrôle avant impression</h3>
                {busy || !checks ? <Spinner label="Analyse en cours…" /> : <div className="mt-1 flex flex-wrap gap-2 text-[12px]"><span className="chip !text-ok"><CheckCircle2 size={11} /> {ok} conforme(s)</span><span className="chip !text-warn"><AlertTriangle size={11} /> {warn} avertissement(s)</span><span className="chip !text-danger"><XCircle size={11} /> {err} erreur(s)</span></div>}
              </div>
              <button className="btn" onClick={() => res && void preflight(book.blocks, res, L, meta, !!d).then(setChecks)}><RefreshCcw size={14} /> Relancer</button>
            </div>
            <ul className="divide-y divide-line">
              {checks?.slice().sort((a, b) => ({ error: 0, warn: 1, ok: 2 }[a.level] - { error: 0, warn: 1, ok: 2 }[b.level])).map((c, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-2.5 text-[13px]">
                  {c.level === 'ok' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> : c.level === 'warn' ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" /> : <XCircle size={15} className="mt-0.5 shrink-0 text-danger" />}
                  <span className={c.level === 'ok' ? 'text-muted' : ''}>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Exports */}
        <div className="card h-fit space-y-3 overflow-hidden p-4 pt-0">
          <div className="panel-title -mx-4"><Download size={14} /> Exportation</div>
          {working && <Spinner label={working + '…'} />}
          <div className="space-y-1 rounded-lg bg-panel2 p-3">
            <Toggle label="Couleurs CMJN (texte et filets)" checked={cmyk} onChange={setCmyk} />
            <Toggle label="Traits de coupe" checked={marks} onChange={setMarks} />
            <p className="text-xs text-muted">Fonds perdus : {L.bleed} mm · Format fini : {L.width} × {L.height} mm · {pages.length} pages</p>
          </div>
          {([
            [Printer, 'PDF prêt pour l’impression', `Fonds perdus, ${marks ? 'traits de coupe, ' : ''}${cmyk ? 'CMJN, ' : ''}cahiers de 4 pages, polices incorporées`, () => run('Export PDF imprimeur', async () => { if (!res) return; download(await exportBookPdf(res, L, meta, { mode: 'print', cropMarks: marks, cmyk, bleed: true, padTo4: true }), base + '-impression.pdf') })],
            [FileDown, 'PDF haute qualité', 'Lecture écran et diffusion, signets de chapitres', () => run('Export PDF HD', async () => { if (!res) return; download(await exportBookPdf(res, L, meta, { mode: 'screen', cropMarks: false, cmyk: false, bleed: false, padTo4: false }), base + '.pdf') })],
            [MousePointerClick, 'PDF interactif', 'Sommaire cliquable, signets, navigation', () => run('Export PDF interactif', async () => { if (!res) return; download(await exportBookPdf(res, L, meta, { mode: 'interactive', cropMarks: false, cmyk: false, bleed: false, padTo4: false }), base + '-interactif.pdf') })],
            [FileType2, 'DOCX (Word)', 'Titres, styles, listes, tableaux, images et sommaire', () => run('Export DOCX', async () => download(await exportDocx(book.blocks, book.styles, meta, L.toc), base + '.docx'))],
            [ImageIcon, 'Couverture PDF (impression)', '1ʳᵉ + dos + 4ᵉ, 300 dpi, fonds perdus et repères de pli', exportCoverPdf],
            [Package, 'Projet EDICREA (.edicrea)', 'Format modifiable : reprenez le projet n’importe où', () => run('Export projet', async () => download(new Blob([JSON.stringify(project)], { type: 'application/json' }), base + '.edicrea'))],
          ] as const).map(([Icon, title, desc, fn]) => (
            <button key={title} disabled={!!working || (busy && title.startsWith('PDF'))} onClick={() => void fn()} className={`group flex w-full items-center gap-3 rounded-lg border p-3 text-left transition hover:border-accent/60 hover:bg-panel2 disabled:opacity-50 ${title.startsWith('PDF prêt') ? 'border-accent/40 bg-accent-soft' : 'border-line'}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-panel3 text-accent"><Icon size={17} /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[13px] font-semibold">{title}{title.startsWith('PDF prêt') && <span className="rounded bg-accent px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-accent-ink">Imprimeur</span>}</span><span className="block text-[11.5px] leading-snug text-muted">{desc}</span></span>
              <Download size={14} className="shrink-0 text-subtle transition group-hover:text-accent" />
            </button>
          ))}
          <p className="text-xs text-muted">PNG, JPG, SVG et TIFF de la couverture : menu « Exporter » de l’éditeur de couverture (étape 5).</p>
        </div>
      </div>
    </div>
  )
}
