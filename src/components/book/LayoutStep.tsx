import { useState } from 'react'
import { ArrowRight, Printer, ZoomIn, ZoomOut, BookOpen, Square, Columns3, ListTree, Hash, Frame, Scissors, AlertTriangle } from 'lucide-react'
import { useStore } from '../../lib/store'
import { BOOK_FORMATS } from '../../lib/defaults'
import type { LayoutSettings } from '../../lib/types'
import { Field, Num, Section, Seg, Spinner, Toggle } from '../ui'
import { PageView } from './PageView'
import { useLayout } from './useLayout'

export default function LayoutStep({ next }: { next: () => void }) {
  const project = useStore((s) => s.project)!
  const update = useStore((s) => s.update)
  const notify = useStore((s) => s.notify)
  const book = project.book!
  const L = book.layout
  const { res, busy } = useLayout(book)
  const [scale, setScale] = useState(2.2)
  const [guides, setGuides] = useState(true)
  const [spread, setSpread] = useState(true)
  const [bleedView, setBleedView] = useState(false)
  const set = (p: Partial<LayoutSettings>) => update((pp) => { Object.assign(pp.book!.layout, p) })

  const printReady = () => {
    set({ bleed: Math.max(3, L.bleed), marginTop: Math.max(15, L.marginTop), marginBottom: Math.max(17, L.marginBottom), marginOuter: Math.max(12, L.marginOuter), marginInner: Math.max(18, L.marginInner), mirror: true, chapterOnRecto: true, pageNumbers: true, footer: true })
    notify('Réglages imprimeur appliqués : fonds perdus 3 mm, marges de sécurité, pages en vis-à-vis, chapitres en belle page.')
  }

  // regroupement en doubles pages : 1 seule, puis (2,3), (4,5)…
  const pages = res?.pages || []
  const rows: number[][] = !pages.length ? [] : spread ? [[0], ...Array.from({ length: Math.ceil((pages.length - 1) / 2) }, (_, i) => [1 + i * 2, 2 + i * 2].filter((x) => x < pages.length))] : pages.map((_, i) => [i])

  const contentW = L.width - L.marginInner - L.marginOuter
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="flex w-full shrink-0 flex-col border-line bg-panel max-lg:order-2 max-lg:border-t lg:w-[300px] lg:border-r">
        <div className="panel-title"><Columns3 size={14} /> Mise en page</div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <Section title="Format" icon={BookOpen}>
            <select className="input" value={L.format} onChange={(e) => { const f = BOOK_FORMATS[e.target.value]; if (f) set({ format: e.target.value, width: f.w, height: f.h }); else set({ format: 'custom' }) }}>
              {Object.entries(BOOK_FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
              <option value="custom">Personnalisé…</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Num prefix="L" suffix="mm" value={L.width} onChange={(v) => v > 50 && set({ width: v, format: 'custom' })} />
              <Num prefix="H" suffix="mm" value={L.height} onChange={(v) => v > 50 && set({ height: v, format: 'custom' })} />
            </div>
          </Section>
          <Section title="Marges" icon={Square}>
            <MarginDiagram L={L} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Haut"><Num suffix="mm" value={L.marginTop} onChange={(v) => set({ marginTop: Math.max(3, v) })} /></Field>
              <Field label="Bas"><Num suffix="mm" value={L.marginBottom} onChange={(v) => set({ marginBottom: Math.max(3, v) })} /></Field>
              <Field label={L.mirror ? 'Petit fond' : 'Gauche'}><Num suffix="mm" value={L.marginInner} onChange={(v) => set({ marginInner: Math.max(3, v) })} /></Field>
              <Field label={L.mirror ? 'Extérieur' : 'Droite'}><Num suffix="mm" value={L.marginOuter} onChange={(v) => set({ marginOuter: Math.max(3, v) })} /></Field>
            </div>
            <Toggle label="Pages en vis-à-vis" hint="Marges miroir recto / verso" checked={L.mirror} onChange={(v) => set({ mirror: v })} />
          </Section>
          <Section title="Colonnes et fonds perdus" icon={Columns3}>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Colonnes"><Num value={L.columns} min={1} max={4} onChange={(v) => set({ columns: Math.max(1, Math.min(4, Math.round(v))) })} /></Field>
              <Field label="Gouttière"><Num suffix="mm" value={L.gutter} onChange={(v) => set({ gutter: Math.max(0, v) })} /></Field>
              <Field label="Fonds perdus"><Num suffix="mm" value={L.bleed} step={0.5} onChange={(v) => set({ bleed: Math.max(0, v) })} /></Field>
            </div>
            <p className="text-[11px] text-subtle">Justification : {Math.round(contentW * 10) / 10} mm{L.columns > 1 ? ` · colonne ${Math.round(((contentW - L.gutter * (L.columns - 1)) / L.columns) * 10) / 10} mm` : ''}</p>
          </Section>
          <Section title="Pages spéciales" icon={ListTree}>
            <Toggle label="Page de titre" checked={L.titlePage} onChange={(v) => set({ titlePage: v })} />
            <Toggle label="Sommaire automatique" checked={L.toc} onChange={(v) => set({ toc: v })} />
            {L.toc && <input className="input" value={L.tocTitle} onChange={(e) => set({ tocTitle: e.target.value })} />}
            <Toggle label="Chapitre sur nouvelle page" checked={L.chapterNewPage} onChange={(v) => set({ chapterNewPage: v })} />
            <Toggle label="Chapitres en belle page" hint="Recto, pages blanches insérées" checked={L.chapterOnRecto} onChange={(v) => set({ chapterOnRecto: v })} />
          </Section>
          <Section title="En-têtes et folios" icon={Hash}>
            <Toggle label="Titre courant" checked={L.header} onChange={(v) => set({ header: v })} />
            {L.header && <Field label="Texte du verso" hint="Variables : {titre} {auteur} {chapitre}"><input className="input" value={L.headerText} onChange={(e) => set({ headerText: e.target.value })} /></Field>}
            <Toggle label="Numérotation des pages" checked={L.pageNumbers && L.footer} onChange={(v) => set({ pageNumbers: v, footer: v })} />
            {L.pageNumbers && (
              <div className="grid grid-cols-2 gap-2">
                <Seg value={L.numberPosition} onChange={(v) => set({ numberPosition: v })} options={[{ v: 'outer', label: 'Extérieur' }, { v: 'center', label: 'Centre' }]} className="flex" />
                <Num prefix="N°" value={L.startNumberAt} onChange={(v) => set({ startNumberAt: Math.round(v) })} />
              </div>
            )}
          </Section>
        </div>
        <div className="space-y-2 border-t border-line p-3">
          <button className="btn w-full" onClick={printReady}><Printer size={15} /> Préparer pour l’impression</button>
          <button className="btn-accent w-full" onClick={next}>Continuer : Couverture <ArrowRight size={15} /></button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col max-lg:min-h-[75vh]">
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
          {busy ? <Spinner label="Pagination…" /> : <span className="flex items-center gap-3 text-[12.5px]"><span><b className="tabular-nums">{pages.length}</b> <span className="text-muted">pages</span></span><span className="divider-v" /><span><b className="tabular-nums">{res?.toc.filter((t) => t.level === 1).length || 0}</b> <span className="text-muted">chapitres</span></span><span className="divider-v" /><span className="text-muted">{L.width} × {L.height} mm</span></span>}
          <div className="flex-1" />
          <Seg value={spread ? 'spread' : 'single'} onChange={(v) => setSpread(v === 'spread')} options={[{ v: 'spread', label: <span className="flex items-center gap-1.5"><BookOpen size={13} /> Doubles pages</span> }, { v: 'single', label: <span className="flex items-center gap-1.5"><Square size={13} /> Pages</span> }]} />
          <span className="divider-v" />
          <button className={`btn-icon ${guides ? 'on' : ''}`} data-tip="Repères de marges et colonnes" onClick={() => setGuides(!guides)}><Frame size={15} /></button>
          <button className={`btn-icon ${bleedView ? 'on' : ''}`} data-tip="Afficher les fonds perdus" onClick={() => setBleedView(!bleedView)}><Scissors size={15} /></button>
          <span className="divider-v" />
          <button className="btn-icon" onClick={() => setScale(scale / 1.2)}><ZoomOut size={15} /></button>
          <span className="w-11 text-center text-[12px] tabular-nums text-muted">{Math.round((scale / 2.2) * 100)} %</span>
          <button className="btn-icon" onClick={() => setScale(scale * 1.2)}><ZoomIn size={15} /></button>
        </div>
        {res?.warnings.length ? <div className="flex items-center gap-2 border-b border-warn/25 bg-warn/10 px-4 py-2 text-[12px]"><AlertTriangle size={14} className="shrink-0 text-warn" />{res.warnings.join(' · ')}</div> : null}
        <div className="canvas-bg min-h-0 flex-1 overflow-auto p-4 md:p-8">
          <div className="flex flex-col items-center gap-8">
            {rows.map((r, i) => (
              <div key={i} className={`flex ${r.length === 1 && spread && i === 0 ? 'justify-end' : ''}`} style={spread ? { width: (L.width + (bleedView ? 2 * L.bleed : 0)) * scale * 2 } : undefined}>
                {r.map((pi, k) => (
                  <div key={pi} className="text-center">
                    <div className={`paper-shadow ${spread && r.length === 2 ? (k === 0 ? 'rounded-l-[2px]' : 'rounded-r-[2px]') : ''} relative`}>
                      <PageView page={pages[pi]} L={L} scale={scale} guides={guides} showBleed={bleedView} />
                      {spread && r.length === 2 && <div className={`pointer-events-none absolute inset-y-0 w-6 ${k === 0 ? 'right-0 bg-gradient-to-l' : 'left-0 bg-gradient-to-r'} from-black/10 to-transparent`} />}
                    </div>
                    <div className="mt-2 text-[11px] tabular-nums text-subtle">{pages[pi].kind === 'blank' ? 'blanche' : pages[pi].label}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MarginDiagram({ L }: { L: LayoutSettings }) {
  const s = 64 / L.height
  const w = L.width * s, h = L.height * s
  const page = (recto: boolean) => {
    const ml = (L.mirror ? (recto ? L.marginInner : L.marginOuter) : L.marginInner) * s
    const mr = (L.mirror ? (recto ? L.marginOuter : L.marginInner) : L.marginOuter) * s
    return (
      <div className="relative bg-white" style={{ width: w, height: h }}>
        <div className="absolute border border-dashed border-[#d946ef]/70 bg-[#d946ef]/5" style={{ left: ml, right: mr, top: L.marginTop * s, bottom: L.marginBottom * s }} />
      </div>
    )
  }
  return <div className="flex justify-center rounded-md border border-line bg-panel3 py-3"><div className="flex shadow-md">{L.mirror && page(false)}{page(true)}</div></div>
}
