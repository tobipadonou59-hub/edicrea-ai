import { useState } from 'react'
import { ArrowRight, Printer, ZoomIn, ZoomOut, BookOpen, Square, Columns3, ListTree, Hash, Frame, Scissors, AlertTriangle, LayoutTemplate, RefreshCw, Pencil, Trash2, Save, ArrowLeftRight, AlignLeft, FileText } from 'lucide-react'
import { useStore } from '../../lib/store'
import { BOOK_FORMATS, LAYOUT_GABARITS, UNITS, toUnit, fromUnit, withLayoutDefaults, uid } from '../../lib/defaults'
import type { LayoutSettings, PageNumbering, StyleSheet } from '../../lib/types'
import { HelpButton } from '../Help'
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
  const X = withLayoutDefaults(L)
  const N = X.numbering
  const setN = (p: Partial<PageNumbering>) => set({ numbering: { ...N, ...p } })
  const u = X.unit
  const { templates, addTemplate, removeTemplate, updateTemplate, settings, setSettings } = useStore()
  const myGabarits = templates.filter((t) => t.kind === 'layout')
  const custom = settings.customFormats || []
  const groups = [...new Set(Object.values(BOOK_FORMATS).map((f) => f.group || 'Autres'))]
  const tocCount = res?.toc.length ?? 0
  const applyGabarit = (name: string, layout: Partial<LayoutSettings>, styles?: (s: StyleSheet) => void) => {
    useStore.getState().snapshot(`Avant le gabarit « ${name} »`)
    update((pp) => { Object.assign(pp.book!.layout, structuredClone(layout)); if (styles) styles(pp.book!.styles) })
    notify(`Gabarit « ${name} » appliqué (version précédente enregistrée).`)
  }

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
      <div className="flex w-full shrink-0 flex-col border-line bg-panel max-lg:order-2 max-lg:border-t lg:w-[320px] lg:border-r">
        <div className="panel-title"><Columns3 size={14} /> Mise en page</div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <Section title="Gabarits" icon={LayoutTemplate} action={<HelpButton topic="gabarits" />}>
            <div className="grid grid-cols-2 gap-1.5">
              {LAYOUT_GABARITS.map((g) => (
                <button key={g.id} data-tip={g.desc} onClick={() => applyGabarit(g.name, g.layout, g.styles)} className="rounded-md border border-line bg-panel2 px-2 py-1.5 text-left text-[12px] font-medium hover:border-accent/60">{g.name}</button>
              ))}
            </div>
            {myGabarits.length > 0 && <div className="eyebrow pt-1">Mes gabarits</div>}
            {myGabarits.map((t) => (
              <div key={t.id} className="group flex items-center gap-1 rounded-md border border-line bg-panel2 px-2 py-1">
                <button className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium" onClick={() => { const j = t.json as { layout: LayoutSettings; styles: StyleSheet }; applyGabarit(t.name, j.layout, (s) => Object.assign(s, structuredClone(j.styles))) }}>{t.name}</button>
                <button className="btn-icon !h-6 !w-6" data-tip="Mettre à jour avec la mise en page actuelle" onClick={() => { updateTemplate(t.id, { json: { layout: structuredClone(L), styles: structuredClone(book.styles) } }); notify(`Gabarit « ${t.name} » mis à jour.`) }}><RefreshCw size={12} /></button>
                <button className="btn-icon !h-6 !w-6" data-tip="Renommer" onClick={() => { const n = prompt('Nom du gabarit', t.name); if (n) updateTemplate(t.id, { name: n }) }}><Pencil size={12} /></button>
                <button className="btn-icon !h-6 !w-6" data-tip="Supprimer" onClick={() => { if (confirm(`Supprimer le gabarit « ${t.name} » ?`)) removeTemplate(t.id) }}><Trash2 size={12} /></button>
              </div>
            ))}
            <button className="btn w-full" onClick={() => { const n = prompt('Nom du nouveau gabarit', `Gabarit ${L.width} × ${L.height}`); if (n) addTemplate({ name: n, kind: 'layout', json: { layout: structuredClone(L), styles: structuredClone(book.styles) }, width: L.width, height: L.height }) }}><Save size={14} /> Enregistrer comme gabarit</button>
          </Section>

          <Section title="Format du livre" icon={BookOpen} action={<HelpButton topic="format" />}>
            <select className="input" value={BOOK_FORMATS[L.format] || custom.some((c) => c.id === L.format) ? L.format : 'custom'} onChange={(e) => {
              const v = e.target.value; const f = BOOK_FORMATS[v]; const c = custom.find((x) => x.id === v)
              if (f) set({ format: v, width: f.w, height: f.h }); else if (c) set({ format: c.id, width: c.w, height: c.h }); else set({ format: 'custom' })
            }}>
              {groups.map((g) => <optgroup key={g} label={g}>{Object.entries(BOOK_FORMATS).filter(([, f]) => f.group === g).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</optgroup>)}
              {custom.length > 0 && <optgroup label="Mes formats">{custom.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.w} × {c.h} mm)</option>)}</optgroup>}
              <option value="custom">Format personnalisé…</option>
            </select>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Num prefix="L" suffix={u} step={UNITS[u].step} value={toUnit(L.width, u)} onChange={(v) => { const mm = fromUnit(v, u); if (mm >= 40 && mm <= 1200) set({ width: Math.round(mm * 100) / 100, format: 'custom' }) }} />
              <Num prefix="H" suffix={u} step={UNITS[u].step} value={toUnit(L.height, u)} onChange={(v) => { const mm = fromUnit(v, u); if (mm >= 40 && mm <= 1200) set({ height: Math.round(mm * 100) / 100, format: 'custom' }) }} />
              <button className="btn-icon !h-8 !w-8 border border-line" data-tip="Portrait ⇄ paysage" onClick={() => set({ width: L.height, height: L.width, format: 'custom' })}><ArrowLeftRight size={14} /></button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-muted">Unité</span>
              <Seg className="flex flex-1" value={u} onChange={(v) => set({ unit: v })} options={(['mm', 'cm', 'in', 'pt'] as const).map((k) => ({ v: k, label: k === 'in' ? 'po' : k }))} />
            </div>
            <div className="flex items-center justify-between text-[11.5px] text-subtle">
              <span>{L.width > L.height ? 'Paysage' : L.width === L.height ? 'Carré' : 'Portrait'} · rapport {(L.height / L.width).toFixed(2)}</span>
              {L.format === 'custom' && <button className="font-medium text-accent hover:underline" onClick={() => { const n = prompt('Nom de ce format', `Mon format ${L.width} × ${L.height}`); if (n) { const id = 'c-' + uid(); setSettings({ customFormats: [...custom, { id, name: n, w: L.width, h: L.height }] }); set({ format: id }); notify('Format ajouté à « Mes formats ».') } }}>Enregistrer ce format</button>}
              {custom.some((c) => c.id === L.format) && <button className="font-medium text-danger hover:underline" onClick={() => { setSettings({ customFormats: custom.filter((c) => c.id !== L.format) }); set({ format: 'custom' }) }}>Supprimer ce format</button>}
            </div>
          </Section>

          <Section title="Marges" icon={Square}>
            <MarginDiagram L={L} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Haut"><Num suffix={u} step={UNITS[u].step} value={toUnit(L.marginTop, u)} onChange={(v) => set({ marginTop: Math.max(3, fromUnit(v, u)) })} /></Field>
              <Field label="Bas"><Num suffix={u} step={UNITS[u].step} value={toUnit(L.marginBottom, u)} onChange={(v) => set({ marginBottom: Math.max(3, fromUnit(v, u)) })} /></Field>
              <Field label={L.mirror ? 'Petit fond (intérieur)' : 'Gauche'}><Num suffix={u} step={UNITS[u].step} value={toUnit(L.marginInner, u)} onChange={(v) => set({ marginInner: Math.max(3, fromUnit(v, u)) })} /></Field>
              <Field label={L.mirror ? 'Grand fond (extérieur)' : 'Droite'}><Num suffix={u} step={UNITS[u].step} value={toUnit(L.marginOuter, u)} onChange={(v) => set({ marginOuter: Math.max(3, fromUnit(v, u)) })} /></Field>
            </div>
            <Toggle label="Pages en vis-à-vis" hint="Marges miroir recto / verso" checked={L.mirror} onChange={(v) => set({ mirror: v })} />
          </Section>

          <Section title="Colonnes et fonds perdus" icon={Columns3} defaultOpen={false}>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Colonnes"><Num value={L.columns} min={1} max={4} onChange={(v) => set({ columns: Math.max(1, Math.min(4, Math.round(v))) })} /></Field>
              <Field label="Gouttière"><Num suffix="mm" value={L.gutter} onChange={(v) => set({ gutter: Math.max(0, v) })} /></Field>
              <Field label="Fonds perdus"><Num suffix="mm" value={L.bleed} step={0.5} onChange={(v) => set({ bleed: Math.max(0, v) })} /></Field>
            </div>
            <p className="text-[11px] text-subtle">Justification : {Math.round(contentW * 10) / 10} mm{L.columns > 1 ? ` · colonne ${Math.round(((contentW - L.gutter * (L.columns - 1)) / L.columns) * 10) / 10} mm` : ''}</p>
          </Section>

          <Section title="Sommaire / table des matières" icon={ListTree} action={<HelpButton topic="sommaire" />}>
            <Toggle label="Générer automatiquement" hint={`${tocCount} titre(s) retenu(s)`} checked={L.toc} onChange={(v) => set({ toc: v })} />
            {L.toc && <>
              <Field label="Titre"><input className="input" value={L.tocTitle} onChange={(e) => set({ tocTitle: e.target.value })} /></Field>
              <div className="flex flex-wrap gap-1">{['Sommaire', 'Table des matières', 'Au sommaire', 'Contents'].map((t) => <button key={t} className={`chip ${L.tocTitle === t ? '!border-accent/60 !text-ink' : ''}`} onClick={() => set({ tocTitle: t })}>{t}</button>)}</div>
              <Field label="Position"><Seg className="flex w-full" value={X.tocPosition} onChange={(v) => set({ tocPosition: v, tocTitle: L.tocTitle === 'Sommaire' && v === 'end' ? 'Table des matières' : L.tocTitle === 'Table des matières' && v === 'start' ? 'Sommaire' : L.tocTitle })} options={[{ v: 'start', label: 'Début du livre' }, { v: 'end', label: 'Fin du livre' }]} /></Field>
              <Field label="Niveaux de titres"><Seg className="flex w-full" value={String(X.tocDepth)} onChange={(v) => set({ tocDepth: +v as 1 | 2 | 3 })} options={[{ v: '1', label: 'Chapitres', tip: 'Titres 1' }, { v: '2', label: '+ sections', tip: 'Titres 1 et 2' }, { v: '3', label: '+ sous-sections', tip: 'Titres 1 à 3' }]} /></Field>
              <Field label="Entre le titre et le numéro"><Seg className="flex w-full" value={X.tocLeader} onChange={(v) => set({ tocLeader: v })} options={[{ v: 'dots', label: '. . .' }, { v: 'dashes', label: '– – –' }, { v: 'line', label: '——' }, { v: 'none', label: 'Rien' }]} /></Field>
              <div className="grid grid-cols-2 items-end gap-2">
                <Field label="Taille du texte"><Num suffix="pt" step={0.5} value={X.tocFontSize || book.styles.p.size} onChange={(v) => v >= 6 && set({ tocFontSize: v })} /></Field>
                <Toggle label="Numéros" checked={X.tocShowNumbers} onChange={(v) => set({ tocShowNumbers: v })} />
              </div>
              <p className="text-[11px] leading-snug text-subtle">Exclure un titre ou raccourcir son libellé : étape Composer, survolez le titre puis « Sommaire ».</p>
            </>}
          </Section>

          <Section title="Numérotation des pages" icon={Hash} action={<HelpButton topic="numerotation" />}>
            <Toggle label="Afficher les numéros" checked={L.pageNumbers && L.footer} onChange={(v) => set({ pageNumbers: v, footer: v })} />
            {L.pageNumbers && L.footer && <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Style"><select className="input" value={N.style} onChange={(e) => setN({ style: e.target.value as PageNumbering['style'] })}><option value="arabic">1, 2, 3</option><option value="roman">i, ii, iii</option><option value="ROMAN">I, II, III</option><option value="alpha">a, b, c</option><option value="ALPHA">A, B, C</option></select></Field>
                <Field label="Commencer à"><Num value={L.startNumberAt} min={0} onChange={(v) => set({ startNumberAt: Math.round(v) })} /></Field>
              </div>
              <Field label="Format" hint="{n} = numéro · {total} = nombre de pages"><input className="input font-mono" value={N.format} onChange={(e) => setN({ format: e.target.value || '{n}' })} /></Field>
              <div className="flex flex-wrap gap-1">{['{n}', '— {n} —', '· {n} ·', 'Page {n}', '{n} / {total}', '[ {n} ]'].map((f) => <button key={f} className={`chip font-mono ${N.format === f ? '!border-accent/60 !text-ink' : ''}`} onClick={() => setN({ format: f })}>{f.replace('{n}', '12').replace('{total}', '240')}</button>)}</div>
              <Field label="Position"><Seg className="flex w-full" value={N.position} onChange={(v) => setN({ position: v })} options={[{ v: 'outer', label: 'Extérieur' }, { v: 'center', label: 'Centre' }, { v: 'inner', label: 'Intérieur' }]} /></Field>
              <Seg className="flex w-full" value={N.vertical} onChange={(v) => setN({ vertical: v })} options={[{ v: 'bottom', label: 'Pied de page' }, { v: 'top', label: 'Tête de page' }]} />
              <Field label="La page 1 est…"><Seg className="flex w-full" value={N.countFrom} onChange={(v) => setN({ countFrom: v })} options={[{ v: 'first', label: 'la page de titre' }, { v: 'body', label: 'le début du texte' }]} /></Field>
              <Toggle label="Pages liminaires en chiffres romains" hint="Titre, sommaire, préface : i, ii, iii" checked={N.frontRoman} onChange={(v) => setN({ frontRoman: v })} />
              <Toggle label="Masquer sur les ouvertures de chapitre" checked={N.hideOnOpeners} onChange={(v) => setN({ hideOnOpeners: v })} />
              <Toggle label="Numéroter les pages liminaires" checked={N.showOnFront} onChange={(v) => setN({ showOnFront: v })} />
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Field label="Taille et couleur"><div className="flex gap-2"><Num suffix="pt" step={0.5} value={N.size} onChange={(v) => v >= 5 && setN({ size: v })} /><input type="color" className="h-8 w-10 shrink-0 cursor-pointer rounded border border-line" value={N.color} onChange={(e) => setN({ color: e.target.value })} /></div></Field>
                <button className={`btn !h-8 !w-9 !px-0 font-bold ${N.bold ? '!border-accent/60 !bg-accent-soft' : ''}`} data-tip="Gras" onClick={() => setN({ bold: !N.bold })}>G</button>
              </div>
            </>}
          </Section>

          <Section title="Veuves et orphelines" icon={AlignLeft} action={<HelpButton topic="veuves" />}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Orphelines" hint="lignes min. en bas"><Num value={X.orphans} min={1} max={5} onChange={(v) => set({ orphans: Math.max(1, Math.min(5, Math.round(v))) })} /></Field>
              <Field label="Veuves" hint="lignes min. en haut"><Num value={X.widows} min={1} max={5} onChange={(v) => set({ widows: Math.max(1, Math.min(5, Math.round(v))) })} /></Field>
            </div>
            <div className="flex gap-1">{[['Désactivé', 1], ['Standard', 2], ['Strict', 3]].map(([l, n]) => <button key={l} className={`chip flex-1 justify-center ${X.orphans === n && X.widows === n ? '!border-accent/60 !text-ink' : ''}`} onClick={() => set({ orphans: +n, widows: +n })}>{l}</button>)}</div>
            <Toggle label="Garder les titres avec le texte" hint="Jamais de titre seul en bas de page" checked={X.keepWithNext} onChange={(v) => set({ keepWithNext: v })} />
            {res?.controlled !== undefined && <p className="rounded-md bg-panel2 px-2.5 py-1.5 text-[11.5px] text-muted"><b className="text-ink">{res.controlled}</b> correction(s) appliquée(s) dans ce livre.</p>}
          </Section>

          <Section title="Pages spéciales et en-têtes" icon={FileText} defaultOpen={false}>
            <Toggle label="Page de titre" checked={L.titlePage} onChange={(v) => set({ titlePage: v })} />
            <Toggle label="Chaque chapitre sur une nouvelle page" checked={L.chapterNewPage} onChange={(v) => set({ chapterNewPage: v })} />
            {L.chapterNewPage && <Toggle label="Les chapitres (niveau 2) commencent aussi une nouvelle page" hint="Pour les romans divisés en parties" checked={!!L.h2NewPage} onChange={(v) => set({ h2NewPage: v })} />}
            <Toggle label="Chapitres en belle page" hint="Recto, pages blanches insérées" checked={L.chapterOnRecto} onChange={(v) => set({ chapterOnRecto: v })} />
            <Toggle label="Titre courant (en-tête)" checked={L.header} onChange={(v) => set({ header: v })} />
            {L.header && <div className="grid grid-cols-2 gap-2">
              <Field label="Page de gauche"><input className="input" value={X.headerVerso} onChange={(e) => set({ headerVerso: e.target.value, headerText: e.target.value })} /></Field>
              <Field label="Page de droite"><input className="input" value={X.headerRecto} onChange={(e) => set({ headerRecto: e.target.value })} /></Field>
            </div>}
            {L.header && <p className="text-[11px] text-subtle">Variables : {'{titre}'} {'{auteur}'} {'{chapitre}'} {'{page}'}</p>}
          </Section>
        </div>
        <div className="space-y-2 border-t border-line p-3">
          <button className="btn w-full" onClick={printReady}><Printer size={15} /> Préparer pour l’impression</button>
          <button className="btn-accent w-full" onClick={next}>Continuer : Couverture <ArrowRight size={15} /></button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col max-lg:min-h-[75vh]">
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
          {busy ? <Spinner label="Pagination…" /> : <span className="flex items-center gap-3 text-[12.5px]"><span><b className="tabular-nums">{pages.length}</b> <span className="text-muted">pages</span></span><span className="divider-v" />{(() => { const nParts = book.blocks.filter((b) => b.type === 'h1').length, nCh = book.blocks.filter((b) => b.type === 'h2').length; return L.h2NewPage && nCh ? <span><b className="tabular-nums">{nParts}</b> <span className="text-muted">parties ·</span> <b className="tabular-nums">{nCh}</b> <span className="text-muted">chapitres</span></span> : <span><b className="tabular-nums">{nParts}</b> <span className="text-muted">chapitres</span></span> })()}<span className="divider-v" /><span className="text-muted">{L.width} × {L.height} mm</span></span>}
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
