import { jsPDF } from 'jspdf'
import type { Block, LayoutSettings, StyleSheet, TextStyle } from './types'

// ───────────── Moteur de mise en page (pagination) ─────────────
// Produit une liste de pages composées d'éléments positionnés en mm.
// Le même résultat alimente l'aperçu (SVG) et l'export PDF : ce que l'on voit est ce qui sera imprimé.

export const PT = 0.352778 // 1 pt en mm

const FAMILY: Record<TextStyle['font'], string> = { times: 'EdSerif', helvetica: 'EdSans', courier: 'EdMono' }
const FILE: Record<TextStyle['font'], string> = { times: 'LiberationSerif', helvetica: 'LiberationSans', courier: 'LiberationMono' }
export const cssFamily = (f: TextStyle['font']) => FAMILY[f]
export const pdfStyle = (bold: boolean, italic: boolean) => (bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal')

let fontData: Record<string, string> | null = null
let fontPromise: Promise<void> | null = null

/** Charge les polices TTF (une fois) et les enregistre dans un document jsPDF. */
export async function loadFonts() {
  if (fontData) return
  if (!fontPromise) fontPromise = (async () => {
    const out: Record<string, string> = {}
    await Promise.all((Object.keys(FILE) as TextStyle['font'][]).flatMap((f) => ['Regular', 'Bold', 'Italic', 'BoldItalic'].map(async (s) => {
      const buf = await (await fetch(`/fonts/${FILE[f]}-${s}.ttf`)).arrayBuffer()
      let bin = ''
      const u8 = new Uint8Array(buf)
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000))
      out[`${f}-${s}`] = btoa(bin)
    })))
    fontData = out
  })()
  await fontPromise
}

export function registerFonts(doc: jsPDF) {
  if (!fontData) throw new Error('Polices non chargées')
  for (const f of Object.keys(FILE) as TextStyle['font'][]) {
    for (const [s, st] of [['Regular', 'normal'], ['Bold', 'bold'], ['Italic', 'italic'], ['BoldItalic', 'bolditalic']]) {
      const name = `${FILE[f]}-${s}.ttf`
      doc.addFileToVFS(name, fontData[`${f}-${s}`])
      doc.addFont(name, 'ed-' + f, st)
    }
  }
}

let measurer: jsPDF | null = null
const wcache = new Map<string, number>()
export function textWidth(s: string, font: TextStyle['font'], bold: boolean, italic: boolean, size: number) {
  const key = font + bold + italic + '|' + s
  let u = wcache.get(key)
  if (u === undefined) {
    if (!measurer) { measurer = new jsPDF({ unit: 'mm' }); registerFonts(measurer) }
    u = measurer.getStringUnitWidth(s, { fontName: 'ed-' + font, fontStyle: pdfStyle(bold, italic) })
    if (wcache.size > 200000) wcache.clear()
    wcache.set(key, u)
  }
  return u * size * PT
}

export type Item =
  | { k: 'text'; x: number; y: number; text: string; font: TextStyle['font']; size: number; bold: boolean; italic: boolean; color: string; align?: 'left' | 'center' | 'right'; words?: { x: number; t: string }[]; link?: number }
  | { k: 'image'; x: number; y: number; w: number; h: number; src: string }
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }

export interface Page { n: number; label: string; kind: 'title' | 'toc' | 'body' | 'blank'; items: Item[]; chapter: string }
export interface TocEntry { level: 1 | 2; text: string; page: number; label: string }
export interface LayoutResult { pages: Page[]; toc: TocEntry[]; warnings: string[] }

export interface Meta { title: string; subtitle: string; author: string; publisher: string }

interface Line { text: string; width: number; words: string[] }

