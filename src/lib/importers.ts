import mammoth from 'mammoth'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Block, BlockType } from './types'
import { uid } from './defaults'
import JSZip from 'jszip'
import { detectStructure, kindOf, looksLikeHeading, type Hint, type StructureStats } from './structure'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const readAsDataURL = (f: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f) })

/** Texte brut / Markdown → blocs, puis détection de la structure (parties, chapitres, sous-titres). */
export function textToBlocks(text: string): Block[] { return structured(textToRaw(text)).blocks }

export function textToRaw(text: string): { blocks: Block[]; hints: Map<string, Hint> } {
  const norm = text.replace(/\r\n?/g, '\n').replace(/ (?=[;:!?»])/g, ' ')
  // Paragraphes séparés par une ligne vide ; si aucun, chaque ligne est un paragraphe
  let chunks = norm.split(/\n\s*\n/)
  if (chunks.length < 3) chunks = norm.split('\n')
  const blocks: Block[] = []
  const hints = new Map<string, Hint>()
  const push = (line: string) => {
    const md = line.match(/^(#{1,6})\s+/)
    const b = mk(/^>\s?/.test(line) ? 'quote' : 'p', clean(line))
    if (md) hints.set(b.id, { explicit: Math.min(3, md[1].length) })
    blocks.push(b)
  }
  for (const raw of chunks) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue
    // titres en tête de bloc (« Chapitre 3 », « Le retour », puis le texte)
    while (lines.length > 1 && looksLikeHeading(lines[0])) {
      push(lines.shift()!)
      if (lines.length > 1 && lines[0].length < 80 && !/[.,;]$/.test(lines[0]) && kindOf(blocks[blocks.length - 1].text) && /^\S+(\s+\S+)?\s*[.:–—-]?$/.test(blocks[blocks.length - 1].text.replace(/^(chapitre|chapter|partie|part|livre)\s*/i, ''))) push(lines.shift()!)
    }
    const joined = lines.join(' ')
    if (lines.every((l) => /^([-•*–]|\d+[.)])\s+/.test(l)) && lines.length > 1 && !lines.every((l) => kindOf(l))) {
      lines.forEach((l) => blocks.push(mk('li', l.replace(/^([-•*–]|\d+[.)])\s+/, ''))))
      continue
    }
    if (/^([-•*])\s+/.test(joined) && lines.length === 1) { blocks.push(mk('li', joined.replace(/^([-•*])\s+/, ''))); continue }
    if (joined === '---' || /^\\pagebreak$/.test(joined)) { blocks.push(mk('pagebreak', '')); continue }
    push(joined)
  }
  return { blocks, hints }
}

function clean(s: string) { return s.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/[ \t]{2,}/g, ' ').trim() }

const mk = (type: BlockType, text: string, extra: Partial<Block> = {}): Block => ({ id: uid(), type, text, ...extra })

/** Résultat d'import + bilan de la structure détectée. */
export let lastStructure: StructureStats | null = null
function structured(r: { blocks: Block[]; hints: Map<string, Hint> }) {
  const out = detectStructure(r.blocks, r.hints)
  lastStructure = out.stats
  return out
}

// ───────── Word : contenu via mammoth, mise en forme lue directement dans le XML (styles, taille, gras, centrage)
interface XmlPara { text: string; level?: number; size?: number; bold?: boolean; center?: boolean }
const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()

