import { StaticCanvas, Rect, Circle, Textbox, Path, Gradient, FabricImage, Triangle, Line, Shadow, Group, loadSVGFromString, util, type FabricObject } from 'fabric'
import './setup'
import { ensureFonts, toJSON, renderThumb } from './setup'
import type { CoverInfo, DesignDoc, PosterData, Proposal } from '../lib/types'
import { POSTER_FORMATS, uid, coverSpec } from '../lib/defaults'
import { askClaude, extractJSON } from '../lib/ai'

export type Layout = 'centered' | 'geometric' | 'typo' | 'photo' | 'frame' | 'split'
export type Motif = 'circles' | 'waves' | 'stripes' | 'mountains' | 'grid' | 'stars' | 'leaves' | 'none'

export interface Concept {
  name: string
  concept: string
  layout: Layout
  palette: string[] // [fond, fond2, texte, accent, clair]
  titleFont: string
  bodyFont: string
  motif: Motif
  upper: boolean
  tagline: string
  svg?: string
}

// ───────────── Palettes ─────────────
const COLOR_WORDS: Record<string, string> = {
  rouge: '#b3261e', bordeaux: '#6d1a2a', rose: '#e07a9b', orange: '#e86a2c', jaune: '#f2c12e', or: '#c9a14a', doré: '#c9a14a',
  vert: '#2f7d4f', émeraude: '#0f6b58', olive: '#6b7a3a', turquoise: '#1aa3a3', bleu: '#1f4e8c', marine: '#13294b', ciel: '#7fb7e6',
  violet: '#5b3a8c', mauve: '#9d7bb8', noir: '#121212', blanc: '#f7f5f0', gris: '#7d8186', beige: '#e9dcc3', crème: '#f4ecd8', marron: '#6b4a2f', brun: '#6b4a2f',
}
const CATEGORY_PALETTES: Record<string, string[][]> = {
  default: [['#13294b', '#1f4e8c', '#f7f5f0', '#e3b04b', '#ffffff'], ['#f4ecd8', '#e9dcc3', '#1d2124', '#b3261e', '#ffffff'], ['#121212', '#2a2a2a', '#f7f5f0', '#e86a2c', '#ffffff'], ['#0f6b58', '#2f7d4f', '#f7f5f0', '#f2c12e', '#ffffff']],
  'Manuel scolaire': [['#1f6fd1', '#5aa0f0', '#ffffff', '#ffcc33', '#ffffff'], ['#ffffff', '#e8f1fb', '#14365f', '#ef5b3b', '#ffffff'], ['#2f9e6e', '#5cc495', '#ffffff', '#ffd23f', '#ffffff'], ['#6c3fc4', '#9c79e6', '#ffffff', '#ffb347', '#ffffff']],
  Jeunesse: [['#ffd23f', '#ffe98a', '#2b2d42', '#ef476f', '#ffffff'], ['#06d6a0', '#8ff0d2', '#073b4c', '#ef476f', '#ffffff'], ['#118ab2', '#73c7e3', '#ffffff', '#ffd166', '#ffffff'], ['#ff8fab', '#ffc2d1', '#3d2b56', '#5ec2b7', '#ffffff']],
  Roman: [['#1b1b2f', '#2e2e4f', '#f3e9d2', '#c9a14a', '#ffffff'], ['#e9dcc3', '#d8c6a3', '#2b1d14', '#8c2f1c', '#ffffff'], ['#0d3b3a', '#155e5b', '#f4ecd8', '#e5a24a', '#ffffff'], ['#6d1a2a', '#912a3d', '#f7efe3', '#e7c27d', '#ffffff']],
  'Rapport institutionnel': [['#ffffff', '#eef2f6', '#13294b', '#1f6fd1', '#ffffff'], ['#13294b', '#1f4e8c', '#ffffff', '#4fb3bf', '#ffffff'], ['#f5f5f2', '#e0e0da', '#222222', '#2f7d4f', '#ffffff'], ['#222831', '#393e46', '#eeeeee', '#00adb5', '#ffffff']],
}
const FONTS_BY_STYLE: Record<string, [string, string][]> = {
  Moderne: [['Montserrat', 'Inter'], ['Poppins', 'Inter'], ['Bebas Neue', 'Montserrat'], ['Oswald', 'Lora']],
  Classique: [['Playfair Display', 'Lora'], ['Merriweather', 'Lora'], ['Lora', 'Playfair Display'], ['Playfair Display', 'Montserrat']],
  Élégant: [['Playfair Display', 'Montserrat'], ['Abril Fatface', 'Lora'], ['Lora', 'Montserrat'], ['Dancing Script', 'Playfair Display']],
  Ludique: [['Poppins', 'Poppins'], ['Bebas Neue', 'Poppins'], ['Dancing Script', 'Poppins'], ['Montserrat', 'Poppins']],
  Audacieux: [['Bebas Neue', 'Montserrat'], ['Abril Fatface', 'Montserrat'], ['Oswald', 'Inter'], ['Poppins', 'Inter']],
  default: [['Playfair Display', 'Montserrat'], ['Montserrat', 'Lora'], ['Bebas Neue', 'Inter'], ['Merriweather', 'Montserrat']],
}

function userColors(s: string): string[] {
  const out: string[] = []
  for (const m of s.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) out.push(m[0])
  for (const [w, c] of Object.entries(COLOR_WORDS)) if (new RegExp(`\\b${w}`, 'i').test(s)) out.push(c)
  return out
}
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 }
const shade = (hex: string, f: number) => { const n = parseInt(hex.slice(1), 16); const c = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('') }

