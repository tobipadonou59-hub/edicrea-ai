// Modèle de données central d'EDICREA AI.
// Tous les modules (livre, couverture, affiche, studio) partagent ce format,
// sérialisable en JSON (format de projet .edicrea).

export type ProjectKind = 'book' | 'poster' | 'design'

export type BlockType = 'h1' | 'h2' | 'h3' | 'p' | 'quote' | 'li' | 'box' | 'image' | 'table' | 'pagebreak'

export interface Block {
  id: string
  type: BlockType
  text: string
  /** image : dataURL ; table : lignes séparées par \n, cellules par | */
  src?: string
  caption?: string
  /** largeur de l'image en % de la colonne */
  widthPct?: number
  comment?: string
}

export type SuggestionCategory = 'orthographe' | 'grammaire' | 'ponctuation' | 'typographie' | 'style' | 'répétition' | 'cohérence' | 'reformulation'

export interface Suggestion {
  id: string
  blockId: string
  start: number
  original: string
  replacement: string
  reason: string
  category: SuggestionCategory
  status: 'pending' | 'accepted' | 'rejected'
  source: 'local' | 'ia'
}

export type CorrectionMode = 'simple' | 'pro' | 'editorial'

export interface TextStyle {
  font: 'times' | 'helvetica' | 'courier'
  size: number // pt
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right' | 'justify'
  spaceBefore: number // pt
  spaceAfter: number // pt
  indent: number // mm (retrait de première ligne)
  lineHeight: number // multiplicateur
  color: string
}

export type StyleSheet = Record<Exclude<BlockType, 'image' | 'table' | 'pagebreak'>, TextStyle>

export interface LayoutSettings {
  format: string // clé de FORMATS
  width: number // mm
  height: number // mm
  marginTop: number
  marginBottom: number
  marginInner: number
  marginOuter: number
  columns: number
  gutter: number
  bleed: number
  header: boolean
  headerText: string // {titre} {chapitre} {auteur}
  footer: boolean
  pageNumbers: boolean
  numberPosition: 'center' | 'outer'
  startNumberAt: number
  chapterOnRecto: boolean
  chapterNewPage: boolean
  titlePage: boolean
  toc: boolean
  tocTitle: string
  mirror: boolean
}

export interface CoverInfo {
  title: string
  subtitle: string
  author: string
  category: string
  audience: string
  style: string
  colors: string
  instructions: string
  backText: string
  publisher: string
  isbn: string
  price: string
  images: string[] // dataURLs
  paperThickness: number // mm par feuille (2 pages)
}

export interface Proposal {
  id: string
  name: string
  concept: string
  json: unknown // JSON Fabric
  thumb?: string
}

export interface DesignDoc {
  width: number // px de travail
  height: number
  unitsPerMm: number // px par mm (0 = format écran en px)
  bleedMm: number
  json: unknown | null
  /** gabarit de couverture : zones */
  coverGuides?: { back: number; spine: number; front: number; bleed: number }
}

export interface BookData {
  sourceName: string
  blocks: Block[]
  originalBlocks: Block[]
  suggestions: Suggestion[]
  correctionMode: CorrectionMode
  editorialReport: string
  styles: StyleSheet
  layout: LayoutSettings
  cover: { info: CoverInfo; proposals: Proposal[]; selected: number; design: DesignDoc | null }
}

export interface PosterData {
  brief: { description: string; kind: string; title: string; subtitle: string; date: string; place: string; contact: string; style: string; colors: string; images: string[] }
  format: string
  proposals: Proposal[]
  design: DesignDoc | null
}

export interface Version {
  id: string
  label: string
  at: number
  data: string // JSON de book/poster/design
}

export interface Comment {
  id: string
  author: string
  text: string
  at: number
  target?: string // blockId ou objet
  resolved: boolean
}

export interface Project {
  id: string
  kind: ProjectKind
  name: string
  client: string
  createdAt: number
  updatedAt: number
  step: number
  thumb?: string
  book?: BookData
  poster?: PosterData
  design?: DesignDoc
  versions: Version[]
  comments: Comment[]
}

export interface Template {
  id: string
  name: string
  kind: 'design' | 'layout'
  json: unknown
  width: number
  height: number
  thumb?: string
  createdAt: number
}

export interface Asset {
  id: string
  name: string
  type: 'image' | 'logo' | 'font' | 'palette'
  data: string // dataURL ou liste de couleurs JSON
  createdAt: number
}

export interface HistoryEntry {
  id: string
  at: number
  projectId?: string
  text: string
}

export interface Settings {
  theme: 'dark' | 'light'
  apiKey: string
  apiBase: string
  model: string
  userName: string
  effort: 'low' | 'medium' | 'high'
  imageProvider: 'gemini' | 'openai'
  geminiKey: string
  geminiModel: string
  openaiKey: string
  openaiModel: string
  imageQuality: 'low' | 'medium' | 'high' | 'auto'
}
