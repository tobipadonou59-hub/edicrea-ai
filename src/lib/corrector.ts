import type { Block, CorrectionMode, Suggestion, SuggestionCategory } from './types'
import { uid } from './defaults'
import { askClaude, extractJSON } from './ai'

// ───────────────────────── Correcteur local (hors-ligne) ─────────────────────────
// Règles typographiques françaises + fautes fréquentes + répétitions.
// Ne modifie jamais le texte : il produit des suggestions à accepter / refuser.

type Rule = { re: RegExp; rep: string | ((m: RegExpExecArray) => string); reason: string; cat: SuggestionCategory; modes?: CorrectionMode[] }

const W = (w: string) => new RegExp(`(?<![\\p{L}'’])${w}(?![\\p{L}])`, 'giu')

const keepCase = (src: string, rep: string) => (src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase() ? rep[0].toUpperCase() + rep.slice(1) : rep)

const LEXICON: [string, string, SuggestionCategory, string][] = [
  ['parmis', 'parmi', 'orthographe', '« parmi » ne prend jamais de s'],
  ['malgrés', 'malgré', 'orthographe', '« malgré » est invariable'],
  ['apeller', 'appeler', 'orthographe', 'appeler prend deux p'],
  ['appeller', 'appeler', 'orthographe', 'appeler : un seul l à l’infinitif'],
  ['language', 'langage', 'orthographe', 'en français : « langage »'],
  ['developpement', 'développement', 'orthographe', 'accent manquant'],
  ['developper', 'développer', 'orthographe', 'accent manquant'],
  ['dévellopement', 'développement', 'orthographe', 'orthographe : développement'],
  ['connection', 'connexion', 'orthographe', 'en français : « connexion »'],
  ['addresse', 'adresse', 'orthographe', 'adresse : un seul d'],
  ['exemples', 'exemples', 'orthographe', ''],
  ['example', 'exemple', 'orthographe', 'en français : « exemple »'],
  ['dilemne', 'dilemme', 'orthographe', 'dilemme s’écrit avec deux m'],
  ['quelque soit', 'quel que soit', 'grammaire', '« quel que soit » s’accorde avec le sujet'],
  ['quelques soient', 'quels que soient', 'grammaire', '« quels que soient »'],
  ['si il', 's’il', 'grammaire', 'élision obligatoire : « s’il »'],
  ['si ils', 's’ils', 'grammaire', 'élision obligatoire : « s’ils »'],
  ['ils on', 'ils ont', 'grammaire', 'verbe avoir : « ils ont »'],
  ['elles on', 'elles ont', 'grammaire', 'verbe avoir : « elles ont »'],
  ['sa va', 'ça va', 'orthographe', '« ça » (cela)'],
  ['a cause', 'à cause', 'orthographe', 'préposition « à »'],
  ['a partir', 'à partir', 'orthographe', 'préposition « à »'],
  ['a travers', 'à travers', 'orthographe', 'préposition « à »'],
  ['grace à', 'grâce à', 'orthographe', 'accent circonflexe'],
  ['c’est a dire', 'c’est-à-dire', 'orthographe', 'locution avec traits d’union'],
  ["c'est a dire", 'c’est-à-dire', 'orthographe', 'locution avec traits d’union'],
  ["c'est à dire", 'c’est-à-dire', 'orthographe', 'locution avec traits d’union'],
  ['c’est à dire', 'c’est-à-dire', 'orthographe', 'locution avec traits d’union'],
  ['au jour d’aujourd’hui', 'aujourd’hui', 'style', 'pléonasme'],
  ["au jour d'aujourd'hui", 'aujourd’hui', 'style', 'pléonasme'],
  ['pallier à', 'pallier', 'grammaire', '« pallier » est transitif direct'],
  ['se rappeler de', 'se rappeler', 'grammaire', '« se rappeler quelque chose »'],
  ['monter en haut', 'monter', 'style', 'pléonasme'],
  ['descendre en bas', 'descendre', 'style', 'pléonasme'],
  ['prévoir à l’avance', 'prévoir', 'style', 'pléonasme'],
  ["prévoir à l'avance", 'prévoir', 'style', 'pléonasme'],
  ['voir même', 'voire même', 'orthographe', '« voire » (et même)'],
  ['comme même', 'quand même', 'orthographe', 'locution : « quand même »'],
  ['malgré que', 'bien que', 'style', 'tournure critiquée ; préférer « bien que »'],
  ['autant pour moi', 'au temps pour moi', 'orthographe', 'graphie recommandée'],
  ['en terme de', 'en termes de', 'orthographe', '« en termes de »'],
  ['je vais vous envoyer', 'je vous enverrai', 'style', 'formulation plus soutenue'],
  ['vis à vis', 'vis-à-vis', 'orthographe', 'traits d’union'],
  ['peut être que', 'peut-être que', 'orthographe', 'adverbe : « peut-être »'],
  ['aprés', 'après', 'orthographe', 'accent grave'],
  ['trés', 'très', 'orthographe', 'accent grave'],
  ['succés', 'succès', 'orthographe', 'accent grave'],
  ['problème', 'problème', 'orthographe', ''],
  ['probléme', 'problème', 'orthographe', 'accent grave'],
  ['néamoins', 'néanmoins', 'orthographe', 'néanmoins'],
  ['dailleurs', 'd’ailleurs', 'orthographe', 'apostrophe manquante'],
  ['aujourdhui', 'aujourd’hui', 'orthographe', 'apostrophe manquante'],
  ['quand à', 'quant à', 'orthographe', '« quant à » (en ce qui concerne)'],
  ['ceci dit', 'cela dit', 'style', 'tournure recommandée'],
  ['etc...', 'etc.', 'ponctuation', '« etc. » ne prend qu’un point'],
  ['notament', 'notamment', 'orthographe', 'notamment'],
  ['évidement', 'évidemment', 'orthographe', 'évidemment'],
  ['language', 'langage', 'orthographe', 'langage'],
  ['professionel', 'professionnel', 'orthographe', 'deux n'],
  ['personel', 'personnel', 'orthographe', 'deux n'],
  ['traditionel', 'traditionnel', 'orthographe', 'deux n'],
  ['rationel', 'rationnel', 'orthographe', 'deux n'],
  ['courrament', 'couramment', 'orthographe', 'couramment'],
  ['bientot', 'bientôt', 'orthographe', 'accent circonflexe'],
  ['plutot', 'plutôt', 'orthographe', 'accent circonflexe'],
  ['tantot', 'tantôt', 'orthographe', 'accent circonflexe'],
  ['meme', 'même', 'orthographe', 'accent circonflexe'],
  ['etre', 'être', 'orthographe', 'accent circonflexe'],
  ['tres', 'très', 'orthographe', 'accent grave'],
  ['deja', 'déjà', 'orthographe', 'accents'],
  ['voila', 'voilà', 'orthographe', 'accent grave'],
  ['ou est', 'où est', 'orthographe', '« où » (lieu)'],
  ['la ou', 'là où', 'orthographe', '« là où »'],
]

