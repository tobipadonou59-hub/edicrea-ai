import type { BookData, CoverInfo, LayoutSettings, StyleSheet, TextStyle, PosterData } from './types'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const BOOK_FORMATS: Record<string, { label: string; w: number; h: number; group?: string }> = {
  poche: { label: 'Poche (110 × 178 mm)', w: 110, h: 178, group: 'Romans et littérature' },
  poche2: { label: 'Poche grand (125 × 190 mm)', w: 125, h: 190, group: 'Romans et littérature' },
  roman: { label: 'Roman (130 × 200 mm)', w: 130, h: 200, group: 'Romans et littérature' },
  roman2: { label: 'Roman grand format (140 × 225 mm)', w: 140, h: 225, group: 'Romans et littérature' },
  royal: { label: 'Royal (156 × 234 mm)', w: 156, h: 234, group: 'Romans et littérature' },
  a5: { label: 'A5 (148 × 210 mm)', w: 148, h: 210, group: 'Formats ISO' },
  b5: { label: 'B5 (176 × 250 mm)', w: 176, h: 250, group: 'Formats ISO' },
  a4: { label: 'A4 / Magazine (210 × 297 mm)', w: 210, h: 297, group: 'Formats ISO' },
  a6: { label: 'A6 (105 × 148 mm)', w: 105, h: 148, group: 'Formats ISO' },
  us5x8: { label: '5 × 8 in (127 × 203 mm)', w: 127, h: 203.2, group: 'Amazon KDP / anglo-saxons' },
  us55x85: { label: '5,5 × 8,5 in (140 × 216 mm)', w: 139.7, h: 215.9, group: 'Amazon KDP / anglo-saxons' },
  us6x9: { label: '6 × 9 in (152 × 229 mm)', w: 152.4, h: 228.6, group: 'Amazon KDP / anglo-saxons' },
  us7x10: { label: '7 × 10 in (178 × 254 mm)', w: 177.8, h: 254, group: 'Amazon KDP / anglo-saxons' },
  us85x11: { label: '8,5 × 11 in (216 × 279 mm)', w: 215.9, h: 279.4, group: 'Amazon KDP / anglo-saxons' },
  manuel: { label: 'Manuel scolaire (195 × 265 mm)', w: 195, h: 265, group: 'Éducation' },
  cahier: { label: 'Cahier d’exercices (170 × 220 mm)', w: 170, h: 220, group: 'Éducation' },
  jeunesse: { label: 'Album jeunesse (240 × 300 mm)', w: 240, h: 300, group: 'Jeunesse et beaux livres' },
  carre: { label: 'Carré (210 × 210 mm)', w: 210, h: 210, group: 'Jeunesse et beaux livres' },
  carre2: { label: 'Petit carré (170 × 170 mm)', w: 170, h: 170, group: 'Jeunesse et beaux livres' },
  paysage: { label: 'Paysage / à l’italienne (297 × 210 mm)', w: 297, h: 210, group: 'Jeunesse et beaux livres' },
  beaulivre: { label: 'Beau livre (230 × 290 mm)', w: 230, h: 290, group: 'Jeunesse et beaux livres' },
}

/** Papiers d'impression : épaisseur d'une feuille (2 pages), en mm */
export const PAPERS: Record<string, { label: string; t: number }> = {
  bouffant70: { label: 'Bouffant 70 g (roman)', t: 0.12 },
  bouffant80: { label: 'Bouffant 80 g (roman épais)', t: 0.14 },
  offset80: { label: 'Offset blanc 80 g', t: 0.1 },
  offset90: { label: 'Offset blanc 90 g', t: 0.11 },
  creme80: { label: 'Ivoire / crème 80 g', t: 0.105 },
  couche115: { label: 'Couché mat 115 g (illustré)', t: 0.095 },
  couche135: { label: 'Couché mat 135 g (beau livre)', t: 0.115 },
  couche170: { label: 'Couché 170 g (album)', t: 0.15 },
  kdpblanc: { label: 'Amazon KDP — blanc', t: 0.1144 },
  kdpcreme: { label: 'Amazon KDP — crème', t: 0.127 },
  kdpcouleur: { label: 'Amazon KDP — couleur', t: 0.1194 },
}

export const UNITS = { mm: { label: 'mm', f: 1, step: 1 }, cm: { label: 'cm', f: 10, step: 0.1 }, in: { label: 'pouces', f: 25.4, step: 0.01 }, pt: { label: 'pt', f: 0.352778, step: 1 } } as const
export const toUnit = (mm: number, u: keyof typeof UNITS = 'mm') => Math.round((mm / UNITS[u].f) * 1000) / 1000
export const fromUnit = (v: number, u: keyof typeof UNITS = 'mm') => v * UNITS[u].f

