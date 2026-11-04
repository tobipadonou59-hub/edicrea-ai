import mammoth from 'mammoth'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Block, BlockType } from './types'
import { uid } from './defaults'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const readAsDataURL = (f: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f) })

const HEADING_1 = /^(chapitre|chapter|partie|part|livre|prologue|épilogue|epilogue|introduction|conclusion|avant-propos|préface|preface|annexe|séquence|module|unité|leçon)\b/i

/** Détecte la structure (titres, listes, citations) d'un texte brut. */
export function textToBlocks(text: string): Block[] {
  const norm = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ')
  // Paragraphes séparés par une ligne vide ; si aucun, chaque ligne est un paragraphe
  let chunks = norm.split(/\n\s*\n/)
  if (chunks.length < 3) chunks = norm.split('\n')
  const blocks: Block[] = []
  for (const raw of chunks) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue
    // un bloc peut contenir une ligne de titre suivie du texte
    if (lines.length > 1 && classify(lines[0]) !== 'p') {
      blocks.push(mk(classify(lines[0]), clean(lines[0])))
      lines.shift()
    }
    const joined = lines.join(' ')
    if (lines.every((l) => /^([-•*–]|\d+[.)])\s+/.test(l)) && lines.length > 0) {
      lines.forEach((l) => blocks.push(mk('li', l.replace(/^([-•*–]|\d+[.)])\s+/, ''))))
      continue
    }
    if (joined === '---' || joined === '***' || /^\\pagebreak$/.test(joined)) { blocks.push(mk('pagebreak', '')); continue }
    blocks.push(mk(classify(joined), clean(joined)))
  }
  return blocks
}

function clean(s: string) { return s.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/\s{2,}/g, ' ').trim() }

function classify(l: string): BlockType {
  if (/^#\s/.test(l)) return 'h1'
  if (/^##\s/.test(l)) return 'h2'
  if (/^###+\s/.test(l)) return 'h3'
  if (/^>\s?/.test(l)) return 'quote'
  if (l.length < 90 && HEADING_1.test(l) && !/[.;,]$/.test(l)) return 'h1'
  if (l.length < 70 && /^\d+\.\d+(\.\d+)?\.?\s+\S/.test(l)) return /^\d+\.\d+\.\d+/.test(l) ? 'h3' : 'h2'
  if (l.length < 60 && l === l.toUpperCase() && /[A-ZÀ-Ý]{3,}/.test(l) && !/[.;,]$/.test(l)) return 'h1'
  if (/^([-•*–])\s+/.test(l)) return 'li'
  return 'p'
}

const mk = (type: BlockType, text: string, extra: Partial<Block> = {}): Block => ({ id: uid(), type, text, ...extra })

/** DOCX → HTML (mammoth) → blocs, en conservant titres, listes, images et tableaux. */
export async function importDocx(file: File): Promise<Block[]> {
  const buf = await file.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf })
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks: Block[] = []
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (tag === 'h1') blocks.push(mk('h1', text))
    else if (tag === 'h2') blocks.push(mk('h2', text))
    else if (/^h[3-6]$/.test(tag)) blocks.push(mk('h3', text))
    else if (tag === 'ul' || tag === 'ol') el.querySelectorAll(':scope > li').forEach((li) => blocks.push(mk('li', (li.textContent || '').trim())))
    else if (tag === 'table') {
      const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((c) => (c.textContent || '').trim().replace(/\|/g, '/')).join(' | '))
      blocks.push(mk('table', rows.join('\n')))
    } else if (tag === 'blockquote') blocks.push(mk('quote', text))
    else if (tag === 'p') {
      el.querySelectorAll('img').forEach((img) => blocks.push(mk('image', '', { src: img.getAttribute('src') || '', widthPct: 100 })))
      if (text) {
        const t = classify(text)
        blocks.push(mk(t === 'li' || t === 'quote' ? 'p' : t, clean(text)))
      }
    } else [...el.children].forEach(walk)
  }
  ;[...doc.body.children].forEach(walk)
  return blocks
}

/** PDF : extraction du texte natif page par page (les PDF scannés passent par l'OCR IA). */
export async function importPdf(file: File, onProgress?: (p: number) => void): Promise<{ blocks: Block[]; textChars: number }> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  let all = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    let lastY: number | null = null
    let pageText = ''
    for (const it of tc.items as Array<{ str: string; transform: number[]; hasEOL?: boolean }>) {
      const y = it.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 14) pageText += '\n\n'
      else if (lastY !== null && Math.abs(y - lastY) > 2) pageText += '\n'
      pageText += it.str
      lastY = y
    }
    all += pageText + '\n\n'
    onProgress?.(i / pdf.numPages)
  }
  // recoller les lignes coupées d'un même paragraphe
  const merged = all.replace(/-\n(?=[a-zà-ÿ])/g, '').replace(/([^\n.!?:»"])\n(?=[a-zà-ÿ])/g, '$1 ')
  return { blocks: textToBlocks(merged), textChars: merged.trim().length }
}

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