function wrap(text: string, maxW: number, firstIndent: number, s: TextStyle): Line[] {
  const words = text.split(/ +/).filter(Boolean)
  const space = textWidth(' ', s.font, s.bold, s.italic, s.size)
  const lines: Line[] = []
  let cur: string[] = [], w = 0
  const limit = () => maxW - (lines.length === 0 ? firstIndent : 0)
  for (let word of words) {
    let ww = textWidth(word, s.font, s.bold, s.italic, s.size)
    // mot plus large que la colonne : coupure forcée
    while (ww > limit() && word.length > 1) {
      if (cur.length) { lines.push({ text: cur.join(' '), width: w, words: cur }); cur = []; w = 0 }
      let cut = word.length - 1
      while (cut > 1 && textWidth(word.slice(0, cut) + '-', s.font, s.bold, s.italic, s.size) > limit()) cut--
      const part = word.slice(0, cut) + '-'
      lines.push({ text: part, width: textWidth(part, s.font, s.bold, s.italic, s.size), words: [part] })
      word = word.slice(cut)
      ww = textWidth(word, s.font, s.bold, s.italic, s.size)
    }
    const add = cur.length ? space + ww : ww
    if (w + add > limit() && cur.length) { lines.push({ text: cur.join(' '), width: w, words: cur }); cur = [word]; w = ww }
    else { cur.push(word); w += add }
  }
  if (cur.length) lines.push({ text: cur.join(' '), width: w, words: cur })
  return lines
}