export function localConcepts(category: string, style: string, colors: string, title: string): Concept[] {
  const base = CATEGORY_PALETTES[category] || CATEGORY_PALETTES[category.includes('scol') || category.includes('éduc') || category.includes('exerc') ? 'Manuel scolaire' : 'default']
  const uc = userColors(colors)
  const pals = base.map((p, i) => {
    if (!uc.length) return p
    const main = uc[i % uc.length], acc = uc[(i + 1) % uc.length] !== main ? uc[(i + 1) % uc.length] : p[3]
    const dark = lum(main) < 0.5
    return i % 2 === 0 ? [main, shade(main, dark ? 0.15 : -0.1), dark ? '#f7f5f0' : '#1d2124', acc, '#ffffff'] : ['#f7f5f0', shade(main, 0.8), shade(main, -0.4), main, '#ffffff']
  })
  const fonts = FONTS_BY_STYLE[style] || FONTS_BY_STYLE.default
  const layouts: Layout[] = ['centered', 'geometric', 'typo', 'photo']
  const motifs: Motif[] = category.includes('Jeunesse') || style === 'Ludique' ? ['circles', 'stars', 'waves', 'leaves'] : ['mountains', 'circles', 'stripes', 'waves']
  const names = ['Classique centré', 'Géométrique moderne', 'Typographique audacieux', 'Visuel plein cadre']
  const desc = ['Composition symétrique et intemporelle, titre au centre optique.', 'Formes géométriques et contraste fort, lecture rapide en vignette.', 'Le titre devient l’image : grande typographie, hiérarchie marquée.', 'Image ou illustration en pleine page, bandeau de titre lisible.']
  return layouts.map((layout, i) => ({ name: names[i], concept: desc[i], layout, palette: pals[i % pals.length], titleFont: fonts[i % fonts.length][0], bodyFont: fonts[i % fonts.length][1], motif: motifs[i], upper: layout === 'typo' || fonts[i % fonts.length][0] === 'Bebas Neue', tagline: title ? '' : '' }))
}

const AI_FONTS = ['Inter', 'Playfair Display', 'Montserrat', 'Lora', 'Oswald', 'Bebas Neue', 'Merriweather', 'Poppins', 'Abril Fatface', 'Dancing Script']

export async function aiConcepts(kind: 'cover' | 'poster', brief: string, withSvg: boolean): Promise<Concept[]> {
  const txt = await askClaude({
    maxTokens: 30000,
    system: `Tu es directeur·rice artistique senior (édition et affiche). Tu conçois 4 concepts ${kind === 'cover' ? 'de couverture de livre' : "d'affiche"} VISUELLEMENT TRÈS DIFFÉRENTS et professionnels, adaptés au public et à la catégorie.
Réponds UNIQUEMENT avec un tableau JSON de 4 objets :
{"name": nom court du concept, "concept": justification en une phrase, "layout": un parmi "centered","geometric","typo","photo","frame","split" (4 valeurs différentes), "palette": [fond, fond secondaire, couleur du texte, accent, clair] en hex (contraste texte/fond ≥ 4.5), "titleFont": une parmi ${AI_FONTS.join(', ')}, "bodyFont": idem, "motif": un parmi "circles","waves","stripes","mountains","grid","stars","leaves","none", "upper": booléen (titre en capitales), "tagline": accroche courte ou "" ${withSvg ? ', "svg": une illustration vectorielle ORIGINALE en SVG (viewBox="0 0 400 400", formes plates, 6 à 25 éléments, aucune balise <text>, aucune image externe, couleurs de la palette) représentant le thème' : ''}}`,
    messages: [{ role: 'user', content: brief }],
  })
  const arr = extractJSON<Concept[]>(txt)
  return arr.slice(0, 4).map((c) => ({ ...c, palette: (c.palette || []).length >= 5 ? c.palette : ['#13294b', '#1f4e8c', '#ffffff', '#e3b04b', '#ffffff'], titleFont: AI_FONTS.includes(c.titleFont) ? c.titleFont : 'Playfair Display', bodyFont: AI_FONTS.includes(c.bodyFont) ? c.bodyFont : 'Montserrat' }))
}

// ───────────── Motifs vectoriels procéduraux ─────────────
function motif(m: Motif, x: number, y: number, w: number, h: number, pal: string[], seed: number): FabricObject[] {
  const rnd = (() => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280) })()
  const out: FabricObject[] = []
  const a = pal[3], l = pal[4], b2 = pal[1]
  if (m === 'circles') for (let i = 0; i < 7; i++) { const r = (0.06 + rnd() * 0.22) * w; out.push(new Circle({ left: x + rnd() * w - r, top: y + rnd() * h - r, radius: r, fill: [a, b2, l][i % 3], opacity: 0.18 + rnd() * 0.5 })) }
  if (m === 'waves') for (let i = 0; i < 5; i++) {
    const yy = y + h * (0.45 + i * 0.12); const amp = h * 0.05
    let d = `M ${x} ${yy}`; for (let k = 0; k <= 8; k++) d += ` Q ${x + (k + 0.5) * w / 8} ${yy + (k % 2 ? amp : -amp)} ${x + (k + 1) * w / 8} ${yy}`
    d += ` L ${x + w} ${y + h} L ${x} ${y + h} Z`
    out.push(new Path(d, { fill: [b2, a, l][i % 3], opacity: 0.25 + i * 0.12 }))
  }
  if (m === 'stripes') for (let i = 0; i < 9; i++) out.push(new Rect({ left: x - w * 0.3 + i * w * 0.18, top: y - h * 0.1, width: w * 0.05, height: h * 1.3, angle: 25, fill: i % 2 ? a : l, opacity: 0.22 }))
  if (m === 'mountains') {
    for (let i = 0; i < 3; i++) {
      const base = y + h; const pk = y + h * (0.35 + i * 0.15)
      let d = `M ${x} ${base}`; const n = 4 + i
      for (let k = 0; k <= n; k++) d += ` L ${x + (k / n) * w} ${k % 2 ? pk + rnd() * h * 0.1 : pk + h * 0.18 + rnd() * h * 0.1}`
      d += ` L ${x + w} ${base} Z`
      out.push(new Path(d, { fill: i === 2 ? pal[0] : [b2, a][i % 2], opacity: i === 2 ? 0.85 : 0.5 }))
    }
    out.unshift(new Circle({ left: x + w * 0.62, top: y + h * 0.18, radius: w * 0.09, fill: a, opacity: 0.9 }))
  }
  if (m === 'grid') for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) if (rnd() > 0.55) out.push(new Rect({ left: x + (i * w) / 6 + 4, top: y + (j * h) / 8 + 4, width: w / 6 - 8, height: h / 8 - 8, fill: rnd() > 0.5 ? a : l, opacity: 0.2 + rnd() * 0.4 }))
  if (m === 'stars') for (let i = 0; i < 26; i++) { const r = 2 + rnd() * w * 0.012; out.push(new Circle({ left: x + rnd() * w, top: y + rnd() * h * 0.7, radius: r, fill: rnd() > 0.7 ? a : l, opacity: 0.5 + rnd() * 0.5 })) }
  if (m === 'leaves') for (let i = 0; i < 9; i++) {
    const s = w * (0.08 + rnd() * 0.12), cx = x + rnd() * w, cy = y + rnd() * h
    out.push(new Path(`M 0 0 Q ${s} ${-s * 0.6} ${s * 2} 0 Q ${s} ${s * 0.6} 0 0 Z`, { left: cx, top: cy, angle: rnd() * 360, fill: [a, b2, l][i % 3], opacity: 0.45 + rnd() * 0.4 }))
  }
  out.forEach((o) => { (o as FabricObject & { name?: string }).name = 'Motif'; o.set({ evented: true }) })
  return out
}

