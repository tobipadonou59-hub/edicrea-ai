import { useMemo, useRef, useState } from 'react'
import { Check, X, CheckCheck, Sparkles, GitCompare, FileSearch, ArrowRight, Wand2, Pencil, RotateCcw, Info, SpellCheck } from 'lucide-react'
import { useStore } from '../../lib/store'
import { localCorrect, aiCorrect, applySuggestion, diffWords, localEditorialReport, aiEditorialReport, aiRephrase } from '../../lib/corrector'
import { aiReady } from '../../lib/ai'
import { uid } from '../../lib/defaults'
import type { Block, CorrectionMode, Suggestion } from '../../lib/types'
import { EmptyState, Markdown, Modal, Seg, Spinner, Toggle } from '../ui'

const MODES: { id: CorrectionMode; label: string; desc: string }[] = [
  { id: 'simple', label: '1. Correction simple', desc: 'Orthographe, grammaire, conjugaison, accords, ponctuation — le style de l’auteur est intact.' },
  { id: 'pro', label: '2. Correction professionnelle', desc: 'Corrections + qualité rédactionnelle : répétitions, lourdeurs, fluidité, typographie française.' },
  { id: 'editorial', label: '3. Révision éditoriale', desc: 'Analyse de la structure, de la cohérence entre chapitres et de la fluidité du manuscrit.' },
]
const CAT_COLOR: Record<string, string> = { orthographe: '#e5484d', grammaire: '#f76b15', ponctuation: '#ffb224', typographie: '#3e9bff', style: '#8e4ec6', répétition: '#d6409f', cohérence: '#12a594', reformulation: '#30a46c' }

