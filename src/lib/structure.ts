import type { Block, BlockType } from './types'

// ───────── Détection de la structure d'un manuscrit : parties, chapitres, sous-titres
// Combine trois sources d'indices : les mots-clés (« Partie », « Chapitre », numéros…),
// la mise en forme d'origine (styles Word, taille, gras, centrage) et l'ordre hiérarchique du document.

export interface Hint {
  /** niveau de titre explicite (styles Word Titre 1…, Markdown #) */
  explicit?: number
  /** taille de police d'origine (pt) */
  size?: number
  bold?: boolean
  center?: boolean
}

export interface StructureStats { parts: number; chapters: number; sections: number; subsections: number; merged: number; levels: Record<string, 1 | 2 | 3> }

type Kind = 'part' | 'chapter' | 'matter' | 'section' | 'subsection'

const NUMWORD = 'premier|premi[eè]re|second|seconde|deuxi[eè]me|troisi[eè]me|quatri[eè]me|cinqui[eè]me|sixi[eè]me|septi[eè]me|huiti[eè]me|neuvi[eè]me|dixi[eè]me|derni[eè]re?|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt(?:[- ]et[- ]un|-[a-z]+)?|trente(?:[- ]et[- ]un|-[a-z]+)?|quarante(?:[- ]et[- ]un|-[a-z]+)?|cinquante(?:[- ]et[- ]un|-[a-z]+)?|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|last'
const NUM = `(?:\\d{1,3}|[IVXLCDM]{1,7}|${NUMWORD})`
const ORD = 'premi[eè]re|deuxi[eè]me|seconde|troisi[eè]me|quatri[eè]me|cinqui[eè]me|sixi[eè]me|septi[eè]me|huiti[eè]me|neuvi[eè]me|dixi[eè]me|derni[eè]re'