async function svgIllustration(svg: string, x: number, y: number, w: number, h: number): Promise<FabricObject | null> {
  try {
    if (!/^\s*<svg[\s\S]*<\/svg>\s*$/i.test(svg) || /<script|<foreignObject|href\s*=\s*["']https?:/i.test(svg)) return null
    const { objects, options } = await loadSVGFromString(svg)
    const g = util.groupSVGElements(objects.filter(Boolean) as FabricObject[], options)
    const s = Math.min(w / (g.width || 1), h / (g.height || 1))
    g.set({ left: x + (w - (g.width || 0) * s) / 2, top: y + (h - (g.height || 0) * s) / 2, scaleX: s, scaleY: s })
    ;(g as FabricObject & { name?: string }).name = 'Illustration IA'
    return g
  } catch { return null }
}

async function photo(src: string, x: number, y: number, w: number, h: number): Promise<FabricObject | null> {
  try {
    const img = await FabricImage.fromURL(src)
    const s = Math.max(w / img.width, h / img.height)
    const cw = w / s, ch = h / s
    img.set({ cropX: (img.width - cw) / 2, cropY: (img.height - ch) / 2, width: cw, height: ch, left: x, top: y, scaleX: s, scaleY: s })
    ;(img as FabricObject & { name?: string }).name = 'Photo'
    return img
  } catch { return null }
}

const named = <T extends FabricObject>(o: T, name: string, role?: string) => { (o as T & { name?: string; edRole?: string }).name = name; if (role) (o as T & { edRole?: string }).edRole = role; return o }

interface Zone { x: number; y: number; w: number; h: number }
interface TextSet { title: string; subtitle: string; author: string; tagline: string; extra?: string[]; info?: CoverInfo; accent?: string }

/** Compose une face (1ʳᵉ de couverture ou affiche) dans la zone donnée. */
async function composeFace(objs: FabricObject[], z: Zone, t: TextSet, c: Concept, images: string[], seed: number, bleedPx: number) {
  const [bg, bg2, ink, acc, light] = c.palette
  const { x, y, w, h } = z
  const full = { x: x - bleedPx, y: y - bleedPx, w: w + bleedPx * 2, h: h + bleedPx * 2 }
  const T = c.upper ? t.title.toUpperCase() : t.title
  const tsize = (base: number) => Math.max(w * 0.06, Math.min(base, (w * 1.9) / Math.max(4, Math.sqrt(T.length) * 3.2)))
  const title = (opts: Partial<Textbox> & { size: number; color?: string; align?: string; top: number; left?: number; width?: number }) => named(new Textbox(T, { left: opts.left ?? x + w * 0.1, top: opts.top, width: opts.width ?? w * 0.8, fontSize: opts.size, fontFamily: c.titleFont, fontWeight: 700, fill: opts.color ?? ink, textAlign: (opts.align ?? 'center') as never, lineHeight: 1.05, charSpacing: c.upper ? 40 : 0, splitByGrapheme: false }), 'Titre', 'title')
  const text = (s: string, top: number, size: number, color: string, align = 'center', name = 'Texte', opts: Partial<Textbox> = {}) => named(new Textbox(s, { left: x + w * 0.1, top, width: w * 0.8, fontSize: size, fontFamily: c.bodyFont, fill: color, textAlign: align as never, lineHeight: 1.2, ...opts }), name, name.toLowerCase())
  const extras = (top: number, color: string, align = 'center', left?: number) => (t.extra || []).filter(Boolean).forEach((e, i) => objs.push(text(e, top + i * w * 0.055, w * 0.038, color, align, 'Info', left ? { left, width: w * 0.8 } : {})))

  const bgRect = named(new Rect({ left: full.x, top: full.y, width: full.w, height: full.h, fill: bg }), 'Fond', 'background')
  objs.push(bgRect)

  const illu = async (zz: Zone) => {
    if (images[0]) { const p = await photo(images[0], zz.x, zz.y, zz.w, zz.h); if (p) { objs.push(p); return } }
    if (c.svg) { const s = await svgIllustration(c.svg, zz.x, zz.y, zz.w, zz.h); if (s) { objs.push(s); return } }
    objs.push(...motif(c.motif, zz.x, zz.y, zz.w, zz.h, c.palette, seed))
  }

  switch (c.layout) {
    case 'centered': {
      bgRect.set('fill', new Gradient({ type: 'linear', coords: { x1: 0, y1: 0, x2: 0, y2: full.h }, colorStops: [{ offset: 0, color: bg }, { offset: 1, color: bg2 }] }))
      await illu({ x, y: y + h * 0.45, w, h: h * 0.55 + bleedPx })
      objs.push(named(new Line([x + w * 0.38, y + h * 0.13, x + w * 0.62, y + h * 0.13], { stroke: acc, strokeWidth: Math.max(2, w * 0.006) }), 'Filet'))
      if (t.author) objs.push(text(t.author, y + h * 0.07, w * 0.045, ink, 'center', 'Auteur', { charSpacing: 120 }))
      objs.push(title({ size: tsize(w * 0.12), top: y + h * 0.17 }))
      if (t.subtitle) objs.push(text(t.subtitle, y + h * 0.36, w * 0.042, ink, 'center', 'Sous-titre', { fontStyle: 'italic' }))
      if (t.tagline) objs.push(text(t.tagline, y + h * 0.9, w * 0.034, light, 'center', 'Accroche'))
      extras(y + h * 0.42, ink)
      break
    }
    case 'geometric': {
      objs.push(named(new Rect({ left: full.x, top: full.y, width: full.w * 0.42, height: full.h, fill: acc }), 'Bandeau'))
      objs.push(named(new Circle({ left: x + w * 0.25, top: y + h * 0.08, radius: w * 0.33, fill: bg2, opacity: 0.9 }), 'Cercle'))
      objs.push(named(new Triangle({ left: x + w * 0.55, top: y + h * 0.55, width: w * 0.5, height: w * 0.45, fill: light, opacity: 0.15, angle: 12 }), 'Triangle'))
      await illu({ x: x + w * 0.32, y: y + h * 0.12, w: w * 0.6, h: h * 0.38 })
      objs.push(title({ size: tsize(w * 0.11), top: y + h * 0.58, align: 'left', left: x + w * 0.08, width: w * 0.84, color: ink }))
      if (t.subtitle) objs.push(text(t.subtitle, y + h * 0.8, w * 0.04, ink, 'left', 'Sous-titre', { left: x + w * 0.08, width: w * 0.84 }))
      if (t.author) objs.push(text(t.author.toUpperCase(), y + h * 0.9, w * 0.042, ink, 'left', 'Auteur', { left: x + w * 0.08, width: w * 0.84, charSpacing: 150, fontWeight: 700 }))
      extras(y + h * 0.05, ink, 'left', x + w * 0.08)
      break
    }
    case 'typo': {
      objs.push(...motif(c.motif === 'none' ? 'stripes' : c.motif, full.x, full.y, full.w, full.h, c.palette, seed).map((o) => o.set({ opacity: 0.08 })))
      const big = title({ size: tsize(w * 0.2), top: y + h * 0.16, align: 'left', left: x + w * 0.07, width: w * 0.88, color: ink })
      big.set({ lineHeight: 0.92 })
      objs.push(big)
      objs.push(named(new Rect({ left: x + w * 0.07, top: y + h * 0.1, width: w * 0.18, height: Math.max(4, h * 0.012), fill: acc }), 'Filet'))
      if (t.subtitle) objs.push(text(t.subtitle, y + h * 0.7, w * 0.045, acc, 'left', 'Sous-titre', { left: x + w * 0.07, width: w * 0.8, fontWeight: 700 }))
      if (t.author) objs.push(text(t.author, y + h * 0.88, w * 0.05, ink, 'left', 'Auteur', { left: x + w * 0.07, width: w * 0.8 }))
      if (t.tagline) objs.push(text(t.tagline, y + h * 0.8, w * 0.034, ink, 'left', 'Accroche', { left: x + w * 0.07, width: w * 0.8, fontStyle: 'italic' }))
      extras(y + h * 0.04, ink, 'left', x + w * 0.07)
      break
    }
    case 'photo': {
      await illu(full)
      objs.push(named(new Rect({ left: full.x, top: y + h * 0.5, width: full.w, height: h * 0.5 + bleedPx, fill: new Gradient({ type: 'linear', coords: { x1: 0, y1: 0, x2: 0, y2: h * 0.5 }, colorStops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 1, color: bg }] }) }), 'Dégradé'))
      const tt = title({ size: tsize(w * 0.12), top: y + h * 0.62, color: light })
      tt.set({ shadow: new Shadow({ color: 'rgba(0,0,0,0.45)', blur: 12, offsetX: 0, offsetY: 3 }) })
      objs.push(tt)
      if (t.subtitle) objs.push(text(t.subtitle, y + h * 0.82, w * 0.04, light, 'center', 'Sous-titre'))
      if (t.author) objs.push(text(t.author.toUpperCase(), y + h * 0.05, w * 0.04, light, 'center', 'Auteur', { charSpacing: 200, shadow: new Shadow({ color: 'rgba(0,0,0,0.5)', blur: 8 }) }))
      if (t.tagline) objs.push(named(new Rect({ left: x + w * 0.3, top: y + h * 0.9, width: w * 0.4, height: w * 0.06, fill: acc, rx: 6, ry: 6 }), 'Pastille'), text(t.tagline, y + h * 0.9 + w * 0.012, w * 0.03, ink, 'center', 'Accroche', { left: x + w * 0.3, width: w * 0.4 }))
      extras(y + h * 0.88, light)
      break
    }
    case 'frame': {
      objs.push(named(new Rect({ left: x + w * 0.06, top: y + h * 0.05, width: w * 0.88, height: h * 0.9, fill: 'transparent', stroke: acc, strokeWidth: Math.max(2, w * 0.005) }), 'Cadre'))
      objs.push(named(new Rect({ left: x + w * 0.08, top: y + h * 0.065, width: w * 0.84, height: h * 0.87, fill: 'transparent', stroke: acc, strokeWidth: 1 }), 'Cadre fin'))
      await illu({ x: x + w * 0.2, y: y + h * 0.5, w: w * 0.6, h: h * 0.34 })
      objs.push(title({ size: tsize(w * 0.1), top: y + h * 0.18 }))
      if (t.subtitle) objs.push(text(t.subtitle, y + h * 0.38, w * 0.04, ink, 'center', 'Sous-titre', { fontStyle: 'italic' }))
      if (t.author) objs.push(text(t.author, y + h * 0.1, w * 0.04, acc, 'center', 'Auteur', { charSpacing: 100 }))
      extras(y + h * 0.86, ink)
      break
    }
    case 'split': {
      objs.push(named(new Rect({ left: full.x, top: full.y, width: full.w, height: bleedPx + h * 0.55, fill: bg2 }), 'Bloc'))
      await illu({ x, y, w, h: h * 0.55 })
      objs.push(named(new Rect({ left: x + w * 0.08, top: y + h * 0.53, width: w * 0.84, height: h * 0.06, fill: acc }), 'Bandeau'))
      if (t.tagline) objs.push(text(t.tagline, y + h * 0.545, w * 0.03, ink, 'center', 'Accroche', { fontWeight: 700 }))
      objs.push(title({ size: tsize(w * 0.1), top: y + h * 0.63 }))
      if (t.subtitle) objs.push(text(t.subtitle, y + h * 0.82, w * 0.038, ink, 'center', 'Sous-titre'))
      if (t.author) objs.push(text(t.author, y + h * 0.91, w * 0.04, ink, 'center', 'Auteur', { fontWeight: 700 }))
      extras(y + h * 0.04, light)
      break
    }
  }
  const tt = objs.find((o) => (o as FabricObject & { edRole?: string }).edRole === 'title') as Textbox | undefined
  if (tt && t.info) applyTitleStyle(tt, t.info, t.title, t.accent)
  reflow(objs, z)
}