const RULES: Rule[] = [
  ...LEXICON.filter(([a, b]) => a !== b).map(([a, b, cat, reason]): Rule => ({ re: W(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/’/g, "['’]")), rep: (m) => keepCase(m[0], b), reason, cat })),
  { re: /(?<=\S) {2,}(?=\S)/g, rep: ' ', reason: 'Espaces multiples', cat: 'typographie' },
  { re: /\s+([,.])(?!\d)/g, rep: '$1', reason: 'Pas d’espace avant la virgule ou le point', cat: 'ponctuation' },
  { re: /(?<=[\p{L}\d»)])([;:!?])/gu, rep: '\u202f$1', reason: 'Espace insécable avant ; : ! ? (typographie française)', cat: 'typographie' },
  { re: /(?<=[\p{L}\d»)]) ([;:!?])/gu, rep: '\u202f$1', reason: 'Espace fine insécable avant ; : ! ?', cat: 'typographie', modes: ['pro', 'editorial'] },
  { re: /([,;])(?=[\p{L}])/gu, rep: '$1 ', reason: 'Espace après la ponctuation', cat: 'ponctuation' },
  { re: /(?<=[\p{Ll}]{2})\.(?=[\p{Lu}])/gu, rep: '. ', reason: 'Espace après le point', cat: 'ponctuation' },
  { re: /"([^"\n]{1,300})"/g, rep: (m) => `«\u00a0${m[1]}\u00a0»`, reason: 'Guillemets français « »', cat: 'typographie' },
  { re: /(?<=\p{L})'(?=\p{L})/gu, rep: '’', reason: 'Apostrophe typographique', cat: 'typographie', modes: ['pro', 'editorial'] },
  { re: /\.\.\.(?!\.)/g, rep: '…', reason: 'Points de suspension typographiques', cat: 'typographie' },
  { re: /!{2,}|\?{2,}/g, rep: (m) => m[0][0], reason: 'Ponctuation multiple', cat: 'ponctuation' },
  { re: /(?<=[.!?…]\s)([a-zà-ÿ])/g, rep: (m) => m[1].toUpperCase(), reason: 'Majuscule en début de phrase', cat: 'grammaire' },
  { re: /(?<![\p{L}])(?!(?:nous|vous)\s)(\p{L}{2,})\s+\1(?![\p{L}])/giu, rep: '$1', reason: 'Mot répété deux fois', cat: 'répétition' },
  { re: /(?<=\d) (?=(€|%|km|kg|cm|mm|h)\b)/g, rep: '\u00a0', reason: 'Espace insécable entre nombre et unité', cat: 'typographie', modes: ['pro', 'editorial'] },
  { re: /(?<![\p{L}\d])(\d{2,3})(\d{3})(?!\d)(?![,.]\d)/gu, rep: '$1\u202f$2', reason: 'Séparateur des milliers', cat: 'typographie', modes: ['pro', 'editorial'] },
  { re: /\b1er\b|\b(\d+)eme\b|\b(\d+)ème\b/g, rep: (m) => (m[0] === '1er' ? '1ᵉʳ' : (m[1] || m[2]) + 'ᵉ'), reason: 'Abréviation des ordinaux', cat: 'typographie', modes: ['pro', 'editorial'] },
]

