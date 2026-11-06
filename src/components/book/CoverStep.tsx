import { useEffect, useState } from 'react'
import { StaticCanvas, type Textbox, type FabricObject } from 'fabric'
import { Sparkles, ArrowLeft, ArrowRight, ImagePlus, X, Wand2, RefreshCw, BookMarked, Info, LayoutGrid, Pencil, Ruler, Type, FilePlus2, AlertTriangle, Check } from 'lucide-react'
import { useStore } from '../../lib/store'
import { BOOK_CATEGORIES, GRAPHIC_STYLES, PAPERS, TITLE_FONTS, coverSpec } from '../../lib/defaults'
import { readAsDataURL } from '../../lib/importers'
import { aiReady, askClaude } from '../../lib/ai'
import { aiConcepts, buildCover, buildBlankCover, refitCover, localConcepts, proposalsFrom, coverGeometry, applyTitleStyle, TITLE_EFFECTS, renderThumbOf } from '../../graphics/templates'
import { ensureFonts, toJSON } from '../../graphics/setup'
import { generateImages, imageReady, providerLabel, coverArtPrompt, durationHint } from '../../lib/imageGen'
import ImageGenDialog from '../ImageGenDialog'
import type { CoverInfo, DesignDoc } from '../../lib/types'
import { EmptyState, Field, Num, Spinner, Toggle, FileButton, Section, Seg, Modal, Color } from '../ui'
import GraphicEditor from '../editor/GraphicEditor'
import { HelpButton } from '../Help'
import { useLayout } from './useLayout'
import ImportCover from './ImportCover'