/** Évite les chevauchements : le sous-titre et les infos suivent la hauteur réelle du titre. */
function reflow(objs: FabricObject[], z: Zone) {
  const role = (o: FabricObject) => (o as FabricObject & { edRole?: string }).edRole
  const title = objs.find((o) => role(o) === 'title') as Textbox | undefined
  if (!title) return
  // titre trop haut : on réduit le corps
  while ((title.height || 0) > z.h * 0.42 && (title.fontSize || 0) > 12) { title.set({ fontSize: (title.fontSize || 0) * 0.92 }); title.initDimensions() }
  const gap = z.h * 0.02
  let cursor = (title.top || 0) + (title.height || 0)
  const followers = objs.filter((o) => ['sous-titre', 'info'].includes(role(o) || '') && (o.top || 0) > (title.top || 0)).sort((a, b) => (a.top || 0) - (b.top || 0))
  for (const o of followers) {
    if ((o.top || 0) < cursor + gap) o.set({ top: cursor + gap })
    cursor = (o.top || 0) + (o.height || 0)
  }
}

// ───────────── Couverture complète : 4ᵉ | dos | 1ʳᵉ ─────────────
export const COVER_PX_PER_MM = 6

export type CoverSpec = ReturnType<typeof coverSpec>
export function coverGeometry(spec: CoverSpec) {
  const k = COVER_PX_PER_MM
  return { spine: spec.spine, width: spec.totalW * k, height: spec.totalH * k, back: spec.trimW * k, spinePx: spec.spine * k, front: spec.trimW * k, bleed: spec.bleed * k, flap: spec.flap * k }
}
type Geo = ReturnType<typeof coverGeometry>
const zones = (g: Geo) => { const backX = g.bleed + g.flap; const sx = backX + g.back; const frontX = sx + g.spinePx; return { backX, sx, frontX, ffX: frontX + g.front } }