const STOP = new Set('le la les un une des de du et en à a au aux ce ces cet cette que qui quoi dont où il elle ils elles on nous vous je tu me te se lui leur leurs mon ma mes ton ta tes son sa ses notre nos votre vos ne pas plus est sont été être avoir ont ai as avait par pour sur dans avec sans sous mais ou donc or ni car comme si y l d s n c j m t qu tout tous toute toutes très bien aussi fait faire'.split(' '))

function localBlock(b: Block, mode: CorrectionMode): Suggestion[] {
  const out: Suggestion[] = []
  if (!b.text || b.type === 'image' || b.type === 'table' || b.type === 'pagebreak') return out
  const taken: [number, number][] = []
  const free = (s: number, e: number) => !taken.some(([a, z]) => s < z && e > a)
  for (const r of RULES) {
    if (r.modes && !r.modes.includes(mode)) continue
    r.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = r.re.exec(b.text))) {
      if (m[0].length === 0) { r.re.lastIndex++; continue }
      const mm = m
      const rep = typeof r.rep === 'string' ? r.rep.replace(/\$(\d)/g, (_, d) => mm[+d] || '') : r.rep(m)
      if (rep === m[0]) continue
      const s = m.index, e = m.index + m[0].length
      if (!free(s, e)) continue
      taken.push([s, e])
      out.push({ id: uid(), blockId: b.id, start: s, original: m[0], replacement: rep, reason: r.reason, category: r.cat, status: 'pending', source: 'local' })
    }
  }
  // Répétitions proches (mêmes mots pleins à moins de 12 mots d'écart)
  if (mode !== 'simple') {
    const words = [...b.text.matchAll(/\p{L}{4,}/gu)]
    const seen = new Map<string, number>()
    words.forEach((w, i) => {
      const k = w[0].toLowerCase()
      if (STOP.has(k)) return
      const prev = seen.get(k)
      if (prev !== undefined && i - prev < 12 && i - prev > 1 && free(w.index!, w.index! + w[0].length)) {
        out.push({ id: uid(), blockId: b.id, start: w.index!, original: w[0], replacement: w[0], reason: `Répétition rapprochée de « ${w[0]} » — envisager un synonyme ou un pronom`, category: 'répétition', status: 'pending', source: 'local' })
      }
      seen.set(k, i)
    })
    // Phrases très longues
    for (const s of b.text.matchAll(/[^.!?…]+[.!?…]/g)) {
      const n = s[0].split(/\s+/).length
      if (n > 45) out.push({ id: uid(), blockId: b.id, start: s.index!, original: s[0], replacement: s[0], reason: `Phrase très longue (${n} mots) — envisager de la scinder pour la fluidité`, category: 'style', status: 'pending', source: 'local' })
    }
  }
  return out
}

