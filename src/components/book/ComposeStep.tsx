import { useMemo, useState } from 'react'
import { ArrowRight, ArrowUp, ArrowDown, Trash2, Plus, ImagePlus, ListTree, Wand2, Heading, MessageSquare, Type } from 'lucide-react'
import { useStore } from '../../lib/store'
import { uid, defaultStyles } from '../../lib/defaults'
import { readAsDataURL } from '../../lib/importers'
import { aiReady, askClaude, extractJSON } from '../../lib/ai'
import type { Block, BlockType, StyleSheet, TextStyle } from '../../lib/types'
import { Color, Field, Num, Spinner, Toggle, FileButton } from '../ui'
import { cssFamily } from '../../lib/layout'
import { detectStructure, describeStructure, kindOf } from '../../lib/structure'
import { applyStructureLayout } from '../../lib/actions'
import ImageGenDialog from '../ImageGenDialog'

const TYPE_LABEL: Record<BlockType, string> = { h1: 'Titre 1 (chapitre)', h2: 'Titre 2', h3: 'Titre 3', p: 'Paragraphe', quote: 'Citation', li: 'Liste à puces', box: 'Encadré', image: 'Image', table: 'Tableau', pagebreak: 'Saut de page' }
const STYLE_KEYS = ['h1', 'h2', 'h3', 'p', 'quote', 'li', 'box'] as const