// ───────── Effets de titre (partagés avec l'éditeur)
export const TITLE_EFFECTS: { id: string; label: string }[] = [
  { id: 'none', label: 'Aucun' }, { id: 'or', label: 'Doré' }, { id: 'argent', label: 'Argent' }, { id: 'degrade', label: 'Dégradé' },
  { id: 'contour', label: 'Contour' }, { id: 'ombre', label: 'Ombre portée' }, { id: 'relief', label: 'Relief' }, { id: 'neon', label: 'Néon' },
]
export function applyTitleEffect(o: FabricObject, effect: string, color = '#ffffff', accent = '#d6406f') {
  const h = (o.height || 100)
  const grad = (stops: string[]) => new Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: 0, y1: 0, x2: 0, y2: h }, colorStops: stops.map((c, i) => ({ offset: i / (stops.length - 1), color: c })) })
  o.set({ shadow: null, stroke: null, strokeWidth: 0, paintFirst: 'fill' } as Partial<FabricObject>)
  if (effect === 'or') o.set({ fill: grad(['#fff3c4', '#e7c06a', '#b8862e', '#f3d27a']), shadow: new Shadow({ color: 'rgba(0,0,0,.35)', blur: 6, offsetX: 0, offsetY: 3 }) })
  else if (effect === 'argent') o.set({ fill: grad(['#ffffff', '#cfd5dc', '#8e98a3', '#e6eaee']), shadow: new Shadow({ color: 'rgba(0,0,0,.35)', blur: 6, offsetX: 0, offsetY: 3 }) })
  else if (effect === 'degrade') o.set({ fill: new Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: 0, y1: 0, x2: o.width || 300, y2: 0 }, colorStops: [{ offset: 0, color: '#ff7a59' }, { offset: 0.5, color: '#d6406f' }, { offset: 1, color: '#7c4ddb' }] }) })
  else if (effect === 'contour') o.set({ fill: 'rgba(0,0,0,0)', stroke: color, strokeWidth: Math.max(1.5, (o as Textbox).fontSize! / 28) })
  else if (effect === 'ombre') o.set({ fill: color, shadow: new Shadow({ color: 'rgba(0,0,0,.55)', blur: 18, offsetX: 6, offsetY: 8 }) })
  else if (effect === 'relief') o.set({ fill: color, shadow: new Shadow({ color: 'rgba(0,0,0,.6)', blur: 0, offsetX: 4, offsetY: 4 }) })
  else if (effect === 'neon') o.set({ fill: '#ffffff', shadow: new Shadow({ color: accent, blur: 28, offsetX: 0, offsetY: 0 }) })
  else o.set({ fill: color })
}

/** Applique la typographie du titre choisie dans le formulaire de couverture. */
export function applyTitleStyle(tb: Textbox, info: CoverInfo, rawTitle: string, accent?: string) {
  const p: Partial<Textbox> = {}
  if (info.titleCase) p.text = info.titleCase === 'upper' ? rawTitle.toUpperCase() : info.titleCase === 'lower' ? rawTitle.toLowerCase() : rawTitle
  if (info.titleFont) p.fontFamily = info.titleFont
  if (info.titleWeight) p.fontWeight = info.titleWeight
  if (info.titleSpacing !== undefined) p.charSpacing = info.titleSpacing
  if (info.titleLineHeight) p.lineHeight = info.titleLineHeight
  if (info.titleAlign) p.textAlign = info.titleAlign
  if (info.titleScale && info.titleScale !== 1) p.fontSize = (tb.fontSize || 60) * info.titleScale
  tb.set(p)
  tb.initDimensions()
  const color = info.titleColor || (typeof tb.fill === 'string' ? tb.fill : '#ffffff')
  if (info.titleEffect && info.titleEffect !== 'none') applyTitleEffect(tb, info.titleEffect, color, accent)
  else if (info.titleColor) tb.set({ fill: info.titleColor })
}

function zoneLabels(g: Geo, spec: CoverSpec): FabricObject[] {
  const z = zones(g)
  const fs = Math.max(14, Math.min(22, g.back * 0.03))
  const lab = (text: string, x: number, w: number) => named(new Textbox(text, { left: x, top: g.bleed + 10, width: w, fontSize: fs, fontFamily: 'Inter', fontWeight: 700, fill: 'rgba(47,155,255,.75)', textAlign: 'center', charSpacing: 120, selectable: false, evented: false }), 'Repère', 'guide')
  const out = [lab('4ᵉ DE COUVERTURE', z.backX, g.back), lab('1ʳᵉ DE COUVERTURE', z.frontX, g.front)]
  if (g.spinePx > 40) out.push(lab(`DOS ${spec.spine} mm`, z.sx, g.spinePx))
  if (g.flap) out.push(lab('RABAT ARRIÈRE', g.bleed, g.flap), lab('RABAT AVANT', z.ffX, g.flap))
  return out
}

