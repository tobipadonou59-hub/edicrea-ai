import type { BookData, CoverInfo, LayoutSettings, StyleSheet, TextStyle, PosterData } from './types'

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const BOOK_FORMATS: Record<string, { label: string; w: number; h: number }> = {
  poche: { label: 'Poche (110 × 178 mm)', w: 110, h: 178 },
  roman: { label: 'Roman (130 × 200 mm)', w: 130, h: 200 },
  a5: { label: 'A5 (148 × 210 mm)', w: 148, h: 210 },
  us6x9: { label: '6 × 9 in (152 × 229 mm)', w: 152.4, h: 228.6 },
  b5: { label: 'B5 (176 × 250 mm)', w: 176, h: 250 },
  manuel: { label: 'Manuel scolaire (195 × 265 mm)', w: 195, h: 265 },
  a4: { label: 'A4 / Magazine (210 × 297 mm)', w: 210, h: 297 },
  carre: { label: 'Carré (210 × 210 mm)', w: 210, h: 210 },
}

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

export const FONT_LIST = ['Inter', 'Playfair Display', 'Montserrat', 'Lora', 'Oswald', 'Bebas Neue', 'Merriweather', 'Poppins', 'Abril Fatface', 'Dancing Script', 'Georgia', 'Times New Roman', 'Arial', 'Courier New']
