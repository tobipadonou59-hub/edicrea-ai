import { jsPDF } from 'jspdf'
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, AlignmentType, PageBreak, TableOfContents, WidthType } from 'docx'
import type { Block, LayoutSettings, StyleSheet } from './types'
import { type LayoutResult, type Meta, PT, registerFonts, loadFonts, pdfStyle } from './layout'

export interface PdfOptions {
  mode: 'screen' | 'print' | 'interactive'
  cropMarks: boolean
  cmyk: boolean
  bleed: boolean
  padTo4: boolean
}

const hexToRgb = (h: string) => { const m = h.replace('#', ''); const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
/** Conversion RVB → CMJN simple (sans profil ICC). */
export const rgbToCmyk = (r: number, g: number, b: number) => {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const k = 1 - Math.max(rr, gg, bb)
  if (k >= 1) return [0, 0, 0, 1]
  return [(1 - rr - k) / (1 - k), (1 - gg - k) / (1 - k), (1 - bb - k) / (1 - k), k]
}

async function toPdfImage(src: string): Promise<{ data: string; fmt: 'PNG' | 'JPEG'; px: number }> {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => {
      const fmt = src.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      if (src.startsWith('data:image/png') || src.startsWith('data:image/jpeg')) return res({ data: src, fmt, px: img.naturalWidth })
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0)
      res({ data: c.toDataURL('image/jpeg', 0.92), fmt: 'JPEG', px: img.naturalWidth })
    }
    img.onerror = () => res({ data: '', fmt: 'PNG', px: 0 })
    img.src = src
  })
}

export async function exportBookPdf(res: LayoutResult, L: LayoutSettings, meta: Meta, o: PdfOptions): Promise<Blob> {
  await loadFonts()
  const bleed = o.mode === 'print' && o.bleed ? L.bleed : 0
  const slug = o.mode === 'print' && o.cropMarks ? 10 : 0
  const off = bleed + slug
  const W = L.width + 2 * off, H = L.height + 2 * off
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: W > H ? 'landscape' : 'portrait', compress: true })
  registerFonts(doc)
  doc.setProperties({ title: meta.title, author: meta.author, creator: 'EDICREA AI', subject: meta.subtitle })
  const color = (hex: string, kind: 'text' | 'draw' | 'fill') => {
    const [r, g, b] = hexToRgb(hex)
    if (o.cmyk) {
      const [c, m, y, k] = rgbToCmyk(r, g, b)
      if (kind === 'text') doc.setTextColor(c, m, y, k); else if (kind === 'draw') doc.setDrawColor(c, m, y, k); else doc.setFillColor(c, m, y, k)
    } else if (kind === 'text') doc.setTextColor(r, g, b); else if (kind === 'draw') doc.setDrawColor(r, g, b); else doc.setFillColor(r, g, b)
  }
  const imgCache = new Map<string, Awaited<ReturnType<typeof toPdfImage>>>()
  const pages = [...res.pages]
  if (o.padTo4 && o.mode === 'print') while (pages.length % 4) pages.push({ n: pages.length + 1, label: '', kind: 'blank', items: [], chapter: '' })

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage([W, H], W > H ? 'landscape' : 'portrait')
    const p = pages[i]
    for (const it of p.items) {
      if (it.k === 'text') {
        doc.setFont('ed-' + it.font, pdfStyle(it.bold, it.italic))
        doc.setFontSize(it.size)
        color(it.color, 'text')
        if (it.words) for (const w of it.words) doc.text(w.t, w.x + off, it.y + off)
        else doc.text(it.text, it.x + off, it.y + off, { align: it.align || 'left' })
        if (o.mode !== 'print' && it.link) {
          const w = doc.getTextWidth(it.text)
          const x = it.align === 'right' ? it.x - w : it.align === 'center' ? it.x - w / 2 : it.x
          doc.link(x + off, it.y + off - it.size * PT, w, it.size * PT * 1.2, { pageNumber: it.link })
        }
      } else if (it.k === 'image') {
        let im = imgCache.get(it.src)
        if (!im) { im = await toPdfImage(it.src); imgCache.set(it.src, im) }
        if (im.data) doc.addImage(im.data, im.fmt, it.x + off, it.y + off, it.w, it.h, undefined, 'FAST')
      } else if (it.k === 'rect') {
        doc.setLineWidth(0.2)
        if (it.fill) color(it.fill, 'fill')
        if (it.stroke) color(it.stroke, 'draw')
        doc.rect(it.x + off, it.y + off, it.w, it.h, it.fill && it.stroke ? 'FD' : it.fill ? 'F' : 'S')
      } else if (it.k === 'line') {
        doc.setLineWidth(it.width); color(it.color, 'draw'); doc.line(it.x1 + off, it.y1 + off, it.x2 + off, it.y2 + off)
      }
    }
    if (slug) drawCropMarks(doc, slug, bleed, L.width, L.height, o.cmyk)
  }
  if (o.mode === 'interactive' || o.mode === 'screen') {
    const outline = (doc as unknown as { outline: { add: (parent: unknown, title: string, opt: { pageNumber: number }) => unknown } }).outline
    let parent: unknown = null
    for (const e of res.toc) {
      if (!e.page) continue
      if (e.level === 1) parent = outline.add(null, e.text, { pageNumber: e.page })
      else outline.add(parent, e.text, { pageNumber: e.page })
    }
  }
  return doc.output('blob')
}