/** Formats d'affiche : mm (print) ou px (réseaux sociaux, unitsPerMm = 0) */
export const POSTER_FORMATS: Record<string, { label: string; w: number; h: number; px?: boolean }> = {
  a4: { label: 'A4 portrait (210 × 297 mm)', w: 210, h: 297 },
  a3: { label: 'A3 portrait (297 × 420 mm)', w: 297, h: 420 },
  a2: { label: 'A2 portrait (420 × 594 mm)', w: 420, h: 594 },
  a4l: { label: 'A4 paysage (297 × 210 mm)', w: 297, h: 210 },
  flyer: { label: 'Flyer A5 (148 × 210 mm)', w: 148, h: 210 },
  roll: { label: 'Kakémono (850 × 2000 mm)', w: 850, h: 2000 },
  igpost: { label: 'Instagram post (1080 × 1350 px)', w: 1080, h: 1350, px: true },
  igsq: { label: 'Instagram carré (1080 × 1080 px)', w: 1080, h: 1080, px: true },
  story: { label: 'Story / Reel (1080 × 1920 px)', w: 1080, h: 1920, px: true },
  fbcover: { label: 'Couverture Facebook (1640 × 624 px)', w: 1640, h: 624, px: true },
  ytthumb: { label: 'Miniature YouTube (1280 × 720 px)', w: 1280, h: 720, px: true },
  linkedin: { label: 'Bannière LinkedIn (1584 × 396 px)', w: 1584, h: 396, px: true },
}

export const BOOK_CATEGORIES = [
  'Roman', 'Nouvelle', 'Manuel scolaire', 'Livre éducatif', "Cahier d'exercices", 'Livre professionnel',
  'Guide pratique', 'Catalogue', 'Magazine', 'Brochure', 'Rapport institutionnel', 'Jeunesse', 'Poésie', 'Essai', 'Biographie',
]
export const GRAPHIC_STYLES = ['Moderne', 'Classique', 'Minimaliste', 'Élégant', 'Audacieux', 'Illustratif', 'Ludique', 'Corporate', 'Vintage', 'Sombre / mystère']
export const POSTER_KINDS = ['Événement', 'Concert / festival', 'Établissement scolaire', 'Publicité commerciale', 'Campagne de communication', 'Conférence / formation', 'Institutionnel', 'Promotion / annonce']

const st = (p: Partial<TextStyle>): TextStyle => ({
  font: 'times', size: 11, bold: false, italic: false, align: 'justify', spaceBefore: 0, spaceAfter: 0, indent: 0, lineHeight: 1.35, color: '#111111', ...p,
})

export const defaultStyles = (): StyleSheet => ({
  h1: st({ font: 'helvetica', size: 22, bold: true, align: 'left', spaceBefore: 40, spaceAfter: 18, lineHeight: 1.15 }),
  h2: st({ font: 'helvetica', size: 15, bold: true, align: 'left', spaceBefore: 14, spaceAfter: 6, lineHeight: 1.2 }),
  h3: st({ font: 'helvetica', size: 12, bold: true, italic: false, align: 'left', spaceBefore: 10, spaceAfter: 4, lineHeight: 1.2 }),
  p: st({ indent: 5, spaceAfter: 2 }),
  quote: st({ italic: true, align: 'left', spaceBefore: 6, spaceAfter: 6, indent: 0, color: '#333333' }),
  li: st({ align: 'left', spaceAfter: 2 }),
  box: st({ font: 'helvetica', size: 10, align: 'left', spaceBefore: 8, spaceAfter: 8 }),
})

export const defaultLayout = (format = 'a5'): LayoutSettings => {
  const f = BOOK_FORMATS[format]
  return {
    format, width: f.w, height: f.h,
    marginTop: 18, marginBottom: 20, marginInner: 20, marginOuter: 15,
    columns: 1, gutter: 6, bleed: 3,
    header: true, headerText: '{titre}', footer: true, pageNumbers: true, numberPosition: 'outer', startNumberAt: 1,
    chapterOnRecto: true, chapterNewPage: true, titlePage: true, toc: true, tocTitle: 'Sommaire', mirror: true,
  }
}

export const defaultCoverInfo = (): CoverInfo => ({
  title: '', subtitle: '', author: '', category: 'Roman', audience: 'Adultes', style: 'Moderne', colors: '',
  instructions: '', backText: '', publisher: '', isbn: '', price: '', images: [], paperThickness: 0.1,
})

