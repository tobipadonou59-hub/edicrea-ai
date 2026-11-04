import { useEffect, useState } from 'react'
import type { BookData } from '../../lib/types'
import { imageRatios, layoutBook, loadFonts, type LayoutResult } from '../../lib/layout'

export function metaOf(book: BookData) {
  const i = book.cover.info
  return { title: i.title, subtitle: i.subtitle, author: i.author, publisher: i.publisher }
}

/** Calcule la pagination (en différé pour rester fluide pendant la saisie). */
export function useLayout(book: BookData) {
  const [res, setRes] = useState<LayoutResult | null>(null)
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    let cancel = false
    setBusy(true)
    const t = setTimeout(async () => {
      await loadFonts()
      await document.fonts.ready
      const ratios = await imageRatios(book.blocks)
      if (cancel) return
      const r = layoutBook(book.blocks, book.styles, book.layout, metaOf(book), ratios)
      if (!cancel) { setRes(r); setBusy(false) }
    }, 250)
    return () => { cancel = true; clearTimeout(t) }
  }, [book.blocks, book.styles, book.layout, book.cover.info.title, book.cover.info.subtitle, book.cover.info.author, book.cover.info.publisher]) // eslint-disable-line react-hooks/exhaustive-deps
  return { res, busy }
}