export function drawCropMarks(doc: jsPDF, slug: number, bleed: number, w: number, h: number, cmyk: boolean) {
  const o = slug + bleed
  doc.setLineWidth(0.25)
  if (cmyk) doc.setDrawColor(1, 1, 1, 1); else doc.setDrawColor(0, 0, 0)
  const L = slug - 2
  const xs = [o, o + w], ys = [o, o + h]
  for (const x of xs) { doc.line(x, 0, x, L); doc.line(x, o + h + bleed + 2, x, o + h + bleed + 2 + L) }
  for (const y of ys) { doc.line(0, y, L, y); doc.line(o + w + bleed + 2, y, o + w + bleed + 2 + L, y) }
  doc.setFontSize(6); doc.setTextColor(0, 0, 0)
  doc.text('EDICREA AI — traits de coupe, fonds perdus ' + bleed + ' mm', o, slug / 2)
}

// ───────────── DOCX ─────────────
export async function exportDocx(blocks: Block[], styles: StyleSheet, meta: Meta, withToc: boolean): Promise<Blob> {
  const children: (Paragraph | Table | TableOfContents)[] = []
  if (meta.title) children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun(meta.title)] }))
  if (meta.subtitle) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: meta.subtitle, italics: true, size: 28 })] }))
  if (meta.author) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: meta.author, size: 26 })] }))
  if (withToc) children.push(new Paragraph({ children: [new PageBreak()] }), new TableOfContents('Sommaire', { hyperlink: true, headingStyleRange: '1-2' }))
  const align = (a: string) => (a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : a === 'justify' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT)
  for (const b of blocks) {
    const s = (styles as Record<string, StyleSheet['p']>)[b.type]
    if (b.type === 'h1') children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(b.text)] }))
    else if (b.type === 'h2') children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.text)] }))
    else if (b.type === 'h3') children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(b.text)] }))
    else if (b.type === 'li') children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b.text)] }))
    else if (b.type === 'pagebreak') children.push(new Paragraph({ children: [new PageBreak()] }))
    else if (b.type === 'image' && b.src) {
      const im = await toPdfImage(b.src)
      if (!im.data) continue
      const bin = atob(im.data.split(',')[1]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
      const ratio = await new Promise<number>((r) => { const i = new Image(); i.onload = () => r(i.naturalHeight / i.naturalWidth); i.src = im.data })
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: im.fmt === 'PNG' ? 'png' : 'jpg', data: u8, transformation: { width: 450, height: 450 * ratio } })] }))
      if (b.caption) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b.caption, italics: true, size: 18 })] }))
    } else if (b.type === 'table') {
      const rows = b.text.split('\n').filter(Boolean).map((r) => r.split('|').map((c) => c.trim()))
      const n = Math.max(...rows.map((r) => r.length))
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((r, ri) => new TableRow({ children: Array.from({ length: n }, (_, ci) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r[ci] || '', bold: ri === 0 })] })] })) })) }))
    } else if (b.text) children.push(new Paragraph({ alignment: align(s?.align || 'left'), indent: b.type === 'quote' ? { left: 720, right: 720 } : s?.indent ? { firstLine: Math.round(s.indent * 56.7) } : undefined, children: [new TextRun({ text: b.text, italics: s?.italic, bold: s?.bold, size: Math.round((s?.size || 11) * 2) })] }))
  }
  const doc = new Document({ creator: 'EDICREA AI', title: meta.title, features: { updateFields: withToc }, sections: [{ children }] })
  return Packer.toBlob(doc)
}

