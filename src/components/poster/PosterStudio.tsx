import { useState } from 'react'
import { Sparkles, ArrowLeft, ImagePlus, X, Wand2, Image as ImageIcon, LayoutGrid, Pencil, FileText } from 'lucide-react'
import { useStore } from '../../lib/store'
import { GRAPHIC_STYLES, POSTER_FORMATS, POSTER_KINDS } from '../../lib/defaults'
import { readAsDataURL } from '../../lib/importers'
import { aiReady, askClaude, extractJSON } from '../../lib/ai'
import { aiConcepts, buildPoster, localConcepts, proposalsFrom } from '../../graphics/templates'
import type { PosterData } from '../../lib/types'
import { EmptyState, Field, Spinner, Toggle, FileButton } from '../ui'
import GraphicEditor from '../editor/GraphicEditor'

export default function PosterStudio() {
  const project = useStore((s) => s.project)!
  const update = useStore((s) => s.update)
  const notify = useStore((s) => s.notify)
  const poster = project.poster!
  const B = poster.brief
  const [busy, setBusy] = useState('')
  const [useAI, setUseAI] = useState(aiReady())
  const [svg, setSvg] = useState(true)
  const [editing, setEditing] = useState(!!poster.design)
  const setB = (p: Partial<PosterData['brief']>) => update((pp) => { Object.assign(pp.poster!.brief, p) }, { undoable: false })

  const extract = async () => {
    setBusy('Analyse de la description…')
    try {
      const t = await askClaude({ maxTokens: 3000, system: 'Extrait les informations d’une demande d’affiche. Réponds UNIQUEMENT en JSON : {"title": titre accrocheur court, "subtitle": sous-titre ou slogan, "date": date et heure, "place": lieu, "contact": contact / site / prix, "kind": un parmi ' + POSTER_KINDS.join(', ') + ', "style": un parmi ' + GRAPHIC_STYLES.join(', ') + ', "colors": couleurs suggérées}. Champs inconnus : "".', messages: [{ role: 'user', content: B.description }] })
      const r = extractJSON<Partial<PosterData['brief']>>(t)
      setB(Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'string' && v)))
    } catch (e) { notify('IA : ' + (e as Error).message) } finally { setBusy('') }
  }

  const localExtract = () => {
    const d = B.description
    const date = d.match(/\b(\d{1,2}(er)?\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)(\s+\d{4})?|\d{1,2}\/\d{1,2}(\/\d{2,4})?)(\s*(à|,)?\s*\d{1,2}\s*h\s*\d{0,2})?/i)?.[0]
    const place = d.match(/\b(salle|théâtre|gymnase|stade|parc|place|espace|centre|maison|mairie|église|cathédrale|musée|hôtel)\b[^,.;\n]{2,50}/i)?.[0] || d.match(/\b(?:à|au)\s+([A-ZÉÈ][\w'’-]+(?:\s+[A-ZÉÈ][\w'’-]+)*)/)?.[1]
    const price = d.match(/(entrée|tarif|prix)[^,.;\n]*\d+[^,.;\n]*(€|euros?)|gratuit/i)?.[0]
    const first = d.split(/[,.!\n]/)[0].trim()
    setB({ title: B.title || first.slice(0, 50), date: B.date || date || '', place: B.place || place || '', contact: B.contact || price || '' })
  }

  const generate = async () => {
    if (!B.title && !B.description) { notify('Décrivez votre affiche ou indiquez un titre.'); return }
    try {
      if (!B.title) { if (useAI && aiReady()) await extract(); else localExtract() }
      const brief = useStore.getState().project!.poster!
      let concepts = localConcepts(brief.brief.kind.includes('scol') ? 'Manuel scolaire' : 'default', brief.brief.style, brief.brief.colors, brief.brief.title)
      if (useAI && aiReady()) {
        setBusy('L’IA imagine 4 concepts d’affiche…')
        concepts = await aiConcepts('poster', `Type : ${brief.brief.kind}\nDescription : ${brief.brief.description}\nTitre : ${brief.brief.title}\nSous-titre : ${brief.brief.subtitle}\nDate : ${brief.brief.date}\nLieu : ${brief.brief.place}\nContact : ${brief.brief.contact}\nStyle : ${brief.brief.style}\nCouleurs : ${brief.brief.colors || 'libre'}\nFormat : ${POSTER_FORMATS[brief.format].label}\nPhoto fournie : ${brief.brief.images.length ? 'oui' : 'non'}`, svg && !brief.brief.images.length)
      }
      setBusy('Composition des propositions…')
      const props = await proposalsFrom(concepts, (c, i) => buildPoster(brief, c, i + 3))
      update((p) => { p.poster!.proposals = props.map((x) => ({ id: x.id, name: x.name, concept: x.concept, json: x.json, thumb: x.thumb }))})
      notify('4 propositions générées.')
    } catch (e) { notify('Erreur : ' + (e as Error).message) } finally { setBusy('') }
  }

  const choose = (i: number) => {
    const f = POSTER_FORMATS[poster.format]
    const k = f.px ? 1 : 3, bleed = f.px ? 0 : 3
    update((p) => { p.poster!.design = { width: (f.w + bleed * 2) * k, height: (f.h + bleed * 2) * k, unitsPerMm: f.px ? 0 : k, bleedMm: bleed, json: poster.proposals[i].json }; p.thumb = poster.proposals[i].thumb })
    setEditing(true)
  }

  if (editing && poster.design) return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel2 px-3 text-[12.5px]">
        <button className="btn" onClick={() => setEditing(false)}><ArrowLeft size={14} /> Brief et propositions</button>
        <span className="text-muted">{POSTER_FORMATS[poster.format]?.label}{poster.design.bleedMm ? ` · fonds perdus ${poster.design.bleedMm} mm (repères rouges)` : ''}</span>
      </div>
      <div className="min-h-0 flex-1">
        <GraphicEditor key={project.id + poster.design.width} doc={poster.design} name={project.name} kind="poster" onSave={(json, thumb, doc) => update((p) => { p.poster!.design = { ...doc, json }; if (thumb) p.thumb = thumb }, { undoable: false })} />
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1320px] gap-6 p-8 lg:grid-cols-[380px_1fr]">
        <div className="card h-fit space-y-3 overflow-hidden p-4 pt-0">
          <div className="panel-title -mx-4 mb-1"><FileText size={14} /> Brief de l’affiche</div>
          <Field label="Décrivez votre affiche"><textarea className="input h-28" value={B.description} onChange={(e) => setB({ description: e.target.value })} placeholder="Ex. : Concert de jazz au profit de l’école, samedi 14 juin à 20 h, salle des fêtes de Lyon, entrée 10 €, ambiance chaleureuse et festive." /></Field>
          <button className="btn w-full" disabled={!B.description || !!busy} onClick={() => (aiReady() ? void extract() : localExtract())}><Wand2 size={14} /> Remplir les champs depuis la description</button>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type"><select className="input" value={B.kind} onChange={(e) => setB({ kind: e.target.value })}>{POSTER_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Style"><select className="input" value={B.style} onChange={(e) => setB({ style: e.target.value })}>{GRAPHIC_STYLES.map((k) => <option key={k}>{k}</option>)}</select></Field>
          </div>
          <Field label="Titre"><input className="input" value={B.title} onChange={(e) => setB({ title: e.target.value })} /></Field>
          <Field label="Sous-titre / slogan"><input className="input" value={B.subtitle} onChange={(e) => setB({ subtitle: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date"><input className="input" value={B.date} onChange={(e) => setB({ date: e.target.value })} /></Field>
            <Field label="Lieu"><input className="input" value={B.place} onChange={(e) => setB({ place: e.target.value })} /></Field>
          </div>
          <Field label="Contact / prix / site"><input className="input" value={B.contact} onChange={(e) => setB({ contact: e.target.value })} /></Field>
          <Field label="Couleurs"><input className="input" value={B.colors} placeholder="violet, jaune…" onChange={(e) => setB({ colors: e.target.value })} /></Field>
          <Field label="Format (impression ou réseaux sociaux)"><select className="input" value={poster.format} onChange={(e) => update((p) => { p.poster!.format = e.target.value }, { undoable: false })}>{Object.entries(POSTER_FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select></Field>
          <div>
            <span className="label">Photos / logos</span>
            <div className="flex flex-wrap gap-2">
              {B.images.map((src, i) => <div key={i} className="relative"><img src={src} className="h-16 w-16 rounded object-cover" /><button className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white" onClick={() => setB({ images: B.images.filter((_, j) => j !== i) })}><X size={12} /></button></div>)}
              <FileButton accept="image/*" multiple className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-line hover:border-accent" onFiles={async (f) => setB({ images: [...B.images, ...(await Promise.all(f.map(readAsDataURL)))] })}><ImagePlus size={18} /></FileButton>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border border-line bg-panel" style={{ boxShadow: 'var(--shadow)' }}>
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative flex flex-wrap items-center gap-4 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-accent/5 text-accent ring-1 ring-accent/30"><ImageIcon size={20} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-semibold tracking-tight">Studio d’affiches</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">Jusqu’à 4 propositions à partir de votre description, toutes entièrement personnalisables.</p>
              </div>
              <div className="min-w-56 rounded-lg border border-line bg-panel2 px-3 py-1"><Toggle label="Direction artistique IA" checked={useAI && aiReady()} onChange={setUseAI} />
                {useAI && aiReady() && !B.images.length && <Toggle label="Illustrations vectorielles IA" checked={svg} onChange={setSvg} />}</div>
              {busy ? <Spinner label={busy} /> : <button className="btn-accent h-9 px-4" onClick={generate}><Sparkles size={15} /> {poster.proposals.length ? 'Régénérer' : 'Générer 4 propositions'}</button>}
            </div>
          </div>
          {poster.proposals.length > 0 ? (
          <div className="grid grid-cols-2 2xl:grid-cols-4 gap-4">
            {poster.proposals.map((p, i) => (
              <div key={p.id} className={`group overflow-hidden rounded-xl border bg-panel transition hover:-translate-y-0.5 ${false ? 'border-accent ring-2 ring-accent/25' : 'border-line hover:border-line2'}`} style={{ boxShadow: 'var(--shadow)' }}>
                <div className="canvas-bg relative flex aspect-[3/4] items-center justify-center p-5">
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
          {poster.design && <button className="btn" onClick={() => setEditing(true)}>Reprendre l’affiche en cours</button>}
        </div>
      </div>
    </div>
  )
}