export const newBookData = (): BookData => ({
  sourceName: '', blocks: [], originalBlocks: [], suggestions: [], correctionMode: 'simple', editorialReport: '',
  styles: defaultStyles(), layout: defaultLayout(), cover: { info: defaultCoverInfo(), proposals: [], selected: -1, design: null },
})

export const newPosterData = (): PosterData => ({
  brief: { description: '', kind: 'Événement', title: '', subtitle: '', date: '', place: '', contact: '', style: 'Moderne', colors: '', images: [] },
  format: 'a3', proposals: [], design: null,
})

export const FONT_LIST = ['Inter', 'Playfair Display', 'Montserrat', 'Lora', 'Oswald', 'Bebas Neue', 'Merriweather', 'Poppins', 'Abril Fatface', 'Dancing Script', 'Cormorant Garamond', 'Cinzel', 'Bodoni Moda', 'DM Serif Display', 'Libre Baskerville', 'EB Garamond', 'Raleway', 'Anton', 'Archivo Black', 'Righteous', 'Space Grotesk', 'Great Vibes', 'Sacramento', 'Georgia', 'Times New Roman', 'Arial', 'Courier New']

export const TITLE_FONTS = ['Playfair Display', 'Cormorant Garamond', 'Cinzel', 'Bodoni Moda', 'DM Serif Display', 'Libre Baskerville', 'EB Garamond', 'Abril Fatface', 'Lora', 'Merriweather', 'Montserrat', 'Raleway', 'Poppins', 'Bebas Neue', 'Oswald', 'Anton', 'Archivo Black', 'Righteous', 'Space Grotesk', 'Inter', 'Dancing Script', 'Great Vibes', 'Sacramento']

// ───────── Numérotation, veuves/orphelines, sommaire : valeurs par défaut
export const DEFAULT_NUMBERING: import('./types').PageNumbering = {
  style: 'arabic', format: '{n}', position: 'outer', vertical: 'bottom', size: 9, color: '#333333', bold: false,
  countFrom: 'first', frontRoman: false, hideOnOpeners: false, showOnFront: true,
}

/** Complète une mise en page (y compris les anciens projets) avec les réglages avancés. */
export function withLayoutDefaults(L: import('./types').LayoutSettings): Required<import('./types').LayoutSettings> {
  return {
    unit: 'mm', headerVerso: L.headerText || '{titre}', headerRecto: '{chapitre}',
    orphans: 2, widows: 2, keepWithNext: true,
    tocDepth: 2, tocPosition: 'start', tocLeader: 'dots', tocShowNumbers: true, tocFontSize: 0,
    ...L,
    numbering: { ...DEFAULT_NUMBERING, position: L.numberPosition === 'center' ? 'center' : 'outer', ...(L.numbering || {}) },
  } as Required<import('./types').LayoutSettings>
}