export function localCorrect(blocks: Block[], mode: CorrectionMode): Suggestion[] {
  return blocks.flatMap((b) => localBlock(b, mode))
}

/** Rapport de révision éditoriale local : structure, longueurs, cohérence des titres. */
export function localEditorialReport(blocks: Block[]): string {
  const chapters: { title: string; words: number; paras: number }[] = []
  let cur = { title: '(avant le premier chapitre)', words: 0, paras: 0 }
  const titles: string[] = []
  for (const b of blocks) {
    if (b.type === 'h1') { if (cur.words || cur.paras) chapters.push(cur); cur = { title: b.text, words: 0, paras: 0 }; titles.push(b.text) }
    else if (b.text) { cur.words += b.text.split(/\s+/).filter(Boolean).length; cur.paras++ }
  }
  chapters.push(cur)
  const total = chapters.reduce((a, c) => a + c.words, 0)
  const avg = total / Math.max(1, chapters.length)
  const lines = [`## Structure`, `- ${chapters.length} section(s), ${total.toLocaleString('fr-FR')} mots, ~${Math.ceil(total / 250)} pages au format roman.`]
  chapters.forEach((c) => lines.push(`- **${c.title}** : ${c.words} mots, ${c.paras} paragraphes${c.words > avg * 1.8 ? ' — nettement plus long que la moyenne' : c.words < avg * 0.4 && c.words > 0 ? ' — nettement plus court que la moyenne' : ''}`))
  lines.push('', '## Cohérence des titres')
  const styles = new Set(titles.map((t) => (/^chapitre\s+\d+/i.test(t) ? 'Chapitre N' : /^chapitre\s+[ivxlc]+/i.test(t) ? 'Chapitre romain' : /^\d+[.)]/.test(t) ? 'N.' : t === t.toUpperCase() ? 'MAJUSCULES' : 'libre')))
  lines.push(styles.size > 1 ? `- Titres de chapitre hétérogènes (${[...styles].join(', ')}). Uniformiser la numérotation est recommandé.` : '- Titres de chapitre homogènes.')
  const dup = titles.filter((t, i) => titles.indexOf(t) !== i)
  if (dup.length) lines.push(`- Titres en double : ${[...new Set(dup)].join(', ')}`)
  const sentences = blocks.flatMap((b) => b.text.match(/[^.!?…]+[.!?…]/g) || [])
  const longS = sentences.filter((s) => s.split(/\s+/).length > 40).length
  lines.push('', '## Fluidité', `- Longueur moyenne des phrases : ${(sentences.reduce((a, s) => a + s.split(/\s+/).length, 0) / Math.max(1, sentences.length)).toFixed(1)} mots.`, `- ${longS} phrase(s) de plus de 40 mots.`)
  lines.push('', '_Rapport local. Configurez une clé API Claude pour une analyse éditoriale approfondie (intrigue, personnages, cohérence entre chapitres, rythme)._')
  return lines.join('\n')
}

// ───────────────────────── Correction par IA ─────────────────────────

const MODE_PROMPT: Record<CorrectionMode, string> = {
  simple: "Mode CORRECTION SIMPLE : corrige uniquement les fautes d'orthographe, de grammaire, de conjugaison, d'accord et de ponctuation. Ne touche jamais au style ni au vocabulaire de l'auteur.",
  pro: "Mode CORRECTION PROFESSIONNELLE : corrige toutes les fautes, puis propose des améliorations rédactionnelles ciblées (formulations maladroites, répétitions, lourdeurs, fluidité, typographie française), sans jamais modifier le sens.",
  editorial: "Mode RÉVISION ÉDITORIALE : en plus des corrections, signale les incohérences (noms, dates, temps des verbes, faits), les passages confus, et propose des reformulations pour la fluidité, sans modifier le sens.",
}