export default function ComposeStep({ next }: { next: () => void }) {
  const project = useStore((s) => s.project)!
  const update = useStore((s) => s.update)
  const notify = useStore((s) => s.notify)
  const book = project.book!
  const [chap, setChap] = useState(0)
  const [styleKey, setStyleKey] = useState<(typeof STYLE_KEYS)[number]>('p')
  const [busy, setBusy] = useState(false)

  // découpage en sections par Titre 1 (navigation + rendu rapide des longs manuscrits)
  const sections = useMemo(() => {
    const out: { title: string; start: number; end: number; subs: { title: string; idx: number; lvl: number }[] }[] = []
    book.blocks.forEach((b, i) => {
      if (b.type === 'h1' || i === 0) out.push({ title: b.type === 'h1' ? b.text || '(titre vide)' : 'Début', start: i, end: i, subs: [] })
      const cur = out[out.length - 1]
      cur.end = i
      if (b.type === 'h2' || b.type === 'h3') cur.subs.push({ title: b.text, idx: i, lvl: b.type === 'h2' ? 2 : 3 })
    })
    return out
  }, [book.blocks])
  const sec = sections[Math.min(chap, sections.length - 1)] || { start: 0, end: -1, title: '', subs: [] }

  const mut = (fn: (blocks: Block[]) => void) => update((p) => fn(p.book!.blocks))
  const insert = (at: number, type: BlockType, extra: Partial<Block> = {}) => mut((bl) => { bl.splice(at + 1, 0, { id: uid(), type, text: type === 'table' ? 'Colonne 1 | Colonne 2 | Colonne 3\nValeur | Valeur | Valeur' : type === 'pagebreak' || type === 'image' ? '' : '', ...extra }) })

  // niveau des chapitres : 2 si le livre est divisé en parties (Titre 1), sinon 1
  const chapterType: BlockType = book.blocks.some((b) => b.type === 'h1' && kindOf(b.text.split('\n')[0].trim()) === 'part') ? 'h2' : 'h1'

  const uniformize = () => {
    let n = 0
    mut((bl) => bl.forEach((b) => {
      if (b.type !== chapterType) return
      const flat = b.text.replace(/\s*\n\s*/g, ' ').trim()
      if (/^(introduction|conclusion|prologue|épilogue|epilogue|avant-propos|préface|postface|remerciements|annexe)/i.test(flat) || kindOf(flat) === 'part') return
      const m = flat.match(/^(?:chapitre|chapter|chap\.)\s*([0-9ivxlcdm]+|[a-zéèêà-]+)?\s*[:.\-–—]?\s*(.*)$/i)
      const rest = m ? m[2] : flat.replace(/^(\d+|[IVXLC]+)\s*[.):\-–—]\s*/, '')
      n++
      b.text = `Chapitre ${n}${rest ? '\n' + rest : ''}`
    }))
    notify(`${n} titre(s) de chapitre uniformisé(s) (« Chapitre N » + titre). Ctrl+Z pour annuler.`)
  }

  const detectLocal = () => {
    useStore.getState().snapshot('Avant détection des titres')
    const r = detectStructure(book.blocks)
    update((p) => { p.book!.blocks = r.blocks })
    applyStructureLayout(r.stats.parts > 0)
    notify(`Structure détectée : ${describeStructure(r.stats)}${r.stats.merged ? ` (${r.stats.merged} titre(s) sur deux lignes réunis)` : ''}. Ctrl+Z pour annuler.`)
  }

  const aiStructure = async () => {
    setBusy(true)
    try {
      // tous les blocs courts (candidats titres) du livre entier, avec un aperçu du bloc suivant pour le contexte
      const sample = book.blocks.map((b, i) => ({ b, i })).filter(({ b }) => ['p', 'h1', 'h2', 'h3', 'quote', 'li', 'box'].includes(b.type) && b.text.length < 200).slice(0, 1500)
        .map(({ b, i }) => ({ id: b.id, type: b.type, text: b.text.slice(0, 140), next: (book.blocks[i + 1]?.text || '').slice(0, 60) }))
      const txt = await askClaude({
        maxTokens: 32000,
        system: 'Tu es maquettiste éditorial. On te donne les blocs courts d’un manuscrit (avec le début du bloc suivant). Attribue le bon type à chaque titre selon la hiérarchie réelle du livre : si le livre est divisé en parties, h1 = parties (et prologue, épilogue, préface, remerciements), h2 = chapitres, h3 = sous-titres ; sans parties, h1 = chapitres, h2 = sous-titres, h3 = intertitres. Les phrases ordinaires restent p ; listes li ; citations quote ; encadrés box. Ne modifie pas les textes. Si un numéro de chapitre seul est suivi de son titre sur la ligne suivante, indique "merge": true sur le numéro. Réponds UNIQUEMENT avec un tableau JSON [{"id":..., "type":..., "merge"?: true}] des seuls blocs à changer.',
        messages: [{ role: 'user', content: JSON.stringify(sample) }],
      })
      const changes = extractJSON<{ id: string; type: BlockType; merge?: boolean }[]>(txt)
      useStore.getState().snapshot('Avant structuration IA')
      let parts = false
      mut((bl) => changes.forEach((c) => {
        const k = bl.findIndex((x) => x.id === c.id)
        const b = bl[k]
        if (!b || !TYPE_LABEL[c.type]) return
        b.type = c.type
        if (c.type === 'h1' && kindOf(b.text) === 'part') parts = true
        if (c.merge && bl[k + 1] && bl[k + 1].text.length < 100) { b.text = b.text.trim() + '\n' + bl[k + 1].text.trim(); bl.splice(k + 1, 1) }
      }))
      applyStructureLayout(parts || useStore.getState().project!.book!.blocks.some((b) => b.type === 'h2') && changes.some((c) => c.type === 'h1'))
      notify(`${changes.length} bloc(s) reclassé(s) par l’IA (version précédente enregistrée).`)
    } catch (e) { notify('IA : ' + (e as Error).message) } finally { setBusy(false) }
  }

  const st = book.styles[styleKey]
  const setStyle = (patch: Partial<TextStyle>) => update((p) => { Object.assign(p.book!.styles[styleKey], patch) })

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* Plan */}
      <div className="flex w-full shrink-0 flex-col border-line bg-panel max-lg:max-h-72 max-lg:border-b lg:w-64 lg:border-r">
        <div className="panel-title justify-between"><span className="flex items-center gap-2"><ListTree size={14} /> Plan</span><span className="text-[11px] font-normal text-subtle">{sections.length} section(s)</span></div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
          {sections.map((s, i) => (
            <div key={i}>
              <button onClick={() => setChap(i)} className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] ${i === chap ? 'bg-panel3 font-medium' : 'text-muted hover:bg-panel2 hover:text-ink'}`}><span className={`flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-semibold tabular-nums ${i === chap ? 'bg-accent text-accent-ink' : 'bg-panel3 text-subtle'}`}>{i + 1}</span><span className="truncate">{s.title}</span></button>
              {i === chap && s.subs.map((x) => <button key={x.idx} onClick={() => document.getElementById('blk-' + book.blocks[x.idx].id)?.scrollIntoView({ behavior: 'smooth' })} className={`block w-full truncate rounded px-2 py-1 text-left text-[12px] text-muted hover:bg-panel2 hover:text-ink ${x.lvl === 3 ? 'pl-12' : 'pl-9'}`}>{x.title}</button>)}
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-line p-3">
          <button className="btn-accent w-full" onClick={detectLocal} data-tip="Reconnaît parties, chapitres et sous-titres du manuscrit"><ListTree size={14} /> Détecter les titres</button>
          <button className="btn w-full" onClick={uniformize}><Heading size={14} /> Uniformiser les chapitres</button>
          <button className="btn w-full" disabled={!aiReady() || busy} onClick={aiStructure} title={aiReady() ? '' : 'Clé API requise'}>{busy ? <Spinner /> : <Wand2 size={14} />} Détecter la structure (IA)</button>
          <Toggle label="Sommaire automatique" checked={book.layout.toc} onChange={(v) => update((p) => { p.book!.layout.toc = v })} />
        </div>
      </div>

      {/* Blocs */}
      <div className="canvas-bg min-w-0 flex-1 overflow-y-auto px-3 py-5 max-lg:min-h-[80vh] md:px-6 md:py-8">
        <div className="paper-shadow mx-auto max-w-[760px] rounded-[2px] bg-white py-8 pl-14 pr-4 text-[#1d1d1f] md:py-12 md:pl-24 md:pr-14">
          {book.blocks.slice(sec.start, sec.end + 1).map((b, k) => {
            const i = sec.start + k
            return <BlockEditor key={b.id} b={b} styles={book.styles}
              onChange={(patch) => update((p) => { Object.assign(p.book!.blocks[i], patch) }, { undoable: !('text' in patch) })}
              onFocusText={() => useStore.getState().update(() => {}, { undoable: true })}
              onMove={(d) => mut((bl) => { const j = i + d; if (j < 0 || j >= bl.length) return; [bl[i], bl[j]] = [bl[j], bl[i]] })}
              onDelete={() => mut((bl) => { bl.splice(i, 1) })}
              onInsert={(t, extra) => insert(i, t, extra)} />
          })}
          {sec.end < sec.start && <button className="btn" onClick={() => insert(-1, 'h1', { text: 'Chapitre 1' })}><Plus size={14} /> Ajouter un chapitre</button>}
        </div>
      </div>

      {/* Styles */}
      <div className="flex w-full shrink-0 flex-col border-line bg-panel max-lg:border-t lg:w-80 lg:border-l">
        <div className="panel-title"><Type size={14} /> Styles de paragraphe</div>
        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="flex flex-wrap gap-1">{STYLE_KEYS.map((k) => <button key={k} onClick={() => setStyleKey(k)} className={`chip ${styleKey === k ? '!border-accent/60 !bg-accent-soft !text-ink' : ''}`}>{TYPE_LABEL[k]}</button>)}</div>
          <div className="paper-shadow rounded-[2px] bg-white p-4 text-black" style={{ fontFamily: cssFamily(st.font), fontSize: st.size * 1.2, fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? 'italic' : 'normal', textAlign: st.align, color: st.color, lineHeight: st.lineHeight, textIndent: st.indent * 3 }}>
            {styleKey.startsWith('h') ? 'Le titre de la section' : 'Aperçu du style : la typographie donne au texte sa voix, son rythme et sa clarté.'}
          </div>
          <Field label="Police"><select className="input" value={st.font} onChange={(e) => setStyle({ font: e.target.value as TextStyle['font'] })}><option value="times">Serif (Liberation Serif ≈ Times)</option><option value="helvetica">Sans (Liberation Sans ≈ Helvetica)</option><option value="courier">Mono (Liberation Mono ≈ Courier)</option></select></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Corps (pt)"><Num value={st.size} step={0.5} onChange={(v) => v > 4 && setStyle({ size: v })} /></Field>
            <Field label="Interlignage (×)"><Num value={st.lineHeight} step={0.05} onChange={(v) => v > 0.8 && setStyle({ lineHeight: v })} /></Field>
            <Field label="Espace avant (pt)"><Num value={st.spaceBefore} onChange={(v) => setStyle({ spaceBefore: Math.max(0, v) })} /></Field>
            <Field label="Espace après (pt)"><Num value={st.spaceAfter} onChange={(v) => setStyle({ spaceAfter: Math.max(0, v) })} /></Field>
            <Field label="Retrait 1ʳᵉ ligne (mm)"><Num value={st.indent} step={0.5} onChange={(v) => setStyle({ indent: Math.max(0, v) })} /></Field>
            <Field label="Alignement"><select className="input" value={st.align} onChange={(e) => setStyle({ align: e.target.value as TextStyle['align'] })}><option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option><option value="justify">Justifié</option></select></Field>
          </div>
          <div className="flex gap-2">
            <div className="seg w-full"><button className={st.bold ? 'on' : ''} onClick={() => setStyle({ bold: !st.bold })}><b>G</b> Gras</button><button className={st.italic ? 'on' : ''} onClick={() => setStyle({ italic: !st.italic })}><i>I</i> Italique</button></div>
          </div>
          <Field label="Couleur"><Color value={st.color} onChange={(v) => setStyle({ color: v })} /></Field>
          <div className="space-y-1 border-t border-line pt-3">
            <span className="label">Jeux de styles prédéfinis</span>
            {([['Roman classique', 'times', 'times', 11], ['Manuel moderne', 'helvetica', 'helvetica', 10.5], ['Essai élégant', 'times', 'helvetica', 11.5]] as const).map(([n, bodyF, headF, size]) => (
              <button key={n} className="btn w-full" onClick={() => update((p) => { const s: StyleSheet = defaultStyles(); STYLE_KEYS.forEach((k) => { s[k].font = k.startsWith('h') ? headF : bodyF }); s.p.size = size; s.li.size = size; s.quote.size = size; p.book!.styles = s })}>{n}</button>
            ))}
          </div>
        </div>
        <div className="border-t border-line p-3"><button className="btn-accent w-full" onClick={next}>Continuer : Mise en page <ArrowRight size={15} /></button></div>
      </div>
    </div>
  )
}

function BlockEditor({ b, styles, onChange, onFocusText, onMove, onDelete, onInsert }: {
  b: Block; styles: StyleSheet; onChange: (p: Partial<Block>) => void; onFocusText: () => void; onMove: (d: number) => void; onDelete: () => void; onInsert: (t: BlockType, extra?: Partial<Block>) => void
}) {
  const [menu, setMenu] = useState(false)
  const [comment, setComment] = useState(false)
  const [gen, setGen] = useState(false)
  const s = (styles as Record<string, TextStyle>)[b.type]
  const TAG: Record<BlockType, string> = { h1: 'T1', h2: 'T2', h3: 'T3', p: '¶', quote: '❝', li: '•', box: '▣', image: 'Img', table: 'Tab', pagebreak: '↵' }
  return (
    <div id={'blk-' + b.id} className="group relative -mx-3 rounded-md px-3 py-1 transition-colors hover:bg-[#f6f3ec]">
      <div className="absolute -left-14 top-1.5 flex w-11 justify-end">
        <label className={`relative cursor-pointer rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold tracking-wide ${b.type.startsWith('h') ? 'bg-[#dcb56f]/25 text-[#8a6a2f]' : 'text-[#a19b8f] group-hover:bg-[#ece7dc]'}`} data-tip={TYPE_LABEL[b.type] + ' — cliquer pour changer'} data-tip-side="left">
          {TAG[b.type]}
          <select className="absolute inset-0 cursor-pointer opacity-0" value={b.type} onChange={(e) => onChange({ type: e.target.value as BlockType })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
      </div>
      <div className="absolute -top-3 right-1 z-10 hidden items-center gap-0.5 rounded-md border border-[#e2ddd2] bg-white p-0.5 font-sans text-[#5f5a50] shadow-md group-hover:flex">
        <button className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#f1ede4]" data-tip="Annotation" onClick={() => setComment(!comment)}><MessageSquare size={12} className={b.comment ? 'text-[#b8893a]' : ''} /></button>
        <button className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#f1ede4]" data-tip="Monter" onClick={() => onMove(-1)}><ArrowUp size={12} /></button>
        <button className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#f1ede4]" data-tip="Descendre" onClick={() => onMove(1)}><ArrowDown size={12} /></button>
        <div className="relative">
          <button className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#f1ede4]" data-tip="Insérer après" onClick={() => setMenu(!menu)}><Plus size={12} /></button>
          {menu && <div className="anim-pop absolute right-0 z-30 mt-1 w-44 rounded-lg border border-[#e2ddd2] bg-white p-1 shadow-xl" onMouseLeave={() => setMenu(false)}>
            {(['p', 'h1', 'h2', 'h3', 'quote', 'li', 'box', 'table', 'pagebreak'] as BlockType[]).map((t) => <button key={t} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-[#f4f1ea]" onClick={() => { onInsert(t); setMenu(false) }}><span className="w-6 text-[10px] font-semibold text-[#a19b8f]">{TAG[t]}</span>{TYPE_LABEL[t]}</button>)}
            <FileButton accept="image/*" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-[#f4f1ea]" onFiles={async (f) => { onInsert('image', { src: await readAsDataURL(f[0]), widthPct: 100 }); setMenu(false) }}><span className="w-6 text-[10px] font-semibold text-[#a19b8f]">Img</span>Image…</FileButton>
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-[#9a6f25] hover:bg-[#f4f1ea]" onClick={() => { setGen(true); setMenu(false) }}><span className="w-6 text-[10px] font-semibold">IA</span>Image générée par IA…</button>
          </div>}
        </div>
        <span className="mx-0.5 h-4 w-px bg-[#e2ddd2]" />
        <button className="flex h-6 w-6 items-center justify-center rounded text-[#c0453d] hover:bg-[#fbeceb]" data-tip="Supprimer" onClick={onDelete}><Trash2 size={12} /></button>
      </div>
      {b.type === 'pagebreak' ? <div className="flex items-center gap-2 py-2 font-sans text-[10.5px] uppercase tracking-widest text-[#a19b8f]"><span className="h-px flex-1 border-t border-dashed border-[#d8d2c4]" />saut de page<span className="h-px flex-1 border-t border-dashed border-[#d8d2c4]" /></div>
        : b.type === 'image' ? (
          <div className="space-y-2 py-2 font-sans">
            {b.src ? <img src={b.src} className="mx-auto rounded-sm" style={{ width: (b.widthPct || 100) + '%' }} /> : <div className="p-4 text-center text-xs text-[#888]">Aucune image</div>}
            <input className="w-full bg-transparent text-center text-[12.5px] italic text-[#555] outline-none placeholder:text-[#bbb]" placeholder="Ajouter une légende…" value={b.caption || ''} onChange={(e) => onChange({ caption: e.target.value })} style={{ fontFamily: 'EdSerif, Georgia, serif' }} />
            <div className="hidden items-center justify-center gap-3 text-[11.5px] text-[#666] group-hover:flex">
              <FileButton accept="image/*" className="flex items-center gap-1 rounded border border-[#e2ddd2] bg-white px-2 py-1 hover:bg-[#f4f1ea]" onFiles={async (f) => onChange({ src: await readAsDataURL(f[0]) })}><ImagePlus size={12} /> Remplacer</FileButton>
              <span>Largeur</span><input type="range" min={20} max={100} value={b.widthPct || 100} onChange={(e) => onChange({ widthPct: +e.target.value })} /><span className="tabular-nums">{b.widthPct || 100} %</span>
            </div>
          </div>
        ) : (
          <textarea ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }} value={b.text} onChange={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; onChange({ text: e.target.value }) }} onFocus={onFocusText} rows={1}
            className={`block w-full resize-none bg-transparent outline-none placeholder:text-[#bbb] ${b.type === 'table' ? 'rounded border border-[#e2ddd2] bg-[#faf8f4] p-2 font-mono !text-[12px]' : ''} ${b.type === 'box' ? 'rounded border-l-4 border-[#dcb56f] bg-[#f6f1e6] px-3 py-2' : ''} ${b.type === 'quote' ? 'border-l-2 border-[#d8d2c4] pl-5' : ''} ${b.type === 'li' ? 'pl-5' : ''}`}
            placeholder={b.type.startsWith('h') ? 'Titre…' : 'Texte…'}
            style={s ? { fontFamily: cssFamily(s.font), fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', fontSize: Math.min(28, s.size * 1.38), lineHeight: s.lineHeight * 1.08, color: s.color, textAlign: s.align === 'justify' ? 'left' : s.align, textIndent: b.type === 'p' ? s.indent * 3 : 0, marginTop: b.type.startsWith('h') ? Math.min(18, s.spaceBefore * 0.5) : 0 } : undefined} />
        )}
      {b.type.startsWith('h') && (
        <div className={`mt-0.5 flex flex-wrap items-center gap-2 font-sans text-[11px] text-[#8f887a] ${b.noToc || b.tocLabel ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
          <button className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${b.noToc ? 'bg-[#fbeceb] text-[#c0453d]' : 'bg-[#eef6f0] text-[#2b7a4b]'}`} onClick={() => onChange({ noToc: !b.noToc })} data-tip={b.noToc ? 'Ce titre n’apparaît pas dans le sommaire' : 'Ce titre apparaît dans le sommaire'}>
            {b.noToc ? '✕ Exclu du sommaire' : '✓ Sommaire'}
          </button>
          {!b.noToc && <input className="min-w-40 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 outline-none placeholder:text-[#b9b2a4] hover:border-[#e2ddd2] focus:border-[#dcb56f] focus:bg-white" placeholder="Libellé dans le sommaire (facultatif)" value={b.tocLabel || ''} onChange={(e) => onChange({ tocLabel: e.target.value })} />}
        </div>
      )}
      {gen && <ImageGenDialog title="Image pour le livre" initialAspect="4:3" initialPrompt={b.type === 'p' ? b.text.slice(0, 300) : ''} onClose={() => setGen(false)} onPick={(d) => onInsert('image', { src: d, widthPct: 100 })} />}
      {(comment || b.comment) && <div className="mb-1 mt-1 flex items-center gap-2 rounded-md border border-[#ecd9ad] bg-[#fdf6e4] px-2 py-1 font-sans"><MessageSquare size={12} className="shrink-0 text-[#b8893a]" /><input className="w-full bg-transparent text-[12px] text-[#5c4a22] outline-none placeholder:text-[#c9b48a]" placeholder="Annotation pour l’équipe…" value={b.comment || ''} onChange={(e) => onChange({ comment: e.target.value })} /></div>}
    </div>
  )
}
