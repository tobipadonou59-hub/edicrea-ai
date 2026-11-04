import { memo } from 'react'
import type { LayoutSettings } from '../../lib/types'
import { cssFamily, PT, type Page } from '../../lib/layout'

/** Rendu SVG fidèle d'une page (mêmes coordonnées et polices que le PDF). */
export const PageView = memo(function PageView({ page, L, scale, guides, showBleed }: { page: Page; L: LayoutSettings; scale: number; guides: boolean; showBleed?: boolean }) {
  const b = showBleed ? L.bleed : 0
  const W = L.width + 2 * b, H = L.height + 2 * b
  const recto = page.n % 2 === 1
  const ml = L.mirror ? (recto ? L.marginInner : L.marginOuter) : L.marginInner
  const mr = L.mirror ? (recto ? L.marginOuter : L.marginInner) : L.marginOuter
  return (
    <svg width={W * scale} height={H * scale} viewBox={`${-b} ${-b} ${W} ${H}`} className="block bg-white shadow-lg" style={{ fontKerning: 'normal' }}>
      {showBleed && <rect x={-b} y={-b} width={W} height={H} fill="#fff5f5" />}
      <rect x={0} y={0} width={L.width} height={L.height} fill="#ffffff" />
      {guides && (
        <g fill="none" strokeWidth={0.2}>
          <rect x={ml} y={L.marginTop} width={L.width - ml - mr} height={L.height - L.marginTop - L.marginBottom} stroke="#d946ef" strokeDasharray="1 1" />
          {Array.from({ length: L.columns - 1 }, (_, i) => {
            const cw = (L.width - ml - mr - L.gutter * (L.columns - 1)) / L.columns
            const x = ml + (i + 1) * cw + i * L.gutter
            return <rect key={i} x={x} y={L.marginTop} width={L.gutter} height={L.height - L.marginTop - L.marginBottom} stroke="#3e9bff" />
          })}
          {showBleed && <rect x={0} y={0} width={L.width} height={L.height} stroke="#e5484d" />}
        </g>
      )}
      {page.items.map((it, i) => {
        if (it.k === 'text') {
          const common = { fontFamily: cssFamily(it.font), fontSize: it.size * PT, fontWeight: it.bold ? 700 : 400, fontStyle: it.italic ? 'italic' : 'normal', fill: it.color, xmlSpace: 'preserve' as const }
          if (it.words) return <text key={i} y={it.y} {...common}>{it.words.map((w, j) => <tspan key={j} x={w.x}>{w.t}</tspan>)}</text>
          return <text key={i} x={it.x} y={it.y} textAnchor={it.align === 'center' ? 'middle' : it.align === 'right' ? 'end' : 'start'} {...common}>{it.text}</text>
        }
        if (it.k === 'image') return <image key={i} href={it.src} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio="none" />
        if (it.k === 'rect') return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill={it.fill || 'none'} stroke={it.stroke || 'none'} strokeWidth={0.2} />
        return <line key={i} x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={it.color} strokeWidth={it.width} />
      })}
      {page.kind === 'blank' && guides && <text x={L.width / 2} y={L.height / 2} textAnchor="middle" fontSize={3} fill="#bbb">page blanche</text>}
    </svg>
  )
})
