import { useEffect, useRef, useState } from 'react'
import { Send, X, Sparkles, Bot } from 'lucide-react'
import { useStore } from '../lib/store'
import { aiReady, askClaude, extractJSON } from '../lib/ai'
import { runCorrection, printReady, generateCovers, generatePosters, patchLayout } from '../lib/actions'
import { editorBridge, DESIGN_SYSTEM_PROMPT, type DesignOp } from './editor/GraphicEditor'
import type { CorrectionMode, ProjectKind } from '../lib/types'
import { STEPS } from './book/steps'
import { Markdown } from './ui'

interface Msg { role: 'user' | 'assistant'; text: string }
type Action = { type: string; [k: string]: unknown }

const EXAMPLES = ['Crée une couverture moderne pour ce manuel scolaire.', 'Propose quatre affiches différentes pour cet événement.', 'Corrige les erreurs de ce chapitre sans changer le sens.', 'Améliore la typographie de cette affiche.', 'Prépare ce livre pour une impression professionnelle.', 'Crée un sommaire automatique à partir de mes chapitres.', 'Réorganise cette page pour obtenir une meilleure hiérarchie visuelle.']

function context() {
  const s = useStore.getState()
  const p = s.project
  const ctx: Record<string, unknown> = { vue: s.view.name, projet: p ? { type: p.kind, nom: p.name } : null }
  if (p?.book) {
    const b = p.book
    ctx.livre = { etape: STEPS[p.step].label, titre: b.cover.info.title, auteur: b.cover.info.author, categorie: b.cover.info.category, blocs: b.blocks.length, chapitres: b.blocks.filter((x) => x.type === 'h1').map((x) => x.text).slice(0, 40), suggestionsEnAttente: b.suggestions.filter((x) => x.status === 'pending').length, mise_en_page: b.layout, couvertureConcue: !!b.cover.design, propositionsCouverture: b.cover.proposals.length }
  }
  if (p?.poster) ctx.affiche = { brief: { ...p.poster.brief, images: p.poster.brief.images.length }, format: p.poster.format, propositions: p.poster.proposals.length, editeurOuvert: !!editorBridge.current }
  ctx.editeurGraphiqueOuvert = !!editorBridge.current
  return JSON.stringify(ctx)
}

const SYSTEM = `Tu es l'assistant de création d'EDICREA AI, une suite de mise en page, correction éditoriale, couvertures, affiches et studio graphique. Tu parles français. L'IA propose, l'utilisateur décide : tu n'agis que sur ce qui est demandé.
Tu peux déclencher des actions de l'application. Réponds UNIQUEMENT avec un objet JSON : {"reply": "réponse en Markdown, courte", "actions": [...]}
Actions disponibles :
- {"type":"navigate","view":"dashboard"|"new"|"books"|"posters"|"covers"|"templates"|"library"|"settings"}
- {"type":"create_project","kind":"book"|"poster"|"design","name":"..."}
- {"type":"goto_step","step":0-5}  (0 Importer, 1 Corriger, 2 Composer, 3 Mise en page, 4 Couverture, 5 Finaliser)
- {"type":"correct","mode":"simple"|"pro"|"editorial"}  (crée des suggestions à valider, ne modifie jamais le texte)
- {"type":"toc"}  (active le sommaire automatique)
- {"type":"layout","patch":{...LayoutSettings partiel : columns, marginTop, bleed, header, pageNumbers, chapterOnRecto...}}
- {"type":"print_ready"}
- {"type":"cover_info","patch":{title, subtitle, author, category, audience, style, colors, instructions, backText}}
- {"type":"generate_covers"}
- {"type":"poster_brief","patch":{description, title, subtitle, date, place, contact, kind, style, colors}}
- {"type":"generate_posters"}
- {"type":"generate_image","prompt":"description visuelle détaillée, sans texte","aspect":"1:1"|"2:3"|"3:4"|"4:3"|"16:9"|"9:16","target":"editor"|"cover"|"poster"}  (crée une image avec Nano Banana ou GPT Image : l'insère dans l'éditeur ouvert, ou l'ajoute aux images de la couverture / de l'affiche)
- {"type":"design","instruction":"..."}  (modifie le document ouvert dans l'éditeur graphique : typographie, composition, couleurs…)
N'utilise que les actions pertinentes pour le contexte. Si une action est impossible (ex. pas de projet ouvert), explique comment faire ou crée le projet.`

