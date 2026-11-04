import { useState } from 'react'
import { Sparkles, ArrowLeft, ArrowRight, ImagePlus, X, Wand2, RefreshCw, BookMarked, Info, LayoutGrid, Pencil } from 'lucide-react'
import { useStore } from '../../lib/store'
import { BOOK_CATEGORIES, GRAPHIC_STYLES } from '../../lib/defaults'
import { readAsDataURL } from '../../lib/importers'
import { aiReady, askClaude } from '../../lib/ai'
import { aiConcepts, buildCover, localConcepts, proposalsFrom, coverGeometry } from '../../graphics/templates'
import type { CoverInfo } from '../../lib/types'
import { EmptyState, Field, Num, Spinner, Toggle, FileButton } from '../ui'
import GraphicEditor from '../editor/GraphicEditor'
import { useLayout } from './useLayout'

export default function CoverStep({ next }: { next: () => void }) {
  const project = useStore((s) => s.project)!
  const update = useStore((s) => s.update)
  const notify = useStore((s) => s.notify)
  const book = project.book!
  const cover = book.cover
  const info = cover.info
  const { res } = useLayout(book)
  const pageCount = Math.max(4, Math.ceil((res?.pages.length || 48) / 4) * 4)
  const [busy, setBusy] = useState('')
  const [useAI, setUseAI] = useState(aiReady())
  const [svg, setSvg] = useState(true)
  const [editing, setEditing] = useState(!!cover.design)
  const setInfo = (p: Partial<CoverInfo>) => update((pp) => { Object.assign(pp.book!.cover.info, p) }, { undoable: false })
  const geo = coverGeometry(book.layout.width, book.layout.height, pageCount, info.paperThickness, book.layout.bleed)

  const generate = async () => {
    if (!info.title) { notify('Renseignez au moins le titre du livre.'); return }
    try {
      let concepts = localConcepts(info.category, info.style, info.colors, info.title)
      if (useAI && aiReady()) {
        setBusy('L’IA imagine 4 concepts de couverture…')
        const excerpt = book.blocks.filter((b) => b.type === 'p').slice(0, 12).map((b) => b.text).join(' ').slice(0, 2500)
        concepts = await aiConcepts('cover', `Titre : ${info.title}\nSous-titre : ${info.subtitle}\nAuteur : ${info.author}\nCatégorie : ${info.category}\nPublic : ${info.audience}\nStyle souhaité : ${info.style}\nCouleurs préférées : ${info.colors || 'libre'}\nConsignes : ${info.instructions || 'aucune'}\nPhoto fournie : ${info.images.length ? 'oui (sera utilisée en visuel)' : 'non'}\nExtrait du livre : ${excerpt}`, svg && !info.images.length)
      }
      setBusy('Composition des 4 propositions…')
      const props = await proposalsFrom(concepts, (c, i) => buildCover(info, c, book.layout.width, book.layout.height, pageCount, book.layout.bleed, i + Date.now() % 97))
      update((p) => { p.book!.cover.proposals = props.map(({ doc: _d, ...pr }) => pr); p.book!.cover.selected = -1 })
      notify('4 propositions générées : choisissez-en une pour la personnaliser.')
    } catch (e) { notify('Erreur : ' + (e as Error).message) } finally { setBusy('') }
  }

  const choose = (i: number) => {
    const pr = cover.proposals[i]
    update((p) => {
      p.book!.cover.selected = i
      p.book!.cover.design = { width: geo.width, height: geo.height, unitsPerMm: 6, bleedMm: book.layout.bleed, json: pr.json, coverGuides: { back: geo.back, spine: geo.spinePx, front: geo.front, bleed: geo.bleed } }
      p.thumb = pr.thumb
    })
    setEditing(true)
  }

  const genBack = async () => {
    setBusy('Rédaction de la 4ᵉ de couverture…')
    try {
      const excerpt = book.blocks.filter((b) => b.text).map((b) => b.text).join('\n').slice(0, 30000)
      const t = await askClaude({ maxTokens: 4000, system: 'Tu es éditeur·rice. Rédige un texte de quatrième de couverture en français (90 à 140 mots), accrocheur, fidèle au contenu, sans divulgâcher la fin. Réponds uniquement avec le texte.', messages: [{ role: 'user', content: `Titre : ${info.title}\nCatégorie : ${info.category}\nPublic : ${info.audience}\n\n${excerpt}` }] })
      setInfo({ backText: t.trim() })
    } catch (e) { notify('IA : ' + (e as Error).message) } finally { setBusy('') }
  }

  if (editing && cover.design) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel2 px-3 text-[12.5px]">
          <button className="btn" onClick={() => setEditing(false)}><ArrowLeft size={14} /> Propositions</button>
          <span className="text-muted max-md:hidden">Couverture complète : 4ᵉ ({book.layout.width} mm) · dos ({geo.spine} mm pour {pageCount} pages) · 1ʳᵉ ({book.layout.width} mm) · fonds perdus {book.layout.bleed} mm. Repères bleus = plis du dos, rouges = coupe.</span>
          <div className="flex-1" />
          <button className="btn-accent" onClick={next}>Finaliser <ArrowRight size={15} /></button>
        </div>
        <div className="min-h-0 flex-1">
          <GraphicEditor key={project.id + '-cover-' + cover.selected} doc={cover.design} name={(info.title || project.name) + ' — couverture'} kind="cover"
            onSave={(json, thumb, doc) => update((p) => { p.book!.cover.design = { ...doc, json }; if (thumb) p.thumb = thumb }, { undoable: false })} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1320px] gap-6 p-4 md:p-8 lg:grid-cols-[360px_1fr]">
        <div className="card h-fit space-y-3 overflow-hidden p-4 pt-0">
          <div className="panel-title -mx-4 mb-1"><BookMarked size={14} /> Informations de couverture</div>
          <Field label="Titre *"><input className="input" value={info.title} onChange={(e) => setInfo({ title: e.target.value })} /></Field>
          <Field label="Sous-titre"><input className="input" value={info.subtitle} onChange={(e) => setInfo({ subtitle: e.target.value })} /></Field>
          <Field label="Auteur·rice"><input className="input" value={info.author} onChange={(e) => setInfo({ author: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Catégorie"><select className="input" value={info.category} onChange={(e) => setInfo({ category: e.target.value })}>{BOOK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Public cible"><input className="input" value={info.audience} onChange={(e) => setInfo({ audience: e.target.value })} /></Field>
            <Field label="Style graphique"><select className="input" value={info.style} onChange={(e) => setInfo({ style: e.target.value })}>{GRAPHIC_STYLES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Couleurs préférées"><input className="input" placeholder="bleu marine, or, #ff6600" value={info.colors} onChange={(e) => setInfo({ colors: e.target.value })} /></Field>
          </div>
          <Field label="Consignes particulières"><textarea className="input h-16" value={info.instructions} onChange={(e) => setInfo({ instructions: e.target.value })} placeholder="Ex. : ambiance chaleureuse, mettre en avant le phare…" /></Field>
          <div>
            <span className="label">Images / illustrations à intégrer</span>
            <div className="flex flex-wrap gap-2">
              {info.images.map((src, i) => <div key={i} className="relative"><img src={src} className="h-16 w-16 rounded object-cover" /><button className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white" onClick={() => setInfo({ images: info.images.filter((_, j) => j !== i) })}><X size={12} /></button></div>)}
              <FileButton accept="image/*" multiple className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-line hover:border-accent" onFiles={async (f) => setInfo({ images: [...info.images, ...(await Promise.all(f.map(readAsDataURL)))] })}><ImagePlus size={18} /></FileButton>
            </div>
          </div>
          <Field label="Texte de 4ᵉ de couverture">
            <textarea className="input h-28" value={info.backText} onChange={(e) => setInfo({ backText: e.target.value })} />
          </Field>
          <button className="btn w-full" disabled={!aiReady() || !!busy} onClick={genBack}><Wand2 size={14} /> Rédiger la 4ᵉ avec l’IA</button>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Éditeur"><input className="input" value={info.publisher} onChange={(e) => setInfo({ publisher: e.target.value })} /></Field>
            <Field label="Prix"><input className="input" value={info.price} placeholder="19,90 €" onChange={(e) => setInfo({ price: e.target.value })} /></Field>
            <Field label="ISBN"><input className="input" value={info.isbn} onChange={(e) => setInfo({ isbn: e.target.value })} /></Field>
            <Field label="Épaisseur papier (mm / feuille)"><Num value={info.paperThickness} step={0.005} onChange={(v) => v > 0 && setInfo({ paperThickness: v })} /></Field>
          </div>
          <p className="text-xs text-muted">Dos calculé : <b>{geo.spine} mm</b> pour {pageCount} pages (papier 80 g ≈ 0,1 mm/feuille).</p>
        </div>

        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border border-line bg-panel" style={{ boxShadow: 'var(--shadow)' }}>
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative flex flex-wrap items-center gap-4 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-accent/5 text-accent ring-1 ring-accent/30"><BookMarked size={20} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-semibold tracking-tight">Générateur de couvertures</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">4 concepts visuellement distincts : 1ʳᵉ, dos et 4ᵉ, prêts pour l’impression et le numérique.</p>
              </div>
              <div className="min-w-56 rounded-lg border border-line bg-panel2 px-3 py-1"><Toggle label="Direction artistique IA" checked={useAI && aiReady()} onChange={(v) => setUseAI(v)} />
                {useAI && aiReady() && !info.images.length && <Toggle label="Illustrations vectorielles IA" checked={svg} onChange={setSvg} />}</div>
              {busy ? <Spinner label={busy} /> : <button className="btn-accent h-9 px-4" onClick={generate}><Sparkles size={15} /> {cover.proposals.length ? 'Régénérer' : 'Générer 4 propositions'}</button>}
            </div>
          </div>
          {!aiReady() && <div className="flex items-start gap-2 rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-muted"><Info size={14} className="mt-0.5 shrink-0 text-subtle" />Sans clé API, les propositions sont composées par le moteur local (palettes, typographies et motifs adaptés à la catégorie). Avec Claude : direction artistique et illustrations générées.</div>}
          {cover.proposals.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {cover.proposals.map((p, i) => (
              <div key={p.id} className={`group overflow-hidden rounded-xl border bg-panel transition hover:-translate-y-0.5 ${cover.selected === i ? 'border-accent ring-2 ring-accent/25' : 'border-line hover:border-line2'}`} style={{ boxShadow: 'var(--shadow)' }}>
                <div className="canvas-bg relative flex aspect-[16/10] items-center justify-center p-5">
                  <img src={p.thumb} className="paper-shadow max-h-full max-w-full rounded-[2px]" />
                  <span className="absolute left-3 top-3 flex h-6 min-w-6 items-center justify-center rounded-md bg-black/60 px-1.5 text-[11px] font-bold text-white backdrop-blur">{i + 1}</span>
                  <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/50 via-transparent to-transparent pb-4 opacity-0 transition group-hover:opacity-100">
                    <button className="btn-accent shadow-lg" onClick={() => choose(i)}><Pencil size={14} /> Personnaliser</button>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-t border-line p-3.5">
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold">{p.name}</div><div className="mt-0.5 text-[12px] leading-snug text-muted">{p.concept}</div></div>
                  <button className="btn !h-7 !px-2.5 text-[12px]" onClick={() => choose(i)}>Ouvrir</button>
                </div>
              </div>
            ))}
          </div>
          ) : <EmptyState icon={LayoutGrid} title="Aucune proposition pour l’instant" text="Renseignez les informations à gauche, puis générez quatre concepts distincts." />}
          {cover.design && <button className="btn" onClick={() => setEditing(true)}><RefreshCw size={14} /> Reprendre la couverture en cours</button>}
        </div>
      </div>
    </div>
  )
}