export function layoutBook(blocks: Block[], styles: StyleSheet, L: LayoutSettings, meta: Meta, ratios: Record<string, number>): LayoutResult {
  const pages: Page[] = []
  const warnings: string[] = []
  const toc: TocEntry[] = []
  const contentW = L.width - L.marginInner - L.marginOuter
  const contentH = L.height - L.marginTop - L.marginBottom
  const colW = (contentW - L.gutter * (L.columns - 1)) / L.columns
  const isRecto = (n: number) => n % 2 === 1
  const left = (n: number) => (L.mirror ? (isRecto(n) ? L.marginInner : L.marginOuter) : L.marginInner)
  const label = (n: number) => String(n + L.startNumberAt - 1)

  const newPage = (kind: Page['kind'], chapter = ''): Page => {
    const p: Page = { n: pages.length + 1, label: label(pages.length + 1), kind, items: [], chapter }
    pages.push(p)
    return p
  }

  // ── Page de titre
  if (L.titlePage) {
    const p = newPage('title')
    const cx = L.width / 2
    const t = styles.h1
    let y = L.height * 0.33
    for (const ln of wrap(meta.title || 'Sans titre', contentW, 0, { ...t, size: t.size * 1.4 })) {
      p.items.push({ k: 'text', x: cx, y, text: ln.text, font: t.font, size: t.size * 1.4, bold: true, italic: false, color: t.color, align: 'center' }); y += t.size * 1.4 * PT * 1.2
    }
    if (meta.subtitle) for (const ln of wrap(meta.subtitle, contentW, 0, { ...styles.h2, bold: false, italic: true })) {
      y += 2; p.items.push({ k: 'text', x: cx, y: y + 4, text: ln.text, font: styles.h2.font, size: styles.h2.size, bold: false, italic: true, color: '#333333', align: 'center' }); y += styles.h2.size * PT * 1.3
    }
    if (meta.author) p.items.push({ k: 'text', x: cx, y: L.height * 0.2, text: meta.author, font: styles.h2.font, size: styles.h2.size * 0.95, bold: false, italic: false, color: '#222222', align: 'center' })
    if (meta.publisher) p.items.push({ k: 'text', x: cx, y: L.height - L.marginBottom, text: meta.publisher, font: styles.p.font, size: 10, bold: false, italic: false, color: '#444444', align: 'center' })
    if (L.mirror) newPage('blank')
  }

  // ── Réservation du sommaire (nombre d'entrées connu à l'avance)
  const tocBlocks = blocks.filter((b) => (b.type === 'h1' || b.type === 'h2') && b.text.trim())
  const tocLineH = styles.p.size * PT * 1.6
  const tocPagesCount = L.toc && tocBlocks.length ? Math.max(1, Math.ceil((tocBlocks.length * tocLineH + 25) / contentH)) : 0
  const tocPages: Page[] = []
  for (let i = 0; i < tocPagesCount; i++) tocPages.push(newPage('toc'))
  if (tocPagesCount && L.mirror && pages.length % 2 === 1) newPage('blank')

  // ── Corps du texte
  let page: Page | null = null
  let col = 0
  let y = 0 // position dans la colonne (mm depuis le haut de la zone de texte)
  let chapter = ''
  const colX = () => left(page!.n) + col * (colW + L.gutter)
  const top = () => L.marginTop
  const remaining = () => contentH - y

  const startPage = (forceRecto = false) => {
    if (forceRecto && L.mirror && (pages.length + 1) % 2 === 0) newPage('blank', chapter)
    page = newPage('body', chapter); col = 0; y = 0
  }
  const nextColumn = () => { if (col < L.columns - 1) { col++; y = 0 } else startPage() }
  const ensure = (h: number) => { if (!page) startPage(); if (h > remaining() && y > 0) nextColumn() }

  const lineH = (s: TextStyle) => s.size * PT * s.lineHeight

  const flowText = (b: Block, s: TextStyle, opts: { indentL?: number; indentR?: number; bullet?: string; box?: boolean; link?: TocEntry } = {}) => {
    const il = opts.indentL ?? 0, ir = opts.indentR ?? 0
    const pad = opts.box ? 3 : 0
    const w = colW - il - ir - pad * 2
    const lines = wrap(b.text, w, b.type === 'p' ? s.indent : 0, s)
    const lh = lineH(s)
    const before = s.spaceBefore * PT
    if (!page) startPage()
    if (y > 0) y += before
    // contrôle des orphelines : au moins 2 lignes ensemble (ou tout le paragraphe s'il est court)
    const keep = Math.min(lines.length, 2) * lh + (b.type.startsWith('h') ? lineH(styles.p) * 2 : 0) + pad * 2
    if (keep > remaining() && y > 0) nextColumn()
    let fragTop = y
    const drawBox = (y0: number, y1: number) => { if (opts.box) page!.items.unshift({ k: 'rect', x: colX() + il, y: top() + y0, w: colW - il - ir, h: y1 - y0, fill: '#f1ece2', stroke: '#c9b48a' }) }
    y += pad
    lines.forEach((ln, i) => {
      if (y + lh > contentH + 0.01) {
        drawBox(fragTop, y + pad)
        nextColumn(); fragTop = y; y += pad
      }
      const baseline = top() + y + s.size * PT * 0.82 + (lh - s.size * PT) / 2
      const x0 = colX() + il + pad + (i === 0 && b.type === 'p' ? s.indent : 0)
      const avail = w - (i === 0 && b.type === 'p' ? s.indent : 0)
      const last = i === lines.length - 1
      const item: Item = { k: 'text', x: x0, y: baseline, text: ln.text, font: s.font, size: s.size, bold: s.bold, italic: s.italic, color: s.color }
      if (s.align === 'center') { item.x = x0 + avail / 2; item.align = 'center' }
      else if (s.align === 'right') { item.x = x0 + avail; item.align = 'right' }
      else if (s.align === 'justify' && !last && ln.words.length > 1) {
        const wordsW = ln.words.reduce((a, t) => a + textWidth(t, s.font, s.bold, s.italic, s.size), 0)
        const gap = (avail - wordsW) / (ln.words.length - 1)
        let cx = x0
        item.words = ln.words.map((t) => { const r = { x: cx, t }; cx += textWidth(t, s.font, s.bold, s.italic, s.size) + gap; return r })
      }
      if (i === 0 && opts.bullet) page!.items.push({ k: 'text', x: colX() + il - 4, y: baseline, text: opts.bullet, font: s.font, size: s.size, bold: false, italic: false, color: s.color })
      page!.items.push(item)
      y += lh
    })
    y += pad
    drawBox(fragTop, y)
    y += s.spaceAfter * PT
    if (opts.link) { opts.link.page = page!.n; opts.link.label = page!.label }
  }

  for (const b of blocks) {
    switch (b.type) {
      case 'pagebreak': startPage(); break
      case 'h1': {
        chapter = b.text
        if (L.chapterNewPage || !page) startPage(L.chapterOnRecto)
        else ensure(lineH(styles.h1) * 3)
        page!.chapter = chapter
        ;(page as unknown as Page & { opener?: boolean }).opener = y === 0
        const e: TocEntry = { level: 1, text: b.text, page: 0, label: '' }
        if (b.text.trim()) toc.push(e)
        if (L.chapterNewPage) y = contentH * 0.18
        flowText(b, styles.h1, { link: e })
        break
      }
      case 'h2': case 'h3': {
        const e: TocEntry = { level: 2, text: b.text, page: 0, label: '' }
        if (b.type === 'h2' && b.text.trim()) toc.push(e)
        flowText(b, styles[b.type], { link: b.type === 'h2' ? e : undefined })
        break
      }
      case 'p': if (b.text.trim()) flowText(b, styles.p); break
      case 'quote': flowText(b, styles.quote, { indentL: 8, indentR: 8 }); break
      case 'li': flowText(b, styles.li, { indentL: 5, bullet: '•' }); break
      case 'box': flowText(b, styles.box, { box: true }); break
      case 'image': {
        if (!b.src) break
        const ratio = ratios[b.src] || 0.66
        let w = colW * Math.min(100, Math.max(10, b.widthPct || 100)) / 100
        let h = w * ratio
        if (h > contentH * 0.9) { h = contentH * 0.9; w = h / ratio }
        const capH = b.caption ? 9 * PT * 1.4 + 2 : 0
        if (!page) startPage()
        if (y > 0) y += 3
        if (h + capH > remaining() && y > 0) nextColumn()
        const x = colX() + (colW - w) / 2
        page!.items.push({ k: 'image', x, y: top() + y, w, h, src: b.src })
        y += h
        if (b.caption) { y += 2; page!.items.push({ k: 'text', x: colX() + colW / 2, y: top() + y + 9 * PT, text: b.caption, font: styles.p.font, size: 9, bold: false, italic: true, color: '#444444', align: 'center' }); y += 9 * PT * 1.4 }
        y += 3
        break
      }
      case 'table': {
        const rows = b.text.split('\n').filter((r) => r.trim()).map((r) => r.split('|').map((c) => c.trim()))
        if (!rows.length) break
        const ncol = Math.max(...rows.map((r) => r.length))
        const cw = colW / ncol
        const ts: TextStyle = { ...styles.p, size: Math.max(7, styles.p.size - 2), indent: 0, align: 'left', lineHeight: 1.25 }
        if (!page) startPage()
        if (y > 0) y += 3
        rows.forEach((r, ri) => {
          const cells = Array.from({ length: ncol }, (_, ci) => wrap(r[ci] || '', cw - 3, 0, { ...ts, bold: ri === 0 }))
          const rh = Math.max(...cells.map((c) => Math.max(1, c.length))) * lineH(ts) + 2.4
          if (rh > remaining() && y > 0) nextColumn()
          cells.forEach((c, ci) => {
            const x = colX() + ci * cw
            page!.items.push({ k: 'rect', x, y: top() + y, w: cw, h: rh, fill: ri === 0 ? '#e8e1d3' : undefined, stroke: '#8a8172' })
            c.forEach((ln, li) => page!.items.push({ k: 'text', x: x + 1.5, y: top() + y + 1.2 + li * lineH(ts) + ts.size * PT * 0.9, text: ln.text, font: ts.font, size: ts.size, bold: ri === 0, italic: false, color: '#111111' }))
          })
          y += rh
        })
        y += 3
        break
      }
    }
  }
  if (!page && !pages.length) startPage()

  // ── Remplissage du sommaire
  if (tocPagesCount) {
    let ti = 0
    tocPages.forEach((tp, idx) => {
      let ty = L.marginTop + (idx === 0 ? 18 : 0)
      const x0 = left(tp.n), w = contentW
      if (idx === 0) tp.items.push({ k: 'text', x: x0, y: L.marginTop + 8, text: L.tocTitle, font: styles.h1.font, size: styles.h1.size * 0.9, bold: true, italic: false, color: styles.h1.color })
      while (ti < toc.length && ty + tocLineH <= L.height - L.marginBottom) {
        const e = toc[ti++]
        const s = styles.p
        const ind = e.level === 2 ? 6 : 0
        const bold = e.level === 1
        let txt = e.text
        const numW = textWidth(e.label, s.font, bold, false, s.size)
        const maxT = w - ind - numW - 8
        while (txt.length > 3 && textWidth(txt, s.font, bold, false, s.size) > maxT) txt = txt.slice(0, -2)
        if (txt !== e.text) txt = txt.trimEnd() + '…'
        const tw = textWidth(txt, s.font, bold, false, s.size)
        const dotW = textWidth(' .', s.font, false, false, s.size)
        const dots = Math.max(0, Math.floor((w - ind - tw - numW - 4) / dotW))
        tp.items.push({ k: 'text', x: x0 + ind, y: ty + s.size * PT, text: txt, font: s.font, size: s.size, bold, italic: false, color: '#111111', link: e.page })
        tp.items.push({ k: 'text', x: x0 + ind + tw + 2, y: ty + s.size * PT, text: ' .'.repeat(dots), font: s.font, size: s.size, bold: false, italic: false, color: '#888888' })
        tp.items.push({ k: 'text', x: x0 + w, y: ty + s.size * PT, text: e.label, font: s.font, size: s.size, bold, italic: false, color: '#111111', align: 'right', link: e.page })
        ty += tocLineH
      }
    })
    if (ti < toc.length) warnings.push('Le sommaire déborde : réduisez la taille du texte ou les entrées.')
  }

  // ── En-têtes et pieds de page
  for (const p of pages) {
    if (p.kind === 'title' || p.kind === 'blank') continue
    const opener = (p as Page & { opener?: boolean }).opener
    const x0 = left(p.n)
    const recto = isRecto(p.n)
    if (L.header && p.kind === 'body' && !opener) {
      const txt = (recto && p.chapter ? '{chapitre}' : L.headerText).replace('{titre}', meta.title).replace('{chapitre}', p.chapter).replace('{auteur}', meta.author)
      const hy = L.marginTop - 6
      p.items.push({ k: 'text', x: L.mirror ? (recto ? x0 + contentW : x0) : x0 + contentW / 2, y: hy, text: txt, font: styles.p.font, size: 8, bold: false, italic: true, color: '#555555', align: L.mirror ? (recto ? 'right' : 'left') : 'center' })
      p.items.push({ k: 'line', x1: x0, y1: hy + 1.8, x2: x0 + contentW, y2: hy + 1.8, color: '#999999', width: 0.15 })
    }
    if (L.footer && L.pageNumbers) {
      const fy = L.height - L.marginBottom / 2
      const outer = L.numberPosition === 'outer' && L.mirror
      p.items.push({ k: 'text', x: outer ? (recto ? x0 + contentW : x0) : x0 + contentW / 2, y: fy, text: p.label, font: styles.p.font, size: 9, bold: false, italic: false, color: '#333333', align: outer ? (recto ? 'right' : 'left') : 'center' })
    }
  }
  if (pages.length % 4 !== 0) warnings.push(`Le livre compte ${pages.length} pages : les imprimeurs travaillent par cahiers (multiple de 4). ${4 - (pages.length % 4)} page(s) vierge(s) seront ajoutées à l'export imprimeur.`)
  return { pages, toc, warnings }
}

const ratioCache = new Map<string, number>()
export async function imageRatios(blocks: Block[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  await Promise.all(blocks.filter((b) => b.type === 'image' && b.src).map((b) => new Promise<void>((res) => {
    const c = ratioCache.get(b.src!)
    if (c) { out[b.src!] = c; return res() }
    const img = new Image()
    img.onload = () => { const r = img.naturalHeight / img.naturalWidth || 0.66; ratioCache.set(b.src!, r); out[b.src!] = r; res() }
    img.onerror = () => res()
    img.src = b.src!
  })))
  return out
}
