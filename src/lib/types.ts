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
  /** exclure ce titre du sommaire / de la table des matières */
  noToc?: boolean
  /** libellé personnalisé dans le sommaire (sinon le texte du titre) */
  tocLabel?: string
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
  // ── options avancées (facultatives : valeurs par défaut dans withLayoutDefaults)
  unit?: 'mm' | 'cm' | 'in' | 'pt'
  headerVerso?: string
  headerRecto?: string
  numbering?: PageNumbering
  orphans?: number
  widows?: number
  keepWithNext?: boolean
  /** les titres de niveau 2 (chapitres d'une partie) commencent aussi une nouvelle page */
  h2NewPage?: boolean
  tocDepth?: 1 | 2 | 3
  tocPosition?: 'start' | 'end'
  tocLeader?: 'dots' | 'dashes' | 'line' | 'none'
  tocShowNumbers?: boolean
  tocFontSize?: number
}

export interface PageNumbering {
  style: 'arabic' | 'roman' | 'ROMAN' | 'alpha' | 'ALPHA'
  /** gabarit : {n} numéro, {total} nombre de pages */
  format: string
  position: 'outer' | 'center' | 'inner'
  vertical: 'bottom' | 'top'
  size: number
  color: string
  bold: boolean
  /** « body » : la page 1 est la première page du texte ; « first » : la page de titre compte comme page 1 */
  countFrom: 'first' | 'body'
  /** pages liminaires (titre, sommaire…) en chiffres romains minuscules */
  frontRoman: boolean
  hideOnOpeners: boolean
  showOnFront: boolean
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
  // ── gabarit de couverture (facultatif)
  spineMode?: 'auto' | 'manual'
  spineWidth?: number // mm, en mode manuel
  paper?: string // clé de PAPERS
  pageCount?: number // 0 = nombre de pages calculé par la mise en page
  flaps?: boolean
  flapWidth?: number // mm
  coverBleed?: number // mm (sinon celui de la mise en page)
  // ── typographie du titre
  titleFont?: string
  titleWeight?: string
  titleCase?: 'upper' | 'normal' | 'lower'
  titleSpacing?: number
  titleLineHeight?: number
  titleScale?: number
  titleColor?: string
  titleEffect?: string
  titleAlign?: 'left' | 'center' | 'right'
}

export interface Proposal {
  id: string
  name: string
  concept: string
  json: unknown // JSON Fabric
  thumb?: string
  /** dimensions du gabarit au moment de la génération */
  doc?: DesignDoc
}

export interface DesignDoc {
  width: number // px de travail
  height: number
  unitsPerMm: number // px par mm (0 = format écran en px)
  bleedMm: number
  json: unknown | null
  /** gabarit de couverture : zones */
  coverGuides?: { back: number; spine: number; front: number; bleed: number; flap?: number }
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
  imageProvider: 'gemini' | 'openai' | 'pollinations' | 'cloudflare' | 'huggingface' | 'local'
  /** Pollinations (gratuit, sans clé) activé */
  pollinationsOn?: boolean
  pollinationsKey?: string
  pollinationsModel?: string
  /** URL du relais Cloudflare Worker (Workers AI) et mot de passe choisi */
  cfUrl?: string
  cfToken?: string
  cfModel?: string
  hfKey?: string
  hfModel?: string
  /** serveur local compatible Automatic1111 / Forge / Draw Things */
  localUrl?: string
  localSteps?: number
  geminiKey: string
  geminiModel: string
  openaiKey: string
  openaiModel: string
  imageQuality: 'low' | 'medium' | 'high' | 'auto'
  customFormats?: { id: string; name: string; w: number; h: number }[]
}