async function docxParagraphs(buf: ArrayBuffer): Promise<XmlPara[]> {
  try {
    const zip = await JSZip.loadAsync(buf)
    const docXml = await zip.file('word/document.xml')?.async('string')
    if (!docXml) return []
    const stylesXml = (await zip.file('word/styles.xml')?.async('string')) || ''
    const P = new DOMParser()
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    const at = (el: Element | null | undefined, name: string) => el?.getAttributeNS(W, name) ?? el?.getAttribute('w:' + name) ?? null
    const kid = (el: Element | null | undefined, name: string) => (el ? [...el.children].find((c) => c.localName === name) || null : null)
    // styles : niveau de plan, taille, gras, alignement (avec héritage basedOn)
    interface St { level?: number; size?: number; bold?: boolean; center?: boolean; based?: string; name?: string }
    const styles = new Map<string, St>()
    let defSize: number | undefined
    if (stylesXml) {
      const sd = P.parseFromString(stylesXml, 'application/xml')
      const dsz = at(sd.getElementsByTagNameNS(W, 'rPrDefault')[0]?.getElementsByTagNameNS(W, 'sz')[0], 'val')
      if (dsz) defSize = +dsz / 2
      for (const st of [...sd.getElementsByTagNameNS(W, 'style')]) {
        if (at(st, 'type') !== 'paragraph') continue
        const id = at(st, 'styleId') || ''
        const name = (at(kid(st, 'name'), 'val') || id).toLowerCase()
        const pPr = kid(st, 'pPr'), rPr = kid(st, 'rPr')
        const ol = at(kid(pPr, 'outlineLvl'), 'val')
        const hm = name.match(/^(?:heading|titre|title)\s*(\d)$/) || id.toLowerCase().match(/^(?:heading|titre)(\d)$/)
        const sz = at(kid(rPr, 'sz'), 'val')
        const b = kid(rPr, 'b')
        styles.set(id, {
          level: ol != null && +ol < 9 ? +ol + 1 : hm ? +hm[1] : /^(title|titre)$/.test(name) ? 1 : undefined,
          size: sz ? +sz / 2 : undefined,
          bold: b ? at(b, 'val') !== '0' && at(b, 'val') !== 'false' : undefined,
          center: at(kid(pPr, 'jc'), 'val') === 'center' ? true : undefined,
          based: at(kid(st, 'basedOn'), 'val') || undefined, name,
        })
      }
    }
    const resolve = (id: string | null, depth = 0): St => {
      const st = id ? styles.get(id) : undefined
      if (!st) return {}
      const parent = depth < 8 && st.based ? resolve(st.based, depth + 1) : {}
      return { level: st.level ?? parent.level, size: st.size ?? parent.size, bold: st.bold ?? parent.bold, center: st.center ?? parent.center }
    }
    const dd = P.parseFromString(docXml, 'application/xml')
    const out: XmlPara[] = []
    for (const p of [...dd.getElementsByTagNameNS(W, 'p')]) {
      const pPr = kid(p, 'pPr')
      const st = resolve(at(kid(pPr, 'pStyle'), 'val') || 'Normal')
      const ol = at(kid(pPr, 'outlineLvl'), 'val')
      const runs = [...p.getElementsByTagNameNS(W, 'r')]
      let text = '', boldChars = 0, maxSize = 0, total = 0
      for (const r of runs) {
        const t = [...r.getElementsByTagNameNS(W, 't')].map((x) => x.textContent || '').join('')
        if (!t.trim()) { text += t; continue }
        const rPr = kid(r, 'rPr')
        const sz = at(kid(rPr, 'sz'), 'val')
        const size = sz ? +sz / 2 : st.size ?? defSize ?? 0
        const bEl = kid(rPr, 'b')
        const bold = bEl ? at(bEl, 'val') !== '0' && at(bEl, 'val') !== 'false' : !!st.bold
        text += t; total += t.length
        if (bold) boldChars += t.length
        maxSize = Math.max(maxSize, size)
      }
      if (!text.trim()) continue
      const jc = at(kid(pPr, 'jc'), 'val')
      out.push({ text, level: ol != null && +ol < 9 ? +ol + 1 : st.level, size: maxSize || undefined, bold: total > 0 && boldChars / total > 0.9, center: jc ? jc === 'center' : !!st.center })
    }
    return out
  } catch { return [] }
}