export async function aiCorrect(blocks: Block[], mode: CorrectionMode, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<Suggestion[]> {
  const textBlocks = blocks.filter((b) => b.text && !['image', 'table', 'pagebreak'].includes(b.type))
  // Découpage en lots d'environ 6000 caractères
  const batches: Block[][] = []
  let cur: Block[] = [], size = 0
  for (const b of textBlocks) {
    if (size + b.text.length > 6000 && cur.length) { batches.push(cur); cur = []; size = 0 }
    cur.push(b); size += b.text.length
  }
  if (cur.length) batches.push(cur)
  const out: Suggestion[] = []
  for (let i = 0; i < batches.length; i++) {
    onProgress?.(i, batches.length)
    const payload = batches[i].map((b) => ({ id: b.id, type: b.type, text: b.text }))
    const txt = await askClaude({
      signal,
      maxTokens: 16000,
      system: `Tu es correcteur et éditeur professionnel en langue française pour une maison d'édition. ${MODE_PROMPT[mode]}
Tu ne réécris jamais un paragraphe entier : tu proposes des modifications ponctuelles et justifiées.
Réponds UNIQUEMENT avec un tableau JSON d'objets : {"id": id du bloc, "original": extrait EXACT tel qu'il figure dans le texte (assez long pour être unique dans le bloc), "replacement": texte proposé, "reason": explication courte en français, "category": une valeur parmi "orthographe","grammaire","ponctuation","typographie","style","répétition","cohérence","reformulation"}.
Si un bloc n'a aucune faute, n'émets rien pour lui. Tableau vide [] si rien à signaler.`,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    })
    let arr: { id: string; original: string; replacement: string; reason: string; category: SuggestionCategory }[] = []
    try { arr = extractJSON(txt) } catch { arr = [] }
    for (const s of arr) {
      const b = batches[i].find((x) => x.id === s.id)
      if (!b || !s.original || s.original === s.replacement) continue
      const start = b.text.indexOf(s.original)
      if (start < 0) continue
      out.push({ id: uid(), blockId: b.id, start, original: s.original, replacement: s.replacement, reason: s.reason, category: s.category || 'style', status: 'pending', source: 'ia' })
    }
  }
  onProgress?.(batches.length, batches.length)
  return out
}

export async function aiEditorialReport(blocks: Block[]): Promise<string> {
  const text = blocks.map((b) => (b.type.startsWith('h') ? `\n[${b.type.toUpperCase()}] ${b.text}\n` : b.text)).join('\n').slice(0, 400000)
  return askClaude({
    maxTokens: 12000,
    system: "Tu es directeur·rice éditorial·e. Produis un rapport de révision éditoriale en français, en Markdown, structuré : 1) Synthèse, 2) Structure et équilibre des chapitres, 3) Cohérence (personnages, noms, dates, faits, temps verbaux) entre les chapitres, avec citations courtes, 4) Fluidité et rythme, 5) Uniformité des titres et des styles, 6) Recommandations prioritaires. Ne réécris pas le texte.",
    messages: [{ role: 'user', content: text }],
  })
}

export async function aiRephrase(text: string, instruction: string): Promise<string> {
  return askClaude({
    maxTokens: 4000,
    system: "Tu reformules des passages en français sans en changer le sens. Réponds uniquement avec le texte reformulé, sans guillemets ni commentaire.",
    messages: [{ role: 'user', content: `Consigne : ${instruction || 'Améliore la fluidité'}\n\nPassage :\n${text}` }],
  })
}

/** Applique une suggestion à un bloc et décale les autres suggestions du même bloc. */
export function applySuggestion(blocks: Block[], suggestions: Suggestion[], sid: string) {
  const s = suggestions.find((x) => x.id === sid)
  if (!s) return
  const b = blocks.find((x) => x.id === s.blockId)
  if (!b) return
  const pos = b.text.substr(s.start, s.original.length) === s.original ? s.start : b.text.indexOf(s.original)
  if (pos < 0) { s.status = 'rejected'; return }
  b.text = b.text.slice(0, pos) + s.replacement + b.text.slice(pos + s.original.length)
  const delta = s.replacement.length - s.original.length
  s.status = 'accepted'
  for (const o of suggestions) if (o !== s && o.blockId === b.id && o.status === 'pending' && o.start > pos) o.start += delta
}

// ───────────────────────── Diff mot à mot ─────────────────────────
export type DiffPart = { t: 'eq' | 'ins' | 'del'; s: string }
export function diffWords(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/)
  const n = A.length, m = B.length
  if (n * m > 4_000_000) return [{ t: 'del', s: a }, { t: 'ins', s: b }]
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffPart[] = []
  const push = (t: DiffPart['t'], s: string) => { const l = out[out.length - 1]; if (l && l.t === t) l.s += s; else out.push({ t, s }) }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('eq', A[i]); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', A[i]); i++ }
    else { push('ins', B[j]); j++ }
  }
  while (i < n) push('del', A[i++])
  while (j < m) push('ins', B[j++])
  return out
}