function coverGuides(g: Geo): FabricObject[] {
  const z = zones(g)
  const o = guides(g.width, g.height, g.bleed, [z.sx, z.frontX])
  const mk = (x: number) => named(new Line([x, 0, x, g.height], { stroke: '#2fbf71', strokeWidth: 1.5, strokeDashArray: [4, 6], selectable: false, evented: false }), 'Repère', 'guide')
  if (g.flap) o.push(mk(z.backX), mk(z.ffX))
  return o
}

const docOf = (g: Geo, spec: CoverSpec, json: unknown): DesignDoc => ({ width: g.width, height: g.height, unitsPerMm: COVER_PX_PER_MM, bleedMm: spec.bleed, json, coverGuides: { back: g.back, spine: g.spinePx, front: g.front, bleed: g.bleed, flap: g.flap } })

function finish(objs: FabricObject[], g: Geo, spec: CoverSpec) {
  objs.push(...coverGuides(g), ...zoneLabels(g, spec))
  const el = document.createElement('canvas')
  const sc = new StaticCanvas(el, { width: g.width, height: g.height })
  objs.forEach((o) => sc.add(o))
  const json = toJSON(sc)
  sc.dispose()
  return { json, doc: docOf(g, spec, json) }
}

export async function buildCover(info: CoverInfo, c: Concept, spec: CoverSpec, seed: number): Promise<{ json: unknown; doc: DesignDoc }> {
  const g = coverGeometry(spec)
  const z = zones(g)
  await ensureFonts([c.titleFont, c.bodyFont, ...(info.titleFont ? [info.titleFont] : [])])
  const objs: FabricObject[] = []
  const [bg, , ink, acc] = c.palette
  const b = g.bleed
  const frontEnd = g.flap ? g.front : g.front + b
  const face: FabricObject[] = []
  await composeFace(face, { x: z.frontX, y: b, w: g.front, h: g.height - 2 * b }, { title: info.title || 'Titre du livre', subtitle: info.subtitle, author: info.author, tagline: c.tagline, info, accent: acc }, c, info.images, seed, b)
  objs.push(named(new Rect({ left: 0, top: 0, width: g.width, height: g.height, fill: bg }), 'Fond général', 'background'))
  const faceBg = face.shift() as Rect
  faceBg.set({ left: z.frontX, top: 0, width: frontEnd, height: g.height })
  objs.push(named(faceBg, 'Fond 1ʳᵉ', 'front-bg'))
  face.forEach((o) => { o.clipPath = new Rect({ left: z.frontX, top: 0, width: frontEnd, height: g.height, absolutePositioned: true }) })
  objs.push(...face)
  // dos
  objs.push(named(new Rect({ left: z.sx, top: 0, width: g.spinePx, height: g.height, fill: c.layout === 'geometric' || c.layout === 'split' ? acc : shade(bg, lum(bg) > 0.5 ? -0.06 : 0.08) }), 'Fond du dos', 'spine'))
  if (g.spinePx >= 5 * COVER_PX_PER_MM) {
    const spineInk = c.layout === 'geometric' || c.layout === 'split' ? (lum(acc) > 0.55 ? '#1d2124' : '#ffffff') : ink
    const fs = Math.min(g.spinePx * 0.45, 26)
    objs.push(named(new Textbox(`${(info.title || 'Titre').toUpperCase()}${info.author ? '   •   ' + info.author : ''}`, { left: z.sx + g.spinePx / 2 + fs * 0.6, top: b + 14 * COVER_PX_PER_MM, width: g.height - 2 * b - 28 * COVER_PX_PER_MM, fontSize: fs, fontFamily: info.titleFont || c.bodyFont, fontWeight: 700, fill: spineInk, textAlign: 'center', angle: 90, charSpacing: 60 }), 'Texte du dos', 'spine-text'))
    if (info.publisher) objs.push(named(new Textbox(info.publisher, { left: z.sx + g.spinePx / 2 + Math.min(g.spinePx * 0.22, 16), top: g.height - b - 30 * COVER_PX_PER_MM, width: 24 * COVER_PX_PER_MM, fontSize: Math.min(g.spinePx * 0.32, 16), fontFamily: c.bodyFont, fill: spineInk, textAlign: 'center', angle: 90 }), 'Éditeur (dos)', 'spine-text'))
  }
  // 4ᵉ de couverture
  const bx = z.backX + g.back * 0.12, bw = g.back * 0.76
  const backText = info.backText || 'Rédigez ici le texte de quatrième de couverture : résumé, extrait, présentation de l’auteur…'
  objs.push(named(new Textbox((info.title || 'Titre').toString(), { left: bx, top: b + g.height * 0.1, width: bw, fontSize: g.back * 0.065, fontFamily: info.titleFont || c.titleFont, fontWeight: 700, fill: ink, textAlign: 'left' }), 'Titre (4ᵉ)', 'back-title'))
  objs.push(named(new Rect({ left: bx, top: b + g.height * 0.1 + g.back * 0.12, width: g.back * 0.15, height: 4, fill: acc }), 'Filet (4ᵉ)'))
  objs.push(named(new Textbox(backText, { left: bx, top: b + g.height * 0.24, width: bw, fontSize: g.back * 0.034, fontFamily: c.bodyFont, fill: ink, textAlign: 'left', lineHeight: 1.45 }), 'Texte de 4ᵉ', 'back-text'))
  objs.push(barcode(info, z.backX + g.back - 52 * COVER_PX_PER_MM, g.height - b - 34 * COVER_PX_PER_MM))
  const bcY = g.height - b - 34 * COVER_PX_PER_MM
  if (info.price) objs.push(named(new Textbox(info.price, { left: bx, top: bcY + 22 * COVER_PX_PER_MM - 30, width: g.back * 0.3, fontSize: 24, fontFamily: c.bodyFont, fontWeight: 700, fill: ink }), 'Prix'))
  if (info.publisher) objs.push(named(new Textbox(info.publisher, { left: bx, top: bcY, width: g.back * 0.4, fontSize: 22, fontFamily: c.titleFont, fill: ink }), 'Éditeur'))
  // rabats
  if (g.flap) objs.push(...flapContent(g, info, c.bodyFont, info.titleFont || c.titleFont, shade(bg, lum(bg) > 0.5 ? -0.04 : 0.05), ink, acc))
  return finish(objs, g, spec)
}