/** DOCX → HTML (mammoth) → blocs, en conservant titres, listes, images et tableaux. */
export async function importDocx(file: File): Promise<Block[]> {
  const buf = await file.arrayBuffer()
  const styleMap = ["p[style-name='Titre 1'] => h1:fresh", "p[style-name='Titre 2'] => h2:fresh", "p[style-name='Titre 3'] => h3:fresh", "p[style-name='Titre 4'] => h4:fresh", "p[style-name='Title'] => h1:fresh", "p[style-name='Titre'] => h1:fresh", "p[style-name='Subtitle'] => p:fresh", "p[style-name='Sous-titre'] => p:fresh"]
  const [{ value: html }, xml] = await Promise.all([mammoth.convertToHtml({ arrayBuffer: buf }, { styleMap }), docxParagraphs(buf)])
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks: Block[] = []
  const hints = new Map<string, Hint>()
  let xi = 0
  // associe chaque paragraphe HTML à son paragraphe Word d'origine (même texte, dans l'ordre)
  const feat = (text: string): XmlPara | undefined => {
    const n = norm(text)
    for (let k = xi; k < Math.min(xml.length, xi + 40); k++) if (norm(xml[k].text) === n) { xi = k + 1; return xml[k] }
    return undefined
  }
  const add = (type: BlockType, text: string, explicit?: number) => {
    const f = feat(text)
    const b = mk(type === 'h1' || type === 'h2' || type === 'h3' ? 'p' : type, clean(text))
    const lv = explicit || f?.level
    hints.set(b.id, { explicit: lv && lv <= 6 ? Math.min(3, lv) : undefined, size: f?.size, bold: f?.bold, center: f?.center })
    blocks.push(b)
  }
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    const hm = tag.match(/^h([1-6])$/)
    if (hm) { if (text) add('p', text, +hm[1]) }
    else if (tag === 'ul' || tag === 'ol') el.querySelectorAll(':scope > li').forEach((li) => { const t = (li.textContent || '').trim(); feat(t); blocks.push(mk('li', t)) })
    else if (tag === 'table') {
      const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((c) => (c.textContent || '').trim().replace(/\|/g, '/')).join(' | '))
      blocks.push(mk('table', rows.join('\n')))
    } else if (tag === 'blockquote') blocks.push(mk('quote', text))
    else if (tag === 'p') {
      el.querySelectorAll('img').forEach((img) => blocks.push(mk('image', '', { src: img.getAttribute('src') || '', widthPct: 100 })))
      if (text) {
        // un paragraphe entièrement en gras (mammoth : <strong>) compte comme indice de titre
        const strong = [...el.querySelectorAll('strong')].map((x) => x.textContent || '').join('').replace(/\s+/g, ' ').trim()
        const before = blocks.length
        add('p', text)
        if (strong && strong.length >= text.length * 0.9) { const h = hints.get(blocks[before].id)!; h.bold = true }
      }
    } else [...el.children].forEach(walk)
  }
  ;[...doc.body.children].forEach(walk)
  return structured({ blocks, hints }).blocks
}