export default function CorrectStep({ next }: { next: () => void }) {
  const project = useStore((s) => s.project)!
  const update = useStore((s) => s.update)
  const notify = useStore((s) => s.notify)
  const book = project.book!
  const [busy, setBusy] = useState('')
  const [useAI, setUseAI] = useState(aiReady())
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [cat, setCat] = useState('')
  const [compare, setCompare] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const [rephrase, setRephrase] = useState<{ block: Block; text: string } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const docRef = useRef<HTMLDivElement>(null)

  const analyse = async () => {
    const mode = book.correctionMode
    setBusy('Analyse locale…')
    const local = localCorrect(book.blocks, mode)
    let ai: Suggestion[] = []
    try {
      if (useAI && aiReady()) {
        abort.current = new AbortController()
        ai = await aiCorrect(book.blocks, mode, (d, t) => setBusy(`Correction IA — lot ${Math.min(d + 1, t)}/${t}…`), abort.current.signal)
      }
      let report = book.editorialReport
      if (mode === 'editorial') { setBusy('Rapport de révision éditoriale…'); report = useAI && aiReady() ? await aiEditorialReport(book.blocks) : localEditorialReport(book.blocks) }
      // dédoublonnage : l'IA prime sur les règles locales quand elles se chevauchent
      const merged = [...ai]
      for (const s of local) if (!ai.some((a) => a.blockId === s.blockId && s.start < a.start + a.original.length && a.start < s.start + s.original.length)) merged.push(s)
      update((p) => { p.book!.suggestions = [...p.book!.suggestions.filter((s) => s.status !== 'pending'), ...merged]; p.book!.editorialReport = report })
      notify(`${merged.length} suggestion(s) — rien n’est modifié tant que vous n’acceptez pas.`)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') notify('Erreur IA : ' + (e as Error).message + ' — suggestions locales conservées.')
      update((p) => { p.book!.suggestions = [...p.book!.suggestions.filter((s) => s.status !== 'pending'), ...local] })
    } finally { setBusy('') }
  }

  const accept = (ids: string[]) => update((p) => { for (const id of ids) { const s = p.book!.suggestions.find((x) => x.id === id); if (s && s.original !== s.replacement) applySuggestion(p.book!.blocks, p.book!.suggestions, id); else if (s) s.status = 'accepted' } })
  const reject = (ids: string[]) => update((p) => { for (const s of p.book!.suggestions) if (ids.includes(s.id)) s.status = 'rejected' })
  const edit = (id: string, rep: string) => update((p) => { const s = p.book!.suggestions.find((x) => x.id === id); if (s) s.replacement = rep }, { undoable: false })

  const list = book.suggestions.filter((s) => (filter === 'all' || s.status === 'pending') && (!cat || s.category === cat))
  const pending = book.suggestions.filter((s) => s.status === 'pending')
  const cats = useMemo(() => { const m: Record<string, number> = {}; pending.forEach((s) => (m[s.category] = (m[s.category] || 0) + 1)); return m }, [pending])
  const byBlock = useMemo(() => { const m = new Map<string, Suggestion[]>(); pending.forEach((s) => { const a = m.get(s.blockId) || []; a.push(s); m.set(s.blockId, a) }); return m }, [pending])

  const scrollTo = (s: Suggestion) => { setFocus(s.id); document.getElementById('sg-' + s.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* Document */}
      <div className="flex min-w-0 flex-1 flex-col max-lg:min-h-[80vh]">
        <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
          <Seg value={book.correctionMode} onChange={(v) => update((p) => { p.book!.correctionMode = v }, { undoable: false })} options={MODES.map((m) => ({ v: m.id, label: m.label.replace(/^\d\. /, ''), tip: m.desc }))} />
          <span className="divider-v" />
          <label className={`flex items-center gap-2 text-[12.5px] ${aiReady() ? '' : 'opacity-50'}`} data-tip={aiReady() ? 'Correction par Claude en plus des règles locales' : 'Ajoutez une clé API dans Paramètres'}>
            <Toggle label="" checked={useAI && aiReady()} onChange={(v) => aiReady() && setUseAI(v)} /><span className="-ml-1">IA Claude</span>
          </label>
          <div className="flex-1" />
          <button className={`btn ${compare ? '!border-accent/50 !bg-accent-soft !text-accent' : ''}`} onClick={() => setCompare(!compare)}><GitCompare size={14} /> Comparer</button>
          {busy ? <><Spinner label={busy} /><button className="btn" onClick={() => abort.current?.abort()}>Arrêter</button></> : <button className="btn-accent" onClick={analyse}><Sparkles size={14} /> Analyser le manuscrit</button>}
        </div>
        <div className="flex items-center gap-2 border-b border-line bg-panel2 px-4 py-1.5 text-[12px] text-muted"><Info size={13} className="shrink-0 text-subtle" />{MODES.find((m) => m.id === book.correctionMode)?.desc} Cliquez un passage souligné pour voir la suggestion ; sélectionnez du texte pour le faire reformuler.</div>
        <div ref={docRef} className="canvas-bg min-h-0 flex-1 overflow-y-auto px-3 py-5 md:px-6 md:py-8" onMouseUp={() => {
          const s = window.getSelection()
          const t = s?.toString().trim()
          const el = s?.anchorNode?.parentElement?.closest('[data-block]') as HTMLElement | null
          if (t && t.length > 8 && el) { const b = book.blocks.find((x) => x.id === el.dataset.block); if (b) setRephrase({ block: b, text: t }) }
        }}>
          <div className="paper-shadow mx-auto max-w-[760px] space-y-3 rounded-[2px] bg-white px-6 py-8 md:px-16 md:py-14 text-[15px] leading-[1.7] text-[#1d1d1f]" style={{ fontFamily: 'EdSerif, Georgia, serif' }}>
            {book.blocks.map((b) => compare ? <CompareBlock key={b.id} b={b} orig={book.originalBlocks.find((o) => o.id === b.id)} /> : (
              <BlockView key={b.id} b={b} sugg={byBlock.get(b.id) || []} focus={focus} onPick={scrollTo} />
            ))}
          </div>
          {book.correctionMode === 'editorial' && book.editorialReport && (
            <div className="card mx-auto my-6 max-w-[760px] p-6"><h3 className="mb-2 flex items-center gap-2 font-semibold"><FileSearch size={16} /> Rapport de révision éditoriale</h3><Markdown text={book.editorialReport} /></div>
          )}
        </div>
      </div>

      {/* Suggestions */}
      <div className="flex w-full shrink-0 flex-col border-line bg-panel max-lg:border-t lg:w-[380px] lg:border-l">
        <div className="panel-title justify-between"><span className="flex items-center gap-2"><SpellCheck size={14} /> Suggestions <span className="rounded-full bg-panel3 px-1.5 text-[10.5px] tabular-nums text-muted">{pending.length}</span></span>
          <Seg value={filter} onChange={setFilter} options={[{ v: 'pending', label: 'En attente' }, { v: 'all', label: 'Toutes' }]} />
        </div>
        <div className="space-y-2.5 border-b border-line p-3">
          {book.suggestions.length > 0 && (() => { const done = book.suggestions.filter((x) => x.status !== 'pending').length; const pct = Math.round((done / book.suggestions.length) * 100); return (
            <div><div className="mb-1 flex justify-between text-[11px] text-muted"><span>{done} / {book.suggestions.length} traitées</span><span className="tabular-nums">{pct} %</span></div><div className="h-1.5 overflow-hidden rounded-full bg-panel3"><div className="h-full rounded-full bg-ok transition-all" style={{ width: pct + '%' }} /></div></div>
          ) })()}
          <div className="flex flex-wrap gap-1">
            <button className={`chip ${!cat ? '!border-accent/60 !text-ink' : ''}`} onClick={() => setCat('')}>Toutes</button>
            {Object.entries(cats).map(([k, n]) => <button key={k} className={`chip ${cat === k ? '!border-accent/60 !text-ink' : ''}`} onClick={() => setCat(cat === k ? '' : k)}><span className="h-1.5 w-1.5 rounded-full" style={{ background: CAT_COLOR[k] }} />{k}<span className="tabular-nums text-subtle">{n}</span></button>)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" disabled={!list.some((s) => s.status === 'pending')} onClick={() => accept(list.filter((s) => s.status === 'pending' && s.original !== s.replacement).map((s) => s.id))}><CheckCheck size={14} /> Tout accepter</button>
            <button className="btn" disabled={!list.some((s) => s.status === 'pending')} onClick={() => reject(list.filter((s) => s.status === 'pending').map((s) => s.id))}><X size={14} /> Tout refuser</button>
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto bg-panel2 p-3">
          {!list.length && <EmptyState icon={book.suggestions.length ? CheckCheck : SpellCheck} title={book.suggestions.length ? 'Tout est traité' : 'Aucune analyse'} text={book.suggestions.length ? 'Aucune suggestion en attente.' : 'Lancez l’analyse pour obtenir des suggestions de correction.'} />}
          {list.map((s) => <SuggestionCard key={s.id} s={s} focus={focus === s.id} onFocus={() => { setFocus(s.id); document.querySelector(`[data-sg="${s.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} accept={() => accept([s.id])} reject={() => reject([s.id])} edit={(v) => edit(s.id, v)} />)}
        </div>
        <div className="border-t border-line p-3">
          <button className="btn-accent w-full" onClick={next}>Continuer : Composer <ArrowRight size={15} /></button>
        </div>
      </div>

      {rephrase && <RephraseDialog r={rephrase} onClose={() => setRephrase(null)} onPropose={(rep) => {
        update((p) => { const b = p.book!.blocks.find((x) => x.id === rephrase.block.id)!; const start = b.text.indexOf(rephrase.text); if (start >= 0) p.book!.suggestions.unshift({ id: uid(), blockId: b.id, start, original: rephrase.text, replacement: rep, reason: 'Reformulation demandée', category: 'reformulation', status: 'pending', source: 'ia' }) })
        setRephrase(null); notify('Reformulation ajoutée aux suggestions : acceptez-la ou refusez-la.')
      }} />}
    </div>
  )
}

function BlockView({ b, sugg, focus, onPick }: { b: Block; sugg: Suggestion[]; focus: string | null; onPick: (s: Suggestion) => void }) {
  const cls = b.type === 'h1' ? 'text-2xl font-bold mt-6' : b.type === 'h2' ? 'text-xl font-semibold mt-4' : b.type === 'h3' ? 'text-lg font-semibold' : b.type === 'quote' ? 'italic pl-6 border-l-2 border-[#d8d2c4] text-[#444]' : b.type === 'li' ? 'pl-5 list-item list-disc ml-4' : b.type === 'box' ? 'rounded bg-[#f3efe6] p-3' : 'indent-6 text-justify'
  if (b.type === 'image') return b.src ? <img src={b.src} className="mx-auto max-h-60" /> : null
  if (b.type === 'pagebreak') return <hr className="border-dashed border-line" />
  if (b.type === 'table') return <pre className="overflow-x-auto rounded bg-panel2 p-2 text-xs">{b.text}</pre>
  const sorted = [...sugg].sort((a, c) => a.start - c.start)
  const parts: React.ReactNode[] = []
  let pos = 0
  for (const s of sorted) {
    if (s.start < pos || b.text.substr(s.start, s.original.length) !== s.original) continue
    parts.push(b.text.slice(pos, s.start))
    parts.push(<mark key={s.id} data-sg={s.id} onClick={() => onPick(s)} className={`cursor-pointer rounded-sm bg-transparent text-inherit ${focus === s.id ? 'ring-2 ring-accent' : ''}`} style={{ borderBottom: `2px solid ${CAT_COLOR[s.category] || '#888'}`, background: (CAT_COLOR[s.category] || '#888') + '22' }}>{s.original}</mark>)
    pos = s.start + s.original.length
  }
  parts.push(b.text.slice(pos))
  return <div data-block={b.id} className={cls}>{parts}</div>
}

function CompareBlock({ b, orig }: { b: Block; orig?: Block }) {
  if (!orig) return <div className="rounded bg-green-500/10 p-1"><ins className="diff">{b.text}</ins></div>
  if (orig.text === b.text) return <div className={b.type.startsWith('h') ? 'font-bold' : ''}>{b.text}</div>
  return <div className={b.type.startsWith('h') ? 'font-bold' : ''}>{diffWords(orig.text, b.text).map((d, i) => d.t === 'eq' ? <span key={i}>{d.s}</span> : d.t === 'ins' ? <ins key={i} className="diff">{d.s}</ins> : <del key={i} className="diff">{d.s}</del>)}</div>
}

function SuggestionCard({ s, focus, onFocus, accept, reject, edit }: { s: Suggestion; focus: boolean; onFocus: () => void; accept: () => void; reject: () => void; edit: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const advisory = s.original === s.replacement
  return (
    <div id={'sg-' + s.id} onClick={onFocus} className={`relative cursor-pointer overflow-hidden rounded-lg border bg-panel p-3 pl-3.5 text-[13px] transition ${focus ? 'border-accent shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line hover:border-line2'} ${s.status !== 'pending' ? 'opacity-55' : ''}`}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: CAT_COLOR[s.category] }} />
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="font-semibold uppercase tracking-wider" style={{ color: CAT_COLOR[s.category] }}>{s.category}</span>
        <span className="chip !h-5 !px-1.5 !text-[10px]">{s.source === 'ia' ? <><Sparkles size={9} /> IA</> : 'Règle'}{s.status !== 'pending' ? ` · ${s.status === 'accepted' ? 'acceptée' : 'refusée'}` : ''}</span>
      </div>
      {advisory ? <div className="rounded bg-panel2 p-1.5 text-xs italic">« {s.original.slice(0, 160)}{s.original.length > 160 ? '…' : ''} »</div> : editing ? (
        <textarea className="input h-20 text-xs" defaultValue={s.replacement} onBlur={(e) => { edit(e.target.value); setEditing(false) }} autoFocus />
      ) : (
        <div className="rounded-md bg-panel2 px-2.5 py-2 leading-relaxed" style={{ whiteSpace: 'pre-wrap', fontFamily: 'EdSerif, Georgia, serif' }}>
          {diffWords(s.original, s.replacement).map((d, i) => d.t === 'eq' ? <span key={i}>{d.s}</span> : d.t === 'ins' ? <ins key={i} className="diff">{d.s.replace(/ /g, '⍽').replace(/ /g, '⍽')}</ins> : <del key={i} className="diff">{d.s}</del>)}
        </div>
      )}
      <p className="mt-1.5 text-[12px] text-muted">{s.reason}</p>
      {s.status === 'pending' && (
        <div className="mt-2.5 flex gap-1.5">
          {!advisory && <button className="btn !h-7 !border-ok/40 !bg-ok/10 !px-2.5 text-[12px] !text-ok" onClick={(e) => { e.stopPropagation(); accept() }}><Check size={13} /> Accepter</button>}
          <button className="btn !h-7 !px-2.5 text-[12px]" onClick={(e) => { e.stopPropagation(); reject() }}><X size={13} /> {advisory ? 'Ignorer' : 'Refuser'}</button>
          {!advisory && <button className="btn-ghost !h-7 text-[12px] text-muted" onClick={(e) => { e.stopPropagation(); setEditing(true) }}><Pencil size={12} /> Modifier</button>}
          {advisory && <button className="btn !h-7 !px-2.5 text-[12px]" onClick={(e) => { e.stopPropagation(); accept() }}><Check size={13} /> Vu</button>}
        </div>
      )}
    </div>
  )
}

function RephraseDialog({ r, onClose, onPropose }: { r: { block: Block; text: string }; onClose: () => void; onPropose: (t: string) => void }) {
  const [instr, setInstr] = useState('Améliore la fluidité sans changer le sens')
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => { setBusy(true); try { setOut(await aiRephrase(r.text, instr)) } catch (e) { setOut('Erreur : ' + (e as Error).message) } finally { setBusy(false) } }
  return (
    <Modal title="Reformuler le passage" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn-accent" disabled={!out || busy} onClick={() => onPropose(out)}><Check size={14} /> Ajouter comme suggestion</button></>}>
      <div className="space-y-3 text-sm">
        <div className="rounded bg-panel2 p-2 font-serif">{r.text}</div>
        <div className="flex gap-2">
          <input className="input" value={instr} onChange={(e) => setInstr(e.target.value)} />
          <button className="btn-accent" onClick={run} disabled={busy || !aiReady()}>{busy ? <Spinner /> : <Wand2 size={14} />} Proposer</button>
        </div>
        <div className="flex flex-wrap gap-1">{['Plus concis', 'Plus soutenu', 'Plus simple (jeunesse)', 'Plus vivant', 'Ton professionnel'].map((x) => <button key={x} className="btn !py-0.5 text-xs" onClick={() => setInstr(x)}>{x}</button>)}</div>
        {!aiReady() && <p className="text-xs text-muted">La reformulation nécessite une clé API Claude (Paramètres).</p>}
        {out && <div className="rounded border border-accent/50 p-2 font-serif"><div className="mb-1 flex items-center gap-1 text-xs text-muted"><RotateCcw size={12} /> Comparaison</div>{diffWords(r.text, out).map((d, i) => d.t === 'eq' ? <span key={i}>{d.s}</span> : d.t === 'ins' ? <ins key={i} className="diff">{d.s}</ins> : <del key={i} className="diff">{d.s}</del>)}</div>}
      </div>
    </Modal>
  )
}