function barcode(info: CoverInfo, x: number, y: number) {
  const bcW = 40 * COVER_PX_PER_MM, bcH = 22 * COVER_PX_PER_MM
  const bars: FabricObject[] = [new Rect({ left: 0, top: 0, width: bcW, height: bcH, fill: '#ffffff' })]
  const isbn = (info.isbn || '9780000000000').replace(/\D/g, '')
  let bxp = 8
  for (let i = 0; i < 60 && bxp < bcW - 8; i++) { const d = +isbn[i % isbn.length] || 1; const ww = 1 + (d % 3); if (i % 2 === 0) bars.push(new Rect({ left: bxp, top: 8, width: ww * 1.4, height: bcH - 34, fill: '#000' })); bxp += ww * 1.6 }
  bars.push(new Textbox('ISBN ' + (info.isbn || '978-0-00-000000-0'), { left: 0, top: bcH - 22, width: bcW, fontSize: 13, fontFamily: 'Inter', fill: '#000', textAlign: 'center' }))
  return named(new Group(bars, { left: x, top: y }), 'Code-barres ISBN', 'barcode')
}

function flapContent(g: Geo, info: CoverInfo, body: string, titleF: string, fill: string, ink: string, acc: string): FabricObject[] {
  const z = zones(g)
  const b = g.bleed, pad = g.flap * 0.12, w = g.flap - pad * 2
  const out: FabricObject[] = [
    named(new Rect({ left: 0, top: 0, width: z.backX, height: g.height, fill }), 'Fond rabat arrière', 'flap-bg'),
    named(new Rect({ left: z.ffX, top: 0, width: g.flap + b, height: g.height, fill }), 'Fond rabat avant', 'flap-bg'),
    // rabat arrière : l'auteur
    named(new Rect({ left: b + pad, top: b + g.height * 0.1, width: w * 0.6, height: w * 0.6, rx: 12, ry: 12, fill: 'rgba(127,127,127,.18)', stroke: acc, strokeWidth: 2, strokeDashArray: [10, 8] }), 'Cadre photo de l’auteur', 'flap'),
    named(new Textbox(info.author || 'L’auteur', { left: b + pad, top: b + g.height * 0.1 + w * 0.68, width: w, fontSize: g.flap * 0.075, fontFamily: titleF, fontWeight: 700, fill: ink }), 'Nom (rabat)', 'flap'),
    named(new Textbox('Biographie de l’auteur : parcours, ouvrages précédents, prix…', { left: b + pad, top: b + g.height * 0.1 + w * 0.68 + g.flap * 0.12, width: w, fontSize: g.flap * 0.045, fontFamily: body, fill: ink, lineHeight: 1.45 }), 'Biographie (rabat)', 'flap'),
    // rabat avant : présentation
    named(new Rect({ left: z.ffX + pad, top: b + g.height * 0.1, width: g.flap * 0.18, height: 4, fill: acc }), 'Filet (rabat avant)', 'flap'),
    named(new Textbox('Présentation de l’ouvrage, citation ou extrait de presse.', { left: z.ffX + pad, top: b + g.height * 0.13, width: w, fontSize: g.flap * 0.05, fontFamily: body, fontStyle: 'italic', fill: ink, lineHeight: 1.5 }), 'Présentation (rabat avant)', 'flap'),
  ]
  return out
}

/** Couverture vierge : uniquement le gabarit (zones, plis, fonds perdus), pour une création 100 % libre. */
export async function buildBlankCover(info: CoverInfo, spec: CoverSpec, bg = '#ffffff'): Promise<{ json: unknown; doc: DesignDoc }> {
  const g = coverGeometry(spec)
  const objs: FabricObject[] = [named(new Rect({ left: 0, top: 0, width: g.width, height: g.height, fill: bg }), 'Fond général', 'background')]
  void info
  return finish(objs, g, spec)
}

/** Réajuste une couverture existante à de nouvelles dimensions (dos, rabats, format) sans perdre le travail. */
export async function refitCover(doc: DesignDoc, spec: CoverSpec): Promise<DesignDoc> {
  const og = doc.coverGuides!
  const old: Geo = { spine: og.spine / COVER_PX_PER_MM, width: doc.width, height: doc.height, back: og.back, spinePx: og.spine, front: og.front, bleed: og.bleed, flap: og.flap || 0 }
  const g = coverGeometry(spec)
  const zo = zones(old), zn = zones(g)
  const el = document.createElement('canvas')
  const sc = new StaticCanvas(el, { width: doc.width, height: doc.height })
  await sc.loadFromJSON(doc.json as Record<string, unknown>)
  const sy = g.height / old.height, sxs = g.front / old.front
  const role = (o: FabricObject) => (o as FabricObject & { edRole?: string }).edRole
  const dx = (cx: number) => {
    if (cx < zo.backX) return 0 // rabat arrière
    if (cx < zo.sx) return zn.backX - zo.backX
    if (cx < zo.frontX) return zn.sx + g.spinePx / 2 - (zo.sx + old.spinePx / 2)
    if (cx < zo.ffX) return zn.frontX - zo.frontX
    return zn.ffX - zo.ffX
  }
  for (const o of [...sc.getObjects()]) {
    const r = role(o)
    if (r === 'guide') { sc.remove(o); continue }
    if (r === 'background') { o.set({ left: 0, top: 0, width: g.width, height: g.height, scaleX: 1, scaleY: 1 }); continue }
    if (r === 'spine') { o.set({ left: zn.sx, top: 0, width: g.spinePx, height: g.height }); continue }
    if (r === 'front-bg' || (o as FabricObject & { name?: string }).name === 'Fond 1ʳᵉ') { o.set({ left: zn.frontX, top: 0, width: g.flap ? g.front : g.front + g.bleed, height: g.height }); continue }
    if (r === 'flap-bg' && !g.flap) { sc.remove(o); continue }
    const bb = o.getBoundingRect()
    const cx = bb.left + bb.width / 2
    const d = dx(cx)
    o.set({ left: (o.left || 0) + d, top: (o.top || 0) * sy })
    if (o.clipPath && (o.clipPath as FabricObject & { absolutePositioned?: boolean }).absolutePositioned) o.clipPath.set({ left: zn.frontX, width: g.flap ? g.front : g.front + g.bleed, height: g.height })
    if (r === 'spine-text') o.set({ top: (o.top || 0) })
    o.setCoords()
  }
  void sxs
  // rabats ajoutés : fonds et zones prêtes à remplir
  if (g.flap && !old.flap) {
    const bgObj = sc.getObjects().find((o) => role(o) === 'background')
    const base = typeof bgObj?.fill === 'string' ? bgObj.fill : '#ffffff'
    const extra = flapContent(g, { author: '', title: '' } as CoverInfo, 'Inter', 'Playfair Display', shade(base.startsWith('#') ? base : '#ffffff', lum(base.startsWith('#') ? base : '#ffffff') > 0.5 ? -0.04 : 0.05), lum(base.startsWith('#') ? base : '#ffffff') > 0.5 ? '#1d2124' : '#f3f1ec', '#d6406f')
    extra.forEach((o, i) => sc.insertAt(i < 2 ? 1 : sc.getObjects().length, o))
  } else if (g.flap && old.flap) {
    for (const o of sc.getObjects()) if (role(o) === 'flap-bg') { const isBack = (o.left || 0) < zn.backX; o.set(isBack ? { left: 0, width: zn.backX, height: g.height } : { left: zn.ffX, width: g.flap + g.bleed, height: g.height }) }
  }
  sc.setDimensions({ width: g.width, height: g.height })
  ;[...coverGuides(g), ...zoneLabels(g, spec)].forEach((o) => sc.add(o))
  const json = toJSON(sc)
  sc.dispose()
  return docOf(g, spec, json)
}