/** PDF : extraction du texte natif avec tailles et positions (titres repérés par la taille et le centrage). */
export async function importPdf(file: File, onProgress?: (p: number) => void): Promise<{ blocks: Block[]; textChars: number }> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  interface Ln { text: string; size: number; x0: number; x1: number; y: number; pw: number; page: number }
  const lines: Ln[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const pw = page.getViewport({ scale: 1 }).width
    const tc = await page.getTextContent()
    let cur: Ln | null = null
    for (const it of tc.items as Array<{ str: string; transform: number[]; width: number; hasEOL?: boolean }>) {
      if (it.str === undefined) continue
      const y = it.transform[5], x = it.transform[4]
      const size = Math.hypot(it.transform[2], it.transform[3]) || Math.abs(it.transform[0])
      if (cur && Math.abs(y - cur.y) <= Math.max(2, size * 0.3)) {
        if (it.str) { cur.text += (cur.text && !/\s$/.test(cur.text) && !/^\s/.test(it.str) && x - cur.x1 > size * 0.15 ? ' ' : '') + it.str; cur.x1 = Math.max(cur.x1, x + it.width); if (it.str.trim()) cur.size = Math.max(cur.size, size) }
      } else {
        if (cur && cur.text.trim()) lines.push(cur)
        cur = { text: it.str, size: it.str.trim() ? size : 0, x0: x, x1: x + it.width, y, pw, page: i }
      }
    }
    if (cur && cur.text.trim()) lines.push(cur)
    onProgress?.(i / pdf.numPages)
  }
  // taille du texte courant
  const cnt = new Map<number, number>()
  lines.forEach((l) => { const k = Math.round(l.size * 2) / 2; cnt.set(k, (cnt.get(k) || 0) + l.text.length) })
  const body = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 10
  // marges de page usuelles (pour reconnaître les lignes centrées)
  const left = median(lines.filter((l) => Math.abs(l.size - body) < 0.6).map((l) => l.x0)) || 0
  const isCenter = (l: Ln) => { const right = l.pw - left; const mid = (left + right) / 2; return l.x1 - l.x0 < (right - left) * 0.75 && Math.abs((l.x0 + l.x1) / 2 - mid) < (right - left) * 0.06 && l.x0 - left > (right - left) * 0.08 }
  const special = (l: Ln) => l.size > body * 1.12 || isCenter(l) || !!kindOf(l.text.trim())
  // numéros de page / en-têtes courants : lignes très courtes identiques qui se répètent en haut ou bas de page
  const blocks: Block[] = []
  const hints = new Map<string, Hint>()
  let para: Ln[] = []
  const flush = () => {
    if (!para.length) return
    let t = ''
    // titre composé de lignes courtes (« Chapitre 1 » / « Le fleuve ») : on garde les retours à la ligne
    const headingLines = special(para[0]) && para.length > 1 && para.length <= 3 && para.every((l) => l.text.trim().length < 60)
    if (headingLines) t = para.map((l) => l.text.trim()).join('\n')
    else for (const l of para) t = t ? (/-$/.test(t) && /^[a-zà-ÿ]/.test(l.text.trim()) ? t.slice(0, -1) + l.text.trim() : t + ' ' + l.text.trim()) : l.text.trim()
    const b = mk('p', t.replace(/\s{2,}/g, ' '))
    const f = para[0]
    if (special(f)) hints.set(b.id, { size: Math.max(...para.map((l) => l.size)), center: para.every(isCenter) })
    blocks.push(b)
    para = []
  }
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k]
    const t = l.text.trim()
    if (/^\d{1,4}$/.test(t) && (k === lines.length - 1 || lines[k + 1].page !== l.page || k === 0 || lines[k - 1].page !== l.page) && Math.abs(l.size - body) < 1.5) continue // folio
    const prev = para[para.length - 1]
    const brk = !prev || prev.page !== l.page && (special(l) || /[.!?»…"]$/.test(prev.text.trim()) && l.x0 > left + 2)
      || prev.page === l.page && (Math.abs(prev.y - l.y) > Math.max(prev.size, l.size) * 1.75 || Math.abs(prev.size - l.size) > body * 0.1 || special(l) !== special(prev) || special(l) && isCenter(l) !== isCenter(prev)
        || (l.x0 > left + body * 0.8 && /[.!?»…"]$/.test(prev.text.trim())) || (prev.x1 < prev.pw - left - body * 3 && /[.!?»…"]$/.test(prev.text.trim())))
    if (brk) flush()
    para.push(l)
  }
  flush()
  const textChars = blocks.reduce((a, b) => a + b.text.length, 0)
  return { blocks: structured({ blocks, hints }).blocks, textChars }
}
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

/** Rend les pages d'un PDF en images (pour l'OCR IA des PDF scannés). */
export async function pdfToImages(file: File, maxPages = 20): Promise<string[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const out: string[] = []
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 1.6 })
    const c = document.createElement('canvas')
    c.width = vp.width; c.height = vp.height
    await page.render({ canvas: c, viewport: vp }).promise
    out.push(c.toDataURL('image/jpeg', 0.85))
  }
  return out
}

export const blocksToText = (blocks: Block[]) =>
  blocks.map((b) => (b.type === 'h1' ? '# ' : b.type === 'h2' ? '## ' : b.type === 'h3' ? '### ' : b.type === 'li' ? '- ' : b.type === 'quote' ? '> ' : '') + (b.type === 'pagebreak' ? '---' : b.type === 'image' ? '[image]' : b.text)).join('\n\n')

/** Première page d'un PDF (couverture déjà réalisée) rendue en image haute définition. */
export async function pdfPageImage(file: File, targetWidthPx = 3200): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const page = await pdf.getPage(1)
  const vp1 = page.getViewport({ scale: 1 })
  const vp = page.getViewport({ scale: Math.min(8, targetWidthPx / vp1.width) })
  const c = document.createElement('canvas')
  c.width = Math.round(vp.width); c.height = Math.round(vp.height)
  await page.render({ canvas: c, viewport: vp }).promise
  return c.toDataURL('image/jpeg', 0.93)
}

/** Image ou PDF → dataURL d'image. */
export const fileToImage = (f: File, targetWidthPx?: number) => (f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? pdfPageImage(f, targetWidthPx) : readAsDataURL(f))

export const imageSize = (src: string) => new Promise<{ w: number; h: number }>((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 0, h: 0 }); i.src = src })
