import { useStore } from './store'
import { aiCorrect, localCorrect, localEditorialReport, aiEditorialReport } from './corrector'
import { aiReady } from './ai'
import { aiConcepts, buildCover, buildPoster, localConcepts, proposalsFrom } from '../graphics/templates'
import { coverSpec } from './defaults'
import { imageRatios, layoutBook, loadFonts } from './layout'
import type { CorrectionMode, LayoutSettings, Suggestion } from './types'

// Actions de haut niveau partagées par l'interface et l'assistant IA.

const S = () => useStore.getState()

export async function runCorrection(mode: CorrectionMode, useAI = aiReady()) {
  const p = S().project
  if (!p?.book) throw new Error('Ouvrez un projet de livre.')
  const blocks = p.book.blocks
  const local = localCorrect(blocks, mode)
  let ai: Suggestion[] = []
  if (useAI) ai = await aiCorrect(blocks, mode)
  const merged = [...ai, ...local.filter((s) => !ai.some((a) => a.blockId === s.blockId && s.start < a.start + a.original.length && a.start < s.start + s.original.length))]
  const report = mode === 'editorial' ? (useAI ? await aiEditorialReport(blocks) : localEditorialReport(blocks)) : p.book.editorialReport
  S().update((pp) => { pp.book!.correctionMode = mode; pp.book!.suggestions = [...pp.book!.suggestions.filter((s) => s.status !== 'pending'), ...merged]; pp.book!.editorialReport = report; pp.step = 1 })
  return merged.length
}

export function patchLayout(patch: Partial<LayoutSettings>) {
  S().update((p) => { if (p.book) Object.assign(p.book.layout, patch) })
}

export function printReady() {
  const L = S().project?.book?.layout
  if (!L) throw new Error('Ouvrez un projet de livre.')
  patchLayout({ bleed: Math.max(3, L.bleed), marginTop: Math.max(15, L.marginTop), marginBottom: Math.max(17, L.marginBottom), marginOuter: Math.max(12, L.marginOuter), marginInner: Math.max(18, L.marginInner), mirror: true, chapterOnRecto: true, pageNumbers: true, footer: true })
  S().update((p) => { p.step = 5 })
}

export async function generateCovers(useAI = aiReady()) {
  const p = S().project
  if (!p?.book) throw new Error('Ouvrez un projet de livre.')
  const b = p.book
  const info = b.cover.info
  if (!info.title) info.title = p.name
  await loadFonts()
  const pages = layoutBook(b.blocks, b.styles, b.layout, { title: info.title, subtitle: info.subtitle, author: info.author, publisher: info.publisher }, await imageRatios(b.blocks)).pages.length
  const spec = coverSpec(info, b.layout.width, b.layout.height, pages, b.layout.bleed)
  let concepts = localConcepts(info.category, info.style, info.colors, info.title)
  if (useAI) concepts = await aiConcepts('cover', `Titre : ${info.title}\nSous-titre : ${info.subtitle}\nAuteur : ${info.author}\nCatégorie : ${info.category}\nPublic : ${info.audience}\nStyle : ${info.style}\nCouleurs : ${info.colors}\nConsignes : ${info.instructions}`, !info.images.length)
  const props = await proposalsFrom(concepts, (c, i) => buildCover(info, c, spec, i + 11))
  S().update((pp) => { pp.book!.cover.proposals = props.map(({ doc: _doc, ...x }) => x); pp.book!.cover.selected = -1; pp.book!.cover.design = null; pp.step = 4 })
}

export async function generatePosters(useAI = aiReady()) {
  const p = S().project
  if (!p?.poster) throw new Error('Ouvrez un projet d’affiche.')
  const br = p.poster.brief
  let concepts = localConcepts('default', br.style, br.colors, br.title)
  if (useAI) concepts = await aiConcepts('poster', `Type : ${br.kind}\nDescription : ${br.description}\nTitre : ${br.title}\nSous-titre : ${br.subtitle}\nDate : ${br.date}\nLieu : ${br.place}\nContact : ${br.contact}\nStyle : ${br.style}\nCouleurs : ${br.colors}`, !br.images.length)
  const props = await proposalsFrom(concepts, (c, i) => buildPoster(p.poster!, c, i + 5))
  S().update((pp) => { pp.poster!.proposals = props.map(({ doc: _doc, ...x }) => x); pp.poster!.design = null })
}

/** Adapte la mise en page à la structure détectée (romans en parties : chapitres en niveau 2 sur nouvelle page). */
export function applyStructureLayout(hasParts: boolean) {
  S().update((p) => {
    const L = p.book?.layout
    if (!L) return
    if (hasParts) { L.h2NewPage = true; if (!L.tocDepth || L.tocDepth < 2) L.tocDepth = 2 }
  })
}