const RE_PART = new RegExp(`^(?:(?:partie|part|livre|book|tome|acte|act|[ée]poque|volume)\\s+${NUM}\\b|(?:${ORD})\\s+(?:partie|[ée]poque)\\b)`, 'i')
const RE_CHAP = new RegExp(`^(?:chapitre|chapter|chap\\.)\\s*${NUM}\\b`, 'i')
const RE_MATTER = /^(prologue|[ée]pilogue|interlude|pr[ée]face|avant-propos|introduction|conclusion|postface|remerciements|annexes?|appendice|bibliographie|glossaire|lexique|notes|d[ée]dicace|[àa] propos de l['’]auteur)\b/i
const RE_SUB = /^\d{1,2}\.\d{1,2}\.\d{1,2}\.?\s+\S/
const RE_SEC = /^\d{1,2}\.\d{1,2}\.?\s+\S/
// numéro seul (« 1 », « IV. », « Douze ») ou numéro suivi d'un titre (« 1. Le départ », « IV – Le retour »)
const RE_NUM_ALONE = new RegExp(`^${NUM}\\s*[.:)–—-]?$`, 'i')
const RE_NUM_TITLED = /^(\d{1,3}|[IVXLC]{1,7})\s*[.:)–—-]\s+\S/
const RE_NUM_ONLY_LABEL = new RegExp(`^(?:(?:chapitre|chapter|chap\\.|partie|part|livre|book|tome|acte|act|[ée]poque|volume)\\s*${NUM}|(?:${ORD})\\s+(?:partie|[ée]poque)|${NUM})\\s*[.:–—-]?$`, 'i')

const isSentence = (t: string) => /[,;]$/.test(t) || (/[^.]\.$/.test(t) && !RE_NUM_ALONE.test(t) && !/^(chapitre|chapter|partie)\b/i.test(t) && t.split(/\s+/).length > 4)
const isDialogue = (t: string) => /^[—–«"“-]/.test(t)
const isCaps = (t: string) => t.length < 70 && /[A-ZÀ-Ý]{3,}/.test(t) && t === t.toUpperCase()

export function kindOf(t: string): Kind | null {
  if (t.length > 110 || isDialogue(t)) return null
  if (RE_PART.test(t)) return 'part'
  if (RE_CHAP.test(t)) return 'chapter'
  if (RE_MATTER.test(t) && t.length < 60 && !/[.;,]$/.test(t)) return 'matter'
  if (RE_SUB.test(t) && t.length < 90) return 'subsection'
  if (RE_SEC.test(t) && t.length < 90) return 'section'
  if (/^[IVXLC]{1,7}$|^\d{1,3}$/.test(t.replace(/[.:)–—-]\s*$/, ''))) return 'chapter'
  if (RE_NUM_ALONE.test(t) && t.length < 25) return 'chapter'
  if (RE_NUM_TITLED.test(t) && t.length < 80 && !isSentence(t) && !/^\d{1,3}\.\d/.test(t)) return 'chapter'
  return null
}

/** Une ligne isolée d'un texte brut ressemble-t-elle à un titre ? */
export const looksLikeHeading = (t: string) => /^#{1,6}\s/.test(t) || !!kindOf(t) || (isCaps(t) && !isSentence(t))

export function detectStructure(input: Block[], hints: Map<string, Hint> = new Map()): { blocks: Block[]; stats: StructureStats } {
  const blocks = input.map((b) => ({ ...b }))
  const textTypes: BlockType[] = ['p', 'h1', 'h2', 'h3']
  // taille du texte courant = taille la plus fréquente (pondérée par le nombre de caractères)
  const sizes = new Map<number, number>()
  blocks.forEach((b) => { const s = hints.get(b.id)?.size; if (s) sizes.set(Math.round(s * 2) / 2, (sizes.get(Math.round(s * 2) / 2) || 0) + b.text.length) })
  const body = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0

  interface Cand { i: number; kind: Kind | null; sig: string; strength: number }
  const cands: Cand[] = []
  const sigOf = (b: Block): { sig: string; strength: number } | null => {
    const h = hints.get(b.id) || {}
    const explicit = h.explicit || (b.type === 'h1' ? 1 : b.type === 'h2' ? 2 : b.type === 'h3' ? 3 : 0)
    if (explicit) return { sig: 'e' + explicit, strength: 100 - explicit * 10 }
    const t = b.text.trim()
    const big = body && h.size && h.size > body * 1.12 ? Math.round(h.size * 2) / 2 : 0
    const caps = isCaps(t)
    if (!big && !h.bold && !(h.center && t.length < 80) && !caps) return null
    const strength = (big ? 20 + big : 0) + (h.bold ? 4 : 0) + (h.center ? 2 : 0) + (caps ? 1 : 0)
    return { sig: `s${big}${h.bold ? 'b' : ''}${h.center ? 'c' : ''}${caps ? 'u' : ''}`, strength }
  }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (!textTypes.includes(b.type)) continue
    const t = b.text.trim()
    if (!t || t.length > 140) continue
    const kind = kindOf(t)
    const st = sigOf(b)
    const plainP = b.type === 'p' && !kind
    // un paragraphe ordinaire ne devient titre que s'il est court, sans ponctuation de phrase et mis en forme
    if (plainP && (!st || isSentence(t) || isDialogue(t) || t.length > 100 || /^[*•·\s]+$/.test(t))) continue
    if (!kind && !st) continue
    cands.push({ i, kind, sig: st?.sig || 'k', strength: st?.strength ?? 0 })
  }

  // fusion « Chapitre 3 » + « Le retour » → un seul titre sur deux lignes
  let merged = 0
  const removed = new Set<number>()
  for (const c of cands) {
    const b = blocks[c.i]
    if (!(c.kind === 'chapter' || c.kind === 'part') || !RE_NUM_ONLY_LABEL.test(b.text.trim()) || b.text.includes('\n')) continue
    const n = blocks[c.i + 1]
    if (!n || !textTypes.includes(n.type)) continue
    const t = n.text.trim()
    if (!t || t.length > 90 || isSentence(t) || isDialogue(t) || /[.]$/.test(t) && t.split(/\s+/).length > 6 || kindOf(t)) continue
    b.text = b.text.trim() + '\n' + t
    if (n.tocLabel && !b.tocLabel) b.tocLabel = n.tocLabel
    removed.add(c.i + 1)
    merged++
  }
  const live = cands.filter((c) => !removed.has(c.i))

  const hasParts = live.some((c) => c.kind === 'part')
  const chapterLv = hasParts ? 2 : 1
  const levelOfKind = (k: Kind) => (k === 'part' ? 1 : k === 'matter' ? 1 : k === 'chapter' ? chapterLv : k === 'section' ? Math.min(3, chapterLv + 1) : 3)

  // apprentissage : quel niveau correspond à chaque style d'origine
  const learned = new Map<string, number[]>()
  for (const c of live) if (c.kind && c.sig !== 'k' && c.kind !== 'matter') { const a = learned.get(c.sig) || []; a.push(levelOfKind(c.kind)); learned.set(c.sig, a) }
  const sigLevel = new Map<string, number>()
  learned.forEach((a, s) => { const cnt = new Map<number, number>(); a.forEach((x) => cnt.set(x, (cnt.get(x) || 0) + 1)); sigLevel.set(s, [...cnt.entries()].sort((x, y) => y[1] - x[1])[0][0]) })
  const sigs = [...new Map(live.filter((c) => !c.kind).map((c) => [c.sig, c.strength])).entries()].sort((a, b) => b[1] - a[1])
  const allSig = new Map<string, number>([...live.map((c) => [c.sig, c.strength] as [string, number])])
  for (const [sig, strength] of sigs) {
    if (sigLevel.has(sig)) continue
    // niveau = juste en dessous du style connu le plus proche au-dessus
    let base = 0, extra = 0
    for (const [s2, st2] of [...allSig.entries()].sort((a, b) => b[1] - a[1])) {
      if (st2 <= strength || s2 === sig) break
      if (sigLevel.has(s2)) { base = sigLevel.get(s2)!; extra = 0 } else if (sigs.some(([x]) => x === s2)) extra++
    }
    sigLevel.set(sig, base + extra + 1)
  }

  const stats: StructureStats = { parts: 0, chapters: 0, sections: 0, subsections: 0, merged, levels: {} }
  for (const c of live) {
    let lv: number
    if (c.kind) lv = levelOfKind(c.kind)
    else {
      lv = sigLevel.get(c.sig) || chapterLv
      // un titre sans mot-clé partageant le style des parties est un chapitre
      if (hasParts && lv <= 1) lv = 2
    }
    lv = Math.max(1, Math.min(3, lv))
    const b = blocks[c.i]
    b.type = (`h${lv}`) as BlockType
    if (c.kind === 'part') stats.parts++
    else if (lv === chapterLv || c.kind === 'matter') stats.chapters++
    else if (lv === chapterLv + 1) stats.sections++
    else stats.subsections++
  }
  // les anciens titres non retenus redeviennent des paragraphes seulement s'ils ressemblent à des phrases
  blocks.forEach((b, i) => { if (/^h[123]$/.test(b.type) && !live.some((c) => c.i === i) && !removed.has(i) && isSentence(b.text.trim())) b.type = 'p' })
  stats.levels = { part: 1, chapter: chapterLv as 1 | 2, section: Math.min(3, chapterLv + 1) as 2 | 3 }
  return { blocks: blocks.filter((_, i) => !removed.has(i)), stats }
}

export function describeStructure(s: StructureStats) {
  const parts = [s.parts && `${s.parts} partie${s.parts > 1 ? 's' : ''}`, s.chapters && `${s.chapters} chapitre${s.chapters > 1 ? 's' : ''}`, s.sections && `${s.sections} sous-titre${s.sections > 1 ? 's' : ''}`, s.subsections && `${s.subsections} intertitre${s.subsections > 1 ? 's' : ''}`].filter(Boolean)
  return parts.length ? parts.join(', ') : 'aucun titre reconnu'
}