export default function Assistant() {
  const open = useStore((s) => s.assistantOpen)
  const setOpen = useStore((s) => s.setAssistant)
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', text: 'Bonjour ! Je comprends le contexte de votre document et j’agis uniquement sur ce que vous demandez. Que voulez-vous créer ?' }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { void endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const exec = async (actions: Action[]): Promise<string[]> => {
    const s = useStore.getState()
    const done: string[] = []
    for (const a of actions) {
      try {
        switch (a.type) {
          case 'navigate': { const v = String(a.view); const map: Record<string, Parameters<typeof s.go>[0]> = { dashboard: { name: 'dashboard' }, new: { name: 'new' }, books: { name: 'list', filter: 'book' }, posters: { name: 'list', filter: 'poster' }, covers: { name: 'list', filter: 'cover' }, templates: { name: 'templates' }, library: { name: 'library' }, settings: { name: 'settings' } }; if (map[v]) s.go(map[v]); done.push('Navigation'); break }
          case 'create_project': await s.createProject((a.kind as ProjectKind) || 'book', String(a.name || 'Nouveau projet')); done.push('Projet créé'); break
          case 'goto_step': s.update((p) => { p.step = Math.max(0, Math.min(5, Number(a.step))) }, { undoable: false }); done.push('Étape ' + STEPS[Math.max(0, Math.min(5, Number(a.step)))].label); break
          case 'correct': { const n = await runCorrection((a.mode as CorrectionMode) || 'simple'); done.push(`${n} suggestion(s) de correction à valider`); break }
          case 'toc': patchLayout({ toc: true }); s.update((p) => { p.step = 3 }, { undoable: false }); done.push('Sommaire automatique activé'); break
          case 'layout': patchLayout(a.patch as object); done.push('Mise en page ajustée'); break
          case 'print_ready': printReady(); done.push('Réglages d’impression appliqués'); break
          case 'cover_info': s.update((p) => { if (p.book) Object.assign(p.book.cover.info, a.patch) }); done.push('Informations de couverture mises à jour'); break
          case 'generate_covers': await generateCovers(); done.push('4 propositions de couverture générées'); break
          case 'poster_brief': s.update((p) => { if (p.poster) Object.assign(p.poster.brief, a.patch) }); done.push('Brief d’affiche mis à jour'); break
          case 'generate_posters': await generatePosters(); done.push('4 propositions d’affiche générées'); break
          case 'generate_image': {
            const { generateImages, imageReady } = await import('../lib/imageGen')
            if (!imageReady()) { done.push('⚠ Ajoutez une clé Nano Banana (Google) ou GPT Image (OpenAI) dans Paramètres'); break }
            const [img] = await generateImages({ prompt: String(a.prompt || ''), aspect: (a.aspect as '1:1') || '1:1', n: 1 })
            const target = String(a.target || (editorBridge.current ? 'editor' : s.project?.kind === 'poster' ? 'poster' : 'cover'))
            if (target === 'editor' && editorBridge.current) { await editorBridge.current.insertImage(img); done.push('Image générée et insérée dans le document') }
            else if (s.project?.book) { s.update((p) => { p.book!.cover.info.images.push(img); p.step = 4 }); done.push('Image générée et ajoutée aux images de la couverture') }
            else if (s.project?.poster) { s.update((p) => { p.poster!.brief.images.push(img) }); done.push('Image générée et ajoutée au brief de l’affiche') }
            else { s.addAsset({ name: 'Image IA', type: 'image', data: img }); done.push('Image générée et enregistrée dans la bibliothèque') }
            break
          }
          case 'design': {
            if (!editorBridge.current) { done.push('⚠ Ouvrez d’abord un document dans l’éditeur graphique'); break }
            const txt = await askClaude({ maxTokens: 16000, system: DESIGN_SYSTEM_PROMPT, messages: [{ role: 'user', content: `Demande : ${a.instruction}\n\nÉtat du document :\n${editorBridge.current.summary()}` }] })
            const r = extractJSON<{ ops: DesignOp[]; explanation: string }>(txt)
            const n = await editorBridge.current.applyOps(r.ops || [])
            done.push(`${n} modification(s) graphique(s) — ${r.explanation || ''}`)
            break
          }
        }
      } catch (e) { done.push('⚠ ' + (e as Error).message) }
    }
    return done
  }

  /** Interprétation locale (sans clé API) des demandes courantes. */
  const local = async (q: string): Promise<string> => {
    const t = q.toLowerCase()
    const s = useStore.getState()
    const kind = s.project?.kind
    const acts: Action[] = []
    if (/(génère|genere|crée|cree|dessine|fais|produis)[^.]*\b(image|illustration|photo|visuel|dessin)/.test(t)) acts.push({ type: 'generate_image', prompt: q, aspect: /couverture|portrait|livre/.test(t) ? '2:3' : /bannière|paysage|youtube/.test(t) ? '16:9' : '1:1' })
    else if (/couverture/.test(t)) { if (kind !== 'book') return 'Ouvrez ou créez un projet de **livre** pour générer des couvertures (Nouveau projet → Livre).'; acts.push({ type: 'generate_covers' }) }
    else if (/affiche/.test(t) && /(propos|cré|génèr|fais)/.test(t)) { if (kind !== 'poster') { await s.createProject('poster', 'Nouvelle affiche'); s.update((p) => { p.poster!.brief.description = q }); } acts.push({ type: 'generate_posters' }) }
    else if (/sommaire|table des mati/.test(t)) acts.push({ type: 'toc' })
    else if (/impression|imprim/.test(t)) acts.push({ type: 'print_ready' })
    else if (/corrig|faute|orthograph/.test(t)) acts.push({ type: 'correct', mode: /pro/.test(t) ? 'pro' : /révis|cohéren|structure/.test(t) ? 'editorial' : 'simple' })
    else if (/colonne/.test(t)) { const n = parseInt(t.match(/(\d)\s*colonne/)?.[1] || '2'); acts.push({ type: 'layout', patch: { columns: n } }) }
    else if (/typograph|hiérarchie|réorganis|composition/.test(t)) return 'Ces améliorations graphiques demandent l’IA : ajoutez une clé API Claude dans **Paramètres**. En attendant, utilisez les outils d’alignement et le panneau Typographie de l’éditeur.'
    else return 'Sans clé API Claude, je comprends les demandes courantes : *corriger*, *sommaire*, *impression*, *couverture*, *affiche*, *colonnes*, *génère une image de…*. Ajoutez une clé API Claude dans **Paramètres** pour un assistant complet.'
    const done = await exec(acts)
    return done.map((d) => '✓ ' + d).join('\n\n')
  }

  const send = async (q: string) => {
    if (!q.trim() || busy) return
    setInput('')
    const next = [...msgs, { role: 'user' as const, text: q }]
    setMsgs(next)
    setBusy(true)
    try {
      if (!aiReady()) { setMsgs([...next, { role: 'assistant', text: await local(q) }]); return }
      const history = next.slice(-12).map((m) => ({ role: m.role, content: m.text }))
      history[history.length - 1] = { role: 'user', content: `Contexte de l'application : ${context()}\n\nDemande : ${q}` }
      const txt = await askClaude({ maxTokens: 8000, system: SYSTEM, messages: history[0].role === 'assistant' ? history.slice(1) : history })
      let reply = txt, actions: Action[] = []
      try { const r = extractJSON<{ reply: string; actions: Action[] }>(txt); reply = r.reply; actions = r.actions || [] } catch { /* réponse texte simple */ }
      setMsgs([...next, { role: 'assistant', text: reply + (actions.length ? '\n\n_Exécution…_' : '') }])
      if (actions.length) {
        const done = await exec(actions)
        setMsgs([...next, { role: 'assistant', text: reply + '\n\n' + done.map((d) => '✓ ' + d).join('\n\n') }])
      }
    } catch (e) { setMsgs([...next, { role: 'assistant', text: '⚠ ' + (e as Error).message }]) } finally { setBusy(false) }
  }

  if (!open) return null
  const ctxLabel = (() => { const st = useStore.getState(); const p = st.project; if (!p) return 'Espace de travail'; return p.kind === 'book' ? `Livre · ${p.name} · ${STEPS[p.step].label}` : p.kind === 'poster' ? `Affiche · ${p.name}` : `Création · ${p.name}` })()
  return (
    <div className="anim-fade flex w-[380px] shrink-0 flex-col border-l border-line bg-panel max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:pt-[env(safe-area-inset-top)] max-md:pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#8d6a2f] text-accent-ink"><Sparkles size={14} /></span>
        <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold">Assistant de création</div><div className="truncate text-[11px] text-subtle">{aiReady() ? 'Claude · ' : 'Mode local · '}{ctxLabel}</div></div>
        <button className="btn-icon" onClick={() => setOpen(false)}><X size={15} /></button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {msgs.map((m, i) => m.role === 'user' ? (
          <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-accent-ink"><Markdown text={m.text} /></div></div>
        ) : (
          <div key={i} className="flex gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-panel3 text-accent"><Bot size={13} /></span>
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-panel2 px-3.5 py-2.5"><Markdown text={m.text} /></div>
          </div>
        ))}
        {busy && <div className="flex gap-2.5"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-panel3 text-accent"><Bot size={13} /></span><div className="flex items-center gap-1 rounded-2xl border border-line bg-panel2 px-4 py-3">{[0, 1, 2].map((k) => <span key={k} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: k * 0.15 + 's' }} />)}</div></div>}
        {msgs.length < 3 && (
          <div className="pt-1">
            <div className="eyebrow mb-2">Suggestions</div>
            <div className="space-y-1.5">{EXAMPLES.map((e) => <button key={e} className="flex w-full items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-left text-[12.5px] transition hover:border-accent/60 hover:bg-panel2" onClick={() => void send(e)}><Sparkles size={12} className="mt-0.5 shrink-0 text-accent" />{e}</button>)}</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); void send(input) }}>
        <div className="rounded-xl border border-line bg-panel2 transition focus-within:border-accent">
          <textarea className="block max-h-40 min-h-[64px] w-full resize-none bg-transparent px-3 py-2.5 text-[13px] outline-none placeholder:text-subtle" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }} placeholder="Décrivez ce que vous voulez créer ou modifier…" />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[11px] text-subtle">{aiReady() ? 'Entrée pour envoyer · Maj+Entrée : nouvelle ligne' : 'Mode local : commandes simples'}</span>
            <button className="btn-accent !h-7 !px-2.5" disabled={busy || !input.trim()}><Send size={13} /></button>
          </div>
        </div>
      </form>
    </div>
  )
}