// ───────── Gabarits de mise en page intégrés
type Gabarit = { id: string; name: string; desc: string; layout: Partial<import('./types').LayoutSettings>; styles?: (s: StyleSheet) => void }
export const LAYOUT_GABARITS: Gabarit[] = [
  { id: 'roman', name: 'Roman classique', desc: 'Une colonne justifiée, chapitres en belle page, titre courant, folios extérieurs.',
    layout: { format: 'roman', width: 130, height: 200, marginTop: 16, marginBottom: 20, marginInner: 18, marginOuter: 14, columns: 1, mirror: true, chapterNewPage: true, chapterOnRecto: true, header: true, toc: true, tocPosition: 'end', tocTitle: 'Table des matières', tocDepth: 2, orphans: 2, widows: 2, numbering: { ...DEFAULT_NUMBERING, position: 'outer', hideOnOpeners: true } },
    styles: (s) => { s.p.font = 'times'; s.p.size = 10.5; s.p.align = 'justify'; s.p.indent = 5; s.h1.font = 'times'; s.h1.size = 20; s.h1.bold = false; s.h1.align = 'center' } },
  { id: 'essai', name: 'Essai / document', desc: 'Sommaire en début, titres hiérarchisés, numéros centrés en chiffres romains pour les pages liminaires.',
    layout: { format: 'a5', width: 148, height: 210, marginTop: 18, marginBottom: 20, marginInner: 20, marginOuter: 15, columns: 1, mirror: true, chapterNewPage: true, chapterOnRecto: false, header: true, toc: true, tocPosition: 'start', tocTitle: 'Sommaire', tocDepth: 2, numbering: { ...DEFAULT_NUMBERING, position: 'center', format: '— {n} —', countFrom: 'body', frontRoman: true } },
    styles: (s) => { s.p.font = 'times'; s.p.size = 11; s.h1.font = 'helvetica'; s.h2.font = 'helvetica' } },
  { id: 'manuel', name: 'Manuel scolaire', desc: 'Grand format, deux colonnes, titres en sans-serif, encadrés, sommaire détaillé sur 3 niveaux.',
    layout: { format: 'manuel', width: 195, height: 265, marginTop: 18, marginBottom: 20, marginInner: 20, marginOuter: 16, columns: 2, gutter: 7, mirror: true, chapterNewPage: true, chapterOnRecto: false, header: true, toc: true, tocPosition: 'start', tocTitle: 'Sommaire', tocDepth: 3, numbering: { ...DEFAULT_NUMBERING, position: 'outer', size: 10, bold: true, color: '#1f4e8c' } },
    styles: (s) => { s.p.font = 'helvetica'; s.p.size = 10; s.p.align = 'left'; s.p.indent = 0; s.p.spaceAfter = 4; s.h1.font = 'helvetica'; s.h1.color = '#1f4e8c'; s.h2.color = '#1f4e8c'; s.h2.font = 'helvetica' } },
  { id: 'magazine', name: 'Magazine', desc: 'A4, trois colonnes, sans page de titre, numéros en haut de page.',
    layout: { format: 'a4', width: 210, height: 297, marginTop: 16, marginBottom: 16, marginInner: 16, marginOuter: 14, columns: 3, gutter: 5, mirror: true, chapterNewPage: true, chapterOnRecto: false, titlePage: false, header: false, toc: true, tocPosition: 'start', tocTitle: 'Au sommaire', tocDepth: 1, numbering: { ...DEFAULT_NUMBERING, vertical: 'top', format: '{n}', position: 'outer', size: 8 } },
    styles: (s) => { s.p.font = 'times'; s.p.size = 9.5; s.h1.font = 'helvetica'; s.h1.size = 26 } },
  { id: 'jeunesse', name: 'Livre jeunesse', desc: 'Grand corps de texte, interlignage aéré, pas de titre courant.',
    layout: { format: 'carre', width: 210, height: 210, marginTop: 20, marginBottom: 22, marginInner: 20, marginOuter: 20, columns: 1, mirror: true, chapterNewPage: true, chapterOnRecto: false, header: false, toc: false, numbering: { ...DEFAULT_NUMBERING, position: 'center', size: 11 } },
    styles: (s) => { s.p.font = 'helvetica'; s.p.size = 14; s.p.lineHeight = 1.6; s.p.align = 'left'; s.p.indent = 0; s.h1.size = 26 } },
  { id: 'rapport', name: 'Rapport institutionnel', desc: 'A4 une colonne, sommaire sur 2 niveaux, « Page n / total » en pied de page.',
    layout: { format: 'a4', width: 210, height: 297, marginTop: 22, marginBottom: 22, marginInner: 22, marginOuter: 22, columns: 1, mirror: false, chapterNewPage: true, chapterOnRecto: false, header: true, toc: true, tocPosition: 'start', tocTitle: 'Sommaire', tocDepth: 2, numbering: { ...DEFAULT_NUMBERING, position: 'center', format: 'Page {n} / {total}', countFrom: 'first' } },
    styles: (s) => { s.p.font = 'helvetica'; s.p.size = 10.5; s.p.align = 'left'; s.p.indent = 0; s.p.spaceAfter = 5; s.h1.font = 'helvetica' } },
]

// ───────── Gabarit de couverture : dimensions exactes
export function coverSpec(info: import('./types').CoverInfo, trimW: number, trimH: number, layoutPages: number, layoutBleed: number) {
  const pages = info.pageCount && info.pageCount > 0 ? info.pageCount : Math.max(4, Math.ceil(layoutPages / 4) * 4)
  const t = info.paper && PAPERS[info.paper] ? PAPERS[info.paper].t : info.paperThickness || 0.1
  const auto = Math.round((pages / 2) * t * 10) / 10
  const spine = info.spineMode === 'manual' && info.spineWidth ? info.spineWidth : Math.max(info.spineMode === 'manual' ? 0 : 3, auto)
  const flap = info.flaps ? Math.max(40, info.flapWidth || Math.round(trimW * 0.7)) : 0
  const bleed = info.coverBleed ?? layoutBleed
  const totalW = trimW * 2 + spine + flap * 2 + bleed * 2
  return { pages, paperT: t, autoSpine: auto, spine, flap, bleed, trimW, trimH, totalW, totalH: trimH + bleed * 2 }
}