// ───────────── Vérification technique avant impression ─────────────
export interface Check { level: 'ok' | 'warn' | 'error'; text: string }

export async function preflight(blocks: Block[], res: LayoutResult, L: LayoutSettings, meta: Meta, hasCover: boolean): Promise<Check[]> {
  const c: Check[] = []
  c.push(meta.title ? { level: 'ok', text: `Titre : « ${meta.title} »` } : { level: 'error', text: 'Aucun titre renseigné (étape Couverture).' })
  c.push(meta.author ? { level: 'ok', text: `Auteur : ${meta.author}` } : { level: 'warn', text: "Nom de l'auteur manquant." })
  c.push({ level: 'ok', text: `Polices : Liberation Serif / Sans / Mono — incorporées intégralement dans le PDF (aucune police manquante).` })
  c.push(L.bleed >= 3 ? { level: 'ok', text: `Fonds perdus : ${L.bleed} mm` } : { level: 'warn', text: `Fonds perdus de ${L.bleed} mm : la plupart des imprimeurs demandent 3 à 5 mm.` })
  const minM = Math.min(L.marginTop, L.marginBottom, L.marginInner, L.marginOuter)
  c.push(minM >= 10 ? { level: 'ok', text: `Marges de sécurité ≥ 10 mm (min. ${minM} mm)` } : { level: 'warn', text: `Marge minimale de ${minM} mm : risque de texte rogné à la coupe (10 mm recommandés).` })
  if (L.marginInner < 15 && res.pages.length > 150) c.push({ level: 'warn', text: 'Livre épais : augmentez la marge intérieure (petit fond) pour compenser la reliure.' })
  c.push(res.pages.length % 4 === 0 ? { level: 'ok', text: `${res.pages.length} pages (multiple de 4)` } : { level: 'warn', text: `${res.pages.length} pages : complété automatiquement à ${Math.ceil(res.pages.length / 4) * 4} pour l'imprimeur.` })
  const empties = blocks.filter((b) => ['h1', 'h2', 'h3'].includes(b.type) && !b.text.trim()).length
  if (empties) c.push({ level: 'warn', text: `${empties} titre(s) vide(s).` })
  // Résolution des images : px / (mm/25.4)
  for (const p of res.pages) for (const it of p.items) if (it.k === 'image') {
    const px = await new Promise<number>((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); i.src = it.src })
    if (!px) { c.push({ level: 'error', text: `Image illisible ou lien rompu (page ${p.label}).` }); continue }
    const dpi = Math.round(px / (it.w / 25.4))
    c.push(dpi >= 300 ? { level: 'ok', text: `Image page ${p.label} : ${dpi} dpi` } : { level: dpi >= 200 ? 'warn' : 'error', text: `Image page ${p.label} : ${dpi} dpi (300 dpi recommandés pour l'impression)` })
  }
  res.warnings.filter((w) => !w.includes('cahiers')).forEach((w) => c.push({ level: 'warn', text: w }))
  c.push(hasCover ? { level: 'ok', text: 'Couverture conçue (1ʳᵉ, dos, 4ᵉ).' } : { level: 'warn', text: "Aucune couverture n'a encore été conçue." })
  c.push({ level: 'warn', text: 'Profil colorimétrique : conversion CMJN simplifiée (sans profil ICC FOGRA). Faites valider un BAT par votre imprimeur.' })
  return c
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
export const slug = (s: string) => (s || 'document').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