function guides(w: number, h: number, b: number, verticals: number[]): FabricObject[] {
  const o: FabricObject[] = []
  const mk = (x1: number, y1: number, x2: number, y2: number, color: string) => { const l = new Line([x1, y1, x2, y2], { stroke: color, strokeWidth: 1.5, strokeDashArray: [8, 6], selectable: false, evented: false }); return named(l, 'Repère', 'guide') }
  if (b > 0) o.push(mk(b, 0, b, h, '#e5484d'), mk(w - b, 0, w - b, h, '#e5484d'), mk(0, b, w, b, '#e5484d'), mk(0, h - b, w, h - b, '#e5484d'))
  verticals.forEach((x) => o.push(mk(x, 0, x, h, '#2f9bff')))
  return o
}

export async function buildPoster(p: PosterData, c: Concept, seed: number): Promise<{ json: unknown; doc: DesignDoc }> {
  const f = POSTER_FORMATS[p.format] || POSTER_FORMATS.a3
  const k = f.px ? 1 : 3
  const bleed = f.px ? 0 : 3
  const W = (f.w + bleed * 2) * k, H = (f.h + bleed * 2) * k
  await ensureFonts([c.titleFont, c.bodyFont])
  const objs: FabricObject[] = []
  const B = p.brief
  const landscape = f.w > f.h * 1.2
  const zone = { x: bleed * k, y: bleed * k, w: f.w * k, h: f.h * k }
  if (landscape) {
    // formats bannière : composition horizontale
    const [bg, bg2, ink, acc] = c.palette
    objs.push(named(new Rect({ left: 0, top: 0, width: W, height: H, fill: new Gradient({ type: 'linear', coords: { x1: 0, y1: 0, x2: W, y2: 0 }, colorStops: [{ offset: 0, color: bg }, { offset: 1, color: bg2 }] }) }), 'Fond', 'background'))
    if (B.images[0]) { const ph = await photo(B.images[0], W * 0.55, 0, W * 0.45, H); if (ph) objs.push(ph) } else objs.push(...motif(c.motif === 'none' ? 'circles' : c.motif, W * 0.5, 0, W * 0.5, H, c.palette, seed))
    objs.push(named(new Rect({ left: zone.x + zone.w * 0.05, top: zone.y + zone.h * 0.18, width: zone.w * 0.006 + 4, height: zone.h * 0.64, fill: acc }), 'Filet'))
    objs.push(named(new Textbox(c.upper ? (B.title || 'Titre').toUpperCase() : B.title || 'Titre', { left: zone.x + zone.w * 0.08, top: zone.y + zone.h * 0.16, width: zone.w * 0.45, fontSize: zone.h * 0.2, fontFamily: c.titleFont, fontWeight: 700, fill: ink, lineHeight: 1 }), 'Titre', 'title'))
    const info = [B.subtitle, [B.date, B.place].filter(Boolean).join(' — '), B.contact].filter(Boolean).join('\n')
    objs.push(named(new Textbox(info, { left: zone.x + zone.w * 0.08, top: zone.y + zone.h * 0.58, width: zone.w * 0.45, fontSize: zone.h * 0.075, fontFamily: c.bodyFont, fill: ink, lineHeight: 1.25 }), 'Informations'))
  } else {
    await composeFace(objs, zone, { title: B.title || 'Titre de l’affiche', subtitle: B.subtitle, author: '', tagline: c.tagline, extra: [B.date, B.place, B.contact] }, c, B.images, seed, bleed * k)
  }
  if (bleed) objs.push(...guides(W, H, bleed * k, []))
  const el = document.createElement('canvas')
  const sc = new StaticCanvas(el, { width: W, height: H })
  objs.forEach((o) => sc.add(o))
  const json = toJSON(sc)
  sc.dispose()
  return { json, doc: { width: W, height: H, unitsPerMm: f.px ? 0 : k, bleedMm: bleed, json } }
}

export async function proposalsFrom(concepts: Concept[], build: (c: Concept, i: number) => Promise<{ json: unknown; doc: DesignDoc }>): Promise<(Proposal & { doc: DesignDoc })[]> {
  const out: (Proposal & { doc: DesignDoc })[] = []
  for (let i = 0; i < concepts.length; i++) {
    const r = await build(concepts[i], i)
    const thumb = await renderThumb(r.json, r.doc.width, r.doc.height, 520)
    out.push({ id: uid(), name: concepts[i].name, concept: concepts[i].concept, json: r.json, thumb, doc: r.doc })
  }
  return out
}

export const renderThumbOf = (json: unknown, w: number, h: number) => renderThumb(json, w, h, 520)