export default function CoverStep({ next }: { next: () => void }) {
  const project = useStore((s) => s.project)!
  const update = useStore((s) => s.update)
  const notify = useStore((s) => s.notify)
  const book = project.book!
  const cover = book.cover
  const info = cover.info
  const { res } = useLayout(book)
  const spec = coverSpec(info, book.layout.width, book.layout.height, res?.pages.length || 48, book.layout.bleed)
  const geo = coverGeometry(spec)
  const [busy, setBusy] = useState('')
  const [useAI, setUseAI] = useState(aiReady())
  const [svg, setSvg] = useState(true)
  const [genArt, setGenArt] = useState(!!imageReady())
  const [artPrompt, setArtPrompt] = useState(false)
  const [editing, setEditing] = useState(!!cover.design)
  const [rev, setRev] = useState(0)
  const [dlg, setDlg] = useState<null | 'gabarit' | 'titre'>(null)
  const setInfo = (p: Partial<CoverInfo>) => update((pp) => { Object.assign(pp.book!.cover.info, p) }, { undoable: false })

  const d = cover.design
  const mismatch = !!d?.coverGuides && (Math.abs(d.coverGuides.spine - geo.spinePx) > 0.5 || Math.abs((d.coverGuides.flap || 0) - geo.flap) > 0.5 || Math.abs(d.coverGuides.back - geo.back) > 0.5 || Math.abs(d.coverGuides.bleed - geo.bleed) > 0.5 || Math.abs(d.height - geo.height) > 0.5)

  const applyGeometry = async () => {
    if (!d) return
    setBusy('Réajustement de la couverture…')
    try {
      useStore.getState().snapshot('Couverture avant changement de dimensions')
      const nd = await refitCover(d, spec)
      update((p) => { p.book!.cover.design = nd })
      setRev((r) => r + 1)
      notify(`Couverture réajustée : dos ${spec.spine} mm${spec.flap ? `, rabats ${spec.flap} mm` : ''}.`)
    } catch (e) { notify('Erreur : ' + (e as Error).message) } finally { setBusy('') }
  }

  const applyTypoToDesign = async () => {
    if (!d?.json) return
    setBusy('Application de la typographie…')
    try {
      if (info.titleFont) await ensureFonts([info.titleFont])
      const sc = new StaticCanvas(document.createElement('canvas'), { width: d.width, height: d.height })
      await sc.loadFromJSON(d.json as Record<string, unknown>)
      let n = 0
      for (const o of sc.getObjects()) if ((o as FabricObject & { edRole?: string }).edRole === 'title') { applyTitleStyle(o as Textbox, info, info.title || (o as Textbox).text || ''); n++ }
      const json = toJSON(sc); sc.dispose()
      update((p) => { p.book!.cover.design = { ...d, json } })
      setRev((r) => r + 1)
      notify(n ? 'Typographie du titre appliquée à la couverture.' : 'Aucun titre principal trouvé : sélectionnez le titre dans l’éditeur et utilisez le panneau Typographie.')
    } catch (e) { notify('Erreur : ' + (e as Error).message) } finally { setBusy('') }
  }

  const generate = async () => {
    if (!info.title) { notify('Renseignez au moins le titre du livre.'); return }
    try {
      let concepts = localConcepts(info.category, info.style, info.colors, info.title)
      if (useAI && aiReady()) {
        setBusy('L’IA imagine 4 concepts de couverture…')
        const excerpt = book.blocks.filter((b) => b.type === 'p').slice(0, 12).map((b) => b.text).join(' ').slice(0, 2500)
        concepts = await aiConcepts('cover', `Titre : ${info.title}\nSous-titre : ${info.subtitle}\nAuteur : ${info.author}\nCatégorie : ${info.category}\nPublic : ${info.audience}\nStyle souhaité : ${info.style}\nCouleurs préférées : ${info.colors || 'libre'}\nConsignes : ${info.instructions || 'aucune'}\nPhoto fournie : ${info.images.length ? 'oui (sera utilisée en visuel)' : 'non'}\nExtrait du livre : ${excerpt}`, svg && !info.images.length)
      }
      let arts: (string | null)[] = concepts.map(() => null)
      const prov = imageReady()
      if (genArt && prov && !info.images.length) {
        setBusy(`${providerLabel(prov)} peint les illustrations des 4 couvertures… (${durationHint(prov, 4)})`)
        const excerpt = book.blocks.filter((b) => b.type === 'p').slice(0, 8).map((b) => b.text).join(' ')
        arts = await Promise.all(concepts.map(async (c) => {
          if (c.layout === 'typo') return null
          try {
            const [img] = await generateImages({ prompt: coverArtPrompt({ ...info, concept: `${c.name} — ${c.concept}`, palette: c.palette.slice(0, 4), excerpt }), aspect: c.layout === 'photo' ? '2:3' : '3:4', n: 1, jpeg: true })
            return img
          } catch (e) { notify((e as Error).message); return null }
        }))
      }
      setBusy('Composition des 4 propositions…')
      const props = await proposalsFrom(concepts, (c, i) => buildCover(arts[i] ? { ...info, images: [arts[i]!] } : info, c, spec, i + Date.now() % 97))
      update((p) => { p.book!.cover.proposals = props.map(({ doc, ...pr }) => ({ ...pr, doc: { ...doc, json: null } })); p.book!.cover.selected = -1 })
      notify('4 propositions générées : choisissez-en une pour la personnaliser.')
    } catch (e) { notify('Erreur : ' + (e as Error).message) } finally { setBusy('') }
  }

  const startBlank = async (bg: string) => {
    setBusy('Préparation du gabarit…')
    const r = await buildBlankCover(info, spec, bg)
    const thumb = await renderThumbOf(r.json, r.doc.width, r.doc.height)
    update((p) => { p.book!.cover.design = r.doc; p.book!.cover.selected = -2; p.thumb = thumb })
    setBusy(''); setRev((x) => x + 1); setEditing(true)
    notify('Gabarit vierge prêt : à vous de créer. Les repères indiquent les zones et les plis.')
  }

  const importDone = (doc: DesignDoc, thumb: string) => {
    useStore.getState().snapshot('Couverture avant import')
    update((p) => { p.book!.cover.design = doc; p.book!.cover.selected = -3; p.thumb = thumb })
    setRev((x) => x + 1); setEditing(true)
    notify('Couverture importée sur le gabarit complet (4ᵉ, dos, 1ʳᵉ). Vérifiez les repères de coupe et de pli.')
  }

  const choose = (i: number) => {
    const pr = cover.proposals[i] as typeof cover.proposals[number] & { doc?: DesignDoc }
    const base: DesignDoc = pr.doc ? { ...pr.doc, json: pr.json } : { width: geo.width, height: geo.height, unitsPerMm: 6, bleedMm: spec.bleed, json: pr.json, coverGuides: { back: geo.back, spine: geo.spinePx, front: geo.front, bleed: geo.bleed, flap: geo.flap } }
    update((p) => { p.book!.cover.selected = i; p.book!.cover.design = base; p.thumb = pr.thumb })
    setRev((x) => x + 1); setEditing(true)
  }

  const genBack = async () => {
    setBusy('Rédaction de la 4ᵉ de couverture…')
    try {
      const excerpt = book.blocks.filter((b) => b.text).map((b) => b.text).join('\n').slice(0, 30000)
      const t = await askClaude({ maxTokens: 4000, system: 'Tu es éditeur·rice. Rédige un texte de quatrième de couverture en français (90 à 140 mots), accrocheur, fidèle au contenu, sans divulgâcher la fin. Réponds uniquement avec le texte.', messages: [{ role: 'user', content: `Titre : ${info.title}\nCatégorie : ${info.category}\nPublic : ${info.audience}\n\n${excerpt}` }] })
      setInfo({ backText: t.trim() })
    } catch (e) { notify('IA : ' + (e as Error).message) } finally { setBusy('') }
  }

  const artDialog = artPrompt && <ImageGenDialog title="Illustration de couverture" initialAspect="2:3" initialPrompt={info.title ? coverArtPrompt({ ...info }).split('\n').slice(0, 4).join(' ') : ''} onClose={() => setArtPrompt(false)} onPick={(x) => setInfo({ images: [...info.images, x] })} />
  const summary = `${spec.flap ? `rabat ${spec.flap} · ` : ''}4ᵉ ${spec.trimW} · dos ${spec.spine} · 1ʳᵉ ${spec.trimW}${spec.flap ? ` · rabat ${spec.flap}` : ''} mm — total ${Math.round(spec.totalW * 10) / 10} × ${Math.round(spec.totalH * 10) / 10} mm avec fonds perdus`

  if (editing && d) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel2 px-3 py-1.5 text-[12.5px]">
          <button className="btn" onClick={() => setEditing(false)}><ArrowLeft size={14} /> Couverture</button>
          <button className="btn" onClick={() => setDlg('gabarit')}><Ruler size={14} /> Dimensions, dos, rabats</button>
          <button className="btn" onClick={() => setDlg('titre')}><Type size={14} /> Typographie du titre</button>
          <span className="truncate text-muted max-lg:hidden">{summary}</span>
          <div className="flex-1" />
          {busy && <Spinner label={busy} />}
          <button className="btn-accent" onClick={next}>Finaliser <ArrowRight size={15} /></button>
        </div>
        {mismatch && (
          <div className="flex flex-wrap items-center gap-3 border-b border-warn/25 bg-warn/10 px-4 py-2 text-[12.5px]">
            <AlertTriangle size={15} className="shrink-0 text-warn" />
            <span className="flex-1">Le gabarit a changé (dos {spec.spine} mm{spec.flap ? `, rabats ${spec.flap} mm` : ', sans rabats'}). La couverture affichée utilise encore les anciennes dimensions.</span>
            <button className="btn-accent !h-7" onClick={applyGeometry}><Check size={13} /> Appliquer au design</button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <GraphicEditor key={project.id + '-cover-' + cover.selected + '-' + rev} doc={d} name={(info.title || project.name) + ' — couverture'} kind="cover"
            onSave={(json, thumb, doc) => update((p) => { p.book!.cover.design = { ...doc, json, coverGuides: p.book!.cover.design?.coverGuides || doc.coverGuides }; if (thumb) p.thumb = thumb }, { undoable: false })} />
        </div>
        {dlg === 'gabarit' && <Modal title="Gabarit de couverture" subtitle="Dimensions exactes du dos et des rabats." icon={Ruler} onClose={() => setDlg(null)} footer={<><button className="btn" onClick={() => setDlg(null)}>Fermer</button><button className="btn-accent" disabled={!mismatch} onClick={() => { setDlg(null); void applyGeometry() }}><Check size={14} /> Appliquer au design</button></>}><CoverTemplatePanel info={info} setInfo={setInfo} spec={spec} layoutPages={res?.pages.length || 0} /></Modal>}
        {dlg === 'titre' && <Modal title="Typographie du titre" icon={Type} wide onClose={() => setDlg(null)} footer={<><button className="btn" onClick={() => setDlg(null)}>Fermer</button><button className="btn-accent" onClick={() => { setDlg(null); void applyTypoToDesign() }}><Check size={14} /> Appliquer à la couverture</button></>}><TitleTypoPanel info={info} setInfo={setInfo} /></Modal>}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {artDialog}
      <div className="mx-auto grid max-w-[1320px] gap-6 p-4 md:p-8 lg:grid-cols-[380px_1fr]">
        <div className="card h-fit overflow-hidden">
          <Section title="Informations de couverture" icon={BookMarked}>
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
              <span className="label">Images / illustrations à intégrer sur la 1ʳᵉ de couverture</span>
              <div className="flex flex-wrap gap-2">
                {info.images.map((src, i) => <div key={i} className="relative"><img src={src} className="h-16 w-16 rounded object-cover" /><button className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white" onClick={() => setInfo({ images: info.images.filter((_, j) => j !== i) })}><X size={12} /></button></div>)}
                <FileButton accept="image/*" multiple className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-line hover:border-accent" onFiles={async (f) => setInfo({ images: [...info.images, ...(await Promise.all(f.map(readAsDataURL)))] })}><ImagePlus size={18} /></FileButton>
                <button className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-accent/50 text-[10px] font-medium text-accent hover:bg-accent-soft" data-tip="Générer une illustration (Nano Banana / GPT Image)" onClick={() => setArtPrompt(true)}><Sparkles size={16} />IA</button>
              </div>
            </div>
            <p className="-mt-1 text-[11px] text-subtle">Vous avez une couverture complète déjà faite (4ᵉ + dos + 1ʳᵉ) ? Utilisez la carte « Couverture déjà réalisée » : elle n’est pas recadrée sur la 1ʳᵉ.</p>
            <Field label="Texte de 4ᵉ de couverture"><textarea className="input h-24" value={info.backText} onChange={(e) => setInfo({ backText: e.target.value })} /></Field>
            <button className="btn w-full" disabled={!aiReady() || !!busy} onClick={genBack}><Wand2 size={14} /> Rédiger la 4ᵉ avec l’IA</button>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Éditeur"><input className="input" value={info.publisher} onChange={(e) => setInfo({ publisher: e.target.value })} /></Field>
              <Field label="Prix"><input className="input" value={info.price} placeholder="19,90 €" onChange={(e) => setInfo({ price: e.target.value })} /></Field>
              <Field label="ISBN"><input className="input" value={info.isbn} onChange={(e) => setInfo({ isbn: e.target.value })} /></Field>
            </div>
          </Section>
          <Section title="Gabarit : format, dos, rabats" icon={Ruler} action={<HelpButton topic="dos" />}>
            <CoverTemplatePanel info={info} setInfo={setInfo} spec={spec} layoutPages={res?.pages.length || 0} />
          </Section>
          <Section title="Typographie du titre" icon={Type} action={<HelpButton topic="typo" />} defaultOpen={false}>
            <TitleTypoPanel info={info} setInfo={setInfo} compact />
          </Section>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            <div className="relative overflow-hidden rounded-xl border border-line bg-panel p-5" style={{ boxShadow: 'var(--shadow)' }}>
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
              <div className="relative flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-accent/5 text-accent ring-1 ring-accent/30"><Sparkles size={18} /></span>
                <div className="min-w-0 flex-1"><h2 className="text-[15px] font-semibold">Propositions guidées</h2><p className="mt-0.5 text-[12.5px] text-muted">4 concepts distincts, à personnaliser librement ensuite.</p></div>
              </div>
              <div className="relative mt-3 rounded-lg border border-line bg-panel2 px-3 py-1">
                <Toggle label="Direction artistique IA" checked={useAI && aiReady()} onChange={(v) => setUseAI(v)} />
                {imageReady() ? !info.images.length && <Toggle label={`Illustrations ${providerLabel(imageReady()!)}`} hint="Une image générée par couverture" checked={genArt} onChange={setGenArt} /> : <button className="py-1.5 text-left text-[12px] font-medium text-accent hover:underline" onClick={() => setArtPrompt(true)}>+ Activer un générateur d’images (gratuit possible)</button>}
                {useAI && aiReady() && !info.images.length && !(genArt && imageReady()) && <Toggle label="Illustrations vectorielles IA" checked={svg} onChange={setSvg} />}
              </div>
              <div className="relative mt-3">{busy ? <Spinner label={busy} /> : <button className="btn-accent h-9 w-full" onClick={generate}><Sparkles size={15} /> {cover.proposals.length ? 'Régénérer 4 propositions' : 'Générer 4 propositions'}</button>}</div>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5" style={{ boxShadow: 'var(--shadow)' }}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel3 text-ink"><FilePlus2 size={18} /></span>
                <div className="min-w-0 flex-1"><h2 className="text-[15px] font-semibold">Création libre</h2><p className="mt-0.5 text-[12.5px] text-muted">Un gabarit vierge aux dimensions exactes, sans élément imposé. Vous dessinez tout.</p></div>
                <HelpButton topic="libre" />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[12px] text-muted">Fond</span>
                {['#ffffff', '#f4ecd8', '#13161a', '#13294b', '#6d1a2a', '#0d3b3a'].map((c) => <button key={c} className="h-7 w-7 rounded-md border border-line2 shadow-sm transition hover:scale-110" style={{ background: c }} data-tip={c} onClick={() => void startBlank(c)} disabled={!!busy} />)}
              </div>
              <button className="btn mt-3 h-9 w-full" disabled={!!busy} onClick={() => void startBlank('#ffffff')}><FilePlus2 size={15} /> Partir d’une page blanche</button>
            </div>
            <ImportCover spec={spec} onDone={importDone} disabled={!!busy} />
          </div>
          {!aiReady() && !imageReady() && <div className="flex items-start gap-2 rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-muted"><Info size={14} className="mt-0.5 shrink-0 text-subtle" />Sans clé API, les propositions sont composées par le moteur local. Avec Claude : direction artistique ; avec un générateur d’images (Pollinations gratuit, Nano Banana, GPT Image…) : illustrations générées.</div>}
          {d && <button className="btn w-full justify-start" onClick={() => setEditing(true)}><RefreshCw size={14} /> Reprendre la couverture en cours{mismatch ? ' (dimensions à mettre à jour)' : ''}</button>}
          {cover.proposals.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
          ) : <EmptyState icon={LayoutGrid} title="Aucune proposition pour l’instant" text="Générez quatre concepts, ou partez d’une page blanche pour une création entièrement libre." />}
        </div>
      </div>
    </div>
  )
}

/** Réglages du gabarit de couverture + schéma coté. */
function CoverTemplatePanel({ info, setInfo, spec, layoutPages }: { info: CoverInfo; setInfo: (p: Partial<CoverInfo>) => void; spec: ReturnType<typeof coverSpec>; layoutPages: number }) {
  const mode = info.spineMode || 'auto'
  return (
    <div className="space-y-3">
      <CoverDiagram spec={spec} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nombre de pages" hint={layoutPages ? `Mise en page : ${layoutPages} p.` : undefined}><Num value={info.pageCount || spec.pages} min={4} step={4} onChange={(v) => setInfo({ pageCount: Math.max(0, Math.round(v)) })} /></Field>
        <Field label="Fonds perdus"><Num suffix="mm" step={0.5} value={spec.bleed} onChange={(v) => setInfo({ coverBleed: Math.max(0, v) })} /></Field>
      </div>
      {info.pageCount ? <button className="text-[11.5px] font-medium text-accent hover:underline" onClick={() => setInfo({ pageCount: 0 })}>Revenir au nombre de pages calculé</button> : null}
      <Field label="Largeur du dos"><Seg className="flex w-full" value={mode} onChange={(v) => setInfo({ spineMode: v, spineWidth: v === 'manual' ? spec.spine : info.spineWidth })} options={[{ v: 'auto', label: 'Calculée' }, { v: 'manual', label: 'Saisie manuelle' }]} /></Field>
      {mode === 'auto' ? (
        <Field label="Papier intérieur" hint={`${spec.paperT} mm par feuille → dos de ${spec.autoSpine} mm`}>
          <select className="input" value={info.paper || ''} onChange={(e) => setInfo({ paper: e.target.value || undefined })}>
            <option value="">Personnalisé ({info.paperThickness} mm / feuille)</option>
            {Object.entries(PAPERS).map(([k, p]) => <option key={k} value={k}>{p.label} — {p.t} mm</option>)}
          </select>
        </Field>
      ) : (
        <Field label="Dos (valeur fournie par l’imprimeur)" hint={`Calcul indicatif : ${spec.autoSpine} mm`}><Num suffix="mm" step={0.1} value={info.spineWidth ?? spec.spine} onChange={(v) => setInfo({ spineWidth: Math.max(0, v) })} /></Field>
      )}
      {mode === 'auto' && !info.paper && <Field label="Épaisseur d’une feuille"><Num suffix="mm" step={0.005} value={info.paperThickness} onChange={(v) => v > 0 && setInfo({ paperThickness: v })} /></Field>}
      <div className="flex items-center justify-between"><Toggle label="Couverture à rabats" checked={!!info.flaps} onChange={(v) => setInfo({ flaps: v, flapWidth: info.flapWidth || Math.round(spec.trimW * 0.7) })} /><HelpButton topic="rabats" /></div>
      {info.flaps && (
        <Field label="Largeur de chaque rabat" hint={`Recommandé : ${Math.round(spec.trimW * 0.6)} à ${Math.round(spec.trimW * 0.8)} mm`}>
          <Num suffix="mm" value={spec.flap} onChange={(v) => setInfo({ flapWidth: Math.max(40, Math.min(spec.trimW, v)) })} />
        </Field>
      )}
      {spec.spine < 6 && <p className="rounded-md bg-warn/10 px-2.5 py-1.5 text-[11.5px] text-warn">Dos de {spec.spine} mm : évitez d’y placer du texte (risque de coupe au pli).</p>}
    </div>
  )
}

function CoverDiagram({ spec }: { spec: ReturnType<typeof coverSpec> }) {
  const parts = [
    ...(spec.flap ? [{ l: 'Rabat', w: spec.flap, c: 'bg-ok/15 text-ok' }] : []),
    { l: '4ᵉ', w: spec.trimW, c: 'bg-panel3' }, { l: 'Dos', w: spec.spine, c: 'bg-info/20 text-info' }, { l: '1ʳᵉ', w: spec.trimW, c: 'bg-accent-soft text-accent' },
    ...(spec.flap ? [{ l: 'Rabat', w: spec.flap, c: 'bg-ok/15 text-ok' }] : []),
  ]
  const total = parts.reduce((a, p) => a + p.w, 0)
  return (
    <div className="rounded-lg border border-line bg-panel2 p-2.5">
      <div className="flex h-16 overflow-hidden rounded border border-danger/40" style={{ padding: `${Math.max(2, (spec.bleed / spec.totalH) * 64)}px` }}>
        {parts.map((p, i) => (
          <div key={i} className={`flex min-w-[14px] flex-col items-center justify-center border-r border-dashed border-line2 text-[10px] font-semibold last:border-r-0 ${p.c}`} style={{ width: `${(p.w / total) * 100}%` }}>
            <span className="truncate">{p.l}</span><span className="truncate font-normal opacity-80">{Math.round(p.w * 10) / 10}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-subtle"><span>Fonds perdus {spec.bleed} mm</span><span className="tabular-nums">{Math.round(spec.totalW * 10) / 10} × {Math.round(spec.totalH * 10) / 10} mm</span></div>
    </div>
  )
}

/** Typographie du titre : police, graisse, casse, espacements, couleur, effets. */
function TitleTypoPanel({ info, setInfo, compact }: { info: CoverInfo; setInfo: (p: Partial<CoverInfo>) => void; compact?: boolean }) {
  useEffect(() => { void ensureFonts(TITLE_FONTS) }, [])
  const title = info.title || 'Le titre du roman'
  const shown = info.titleCase === 'upper' ? title.toUpperCase() : info.titleCase === 'lower' ? title.toLowerCase() : title
  const fx: Record<string, React.CSSProperties> = {
    or: { background: 'linear-gradient(180deg,#fff3c4,#e7c06a 45%,#b8862e 70%,#f3d27a)', WebkitBackgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.35))' },
    argent: { background: 'linear-gradient(180deg,#fff,#cfd5dc 45%,#8e98a3 70%,#e6eaee)', WebkitBackgroundClip: 'text', color: 'transparent' },
    degrade: { background: 'linear-gradient(90deg,#ff7a59,#d6406f,#7c4ddb)', WebkitBackgroundClip: 'text', color: 'transparent' },
    contour: { color: 'transparent', WebkitTextStroke: `1.5px ${info.titleColor || '#ffffff'}` },
    ombre: { textShadow: '4px 6px 14px rgba(0,0,0,.6)' },
    relief: { textShadow: '3px 3px 0 rgba(0,0,0,.6)' },
    neon: { color: '#fff', textShadow: '0 0 8px #d6406f, 0 0 22px #d6406f' },
  }
  return (
    <div className={`grid gap-4 ${compact ? '' : 'md:grid-cols-[1fr_300px]'}`}>
      <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#1f2a44] to-[#0f141f] p-5 text-center" style={{ order: compact ? 0 : 2 }}>
        <span style={{ fontFamily: `"${info.titleFont || 'Playfair Display'}"`, fontWeight: info.titleWeight || 700, letterSpacing: `${(info.titleSpacing || 0) / 1000}em`, lineHeight: info.titleLineHeight || 1.05, fontSize: 34 * (info.titleScale || 1), color: info.titleColor || '#ffffff', textAlign: info.titleAlign || 'center', ...(fx[info.titleEffect || ''] || {}) }}>{shown}</span>
      </div>
      <div className="space-y-3">
        <Field label="Police du titre">
          <div className="scroll-thin grid max-h-44 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-line bg-panel2 p-1">
            {TITLE_FONTS.map((f) => <button key={f} className={`truncate rounded px-2 py-1.5 text-left text-[15px] ${info.titleFont === f ? 'bg-accent-soft text-ink ring-1 ring-accent/50' : 'hover:bg-panel3'}`} style={{ fontFamily: `"${f}"` }} onClick={() => setInfo({ titleFont: f })}>{f}</button>)}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Graisse"><select className="input" value={info.titleWeight || ''} onChange={(e) => setInfo({ titleWeight: e.target.value || undefined })}><option value="">Automatique</option><option value="300">Light</option><option value="normal">Regular</option><option value="600">Semibold</option><option value="bold">Bold</option><option value="800">Extrabold</option><option value="900">Black</option></select></Field>
          <Field label="Casse"><Seg className="flex w-full" value={info.titleCase || 'normal'} onChange={(v) => setInfo({ titleCase: v })} options={[{ v: 'normal', label: 'Aa' }, { v: 'upper', label: 'AA' }, { v: 'lower', label: 'aa' }]} /></Field>
          <Field label="Interlettrage (‰ em)"><Num step={10} value={info.titleSpacing ?? 0} onChange={(v) => setInfo({ titleSpacing: v })} /></Field>
          <Field label="Interlignage"><Num step={0.05} value={info.titleLineHeight ?? 1.05} onChange={(v) => v > 0.5 && setInfo({ titleLineHeight: v })} /></Field>
          <Field label="Taille (×)"><Num step={0.05} value={info.titleScale ?? 1} onChange={(v) => v > 0.3 && v < 3 && setInfo({ titleScale: v })} /></Field>
          <Field label="Alignement"><Seg className="flex w-full" value={info.titleAlign || 'center'} onChange={(v) => setInfo({ titleAlign: v })} options={[{ v: 'left', label: 'G' }, { v: 'center', label: 'C' }, { v: 'right', label: 'D' }]} /></Field>
        </div>
        <Field label="Couleur"><Color value={info.titleColor || '#ffffff'} onChange={(v) => setInfo({ titleColor: v })} /></Field>
        <Field label="Effet">
          <div className="flex flex-wrap gap-1">{TITLE_EFFECTS.map((e) => <button key={e.id} className={`chip ${(info.titleEffect || 'none') === e.id ? '!border-accent/60 !bg-accent-soft !text-ink' : ''}`} onClick={() => setInfo({ titleEffect: e.id })}>{e.label}</button>)}</div>
        </Field>
        <button className="text-[11.5px] font-medium text-muted hover:text-ink hover:underline" onClick={() => setInfo({ titleFont: undefined, titleWeight: undefined, titleCase: undefined, titleSpacing: undefined, titleLineHeight: undefined, titleScale: undefined, titleColor: undefined, titleEffect: undefined, titleAlign: undefined })}>Réinitialiser (laisser chaque proposition choisir)</button>
        {compact && <p className="text-[11px] text-subtle">Appliqué aux prochaines propositions. Pour une couverture en cours : bouton « Typographie du titre » dans l’éditeur.</p>}
      </div>
    </div>
  )
}
