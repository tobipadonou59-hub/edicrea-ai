import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, Rect, Ellipse, Triangle, Line, Textbox, Polygon, Path, Polyline, FabricImage, Group, ActiveSelection, PencilBrush, SprayBrush, Gradient, Shadow, Point, filters, util, type FabricObject, type TPointerEventInfo, type TPointerEvent } from 'fabric'
import { jsPDF } from 'jspdf'
import {
  MousePointer2, Hand, Square, Circle as CircleIcon, Triangle as TriIcon, Minus, Type, Pencil, Brush, Eraser, PenTool, Star, Image as ImageIcon, Lasso, Bandage,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Grid3x3, Download, Copy, Trash2, Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Group as GroupIcon, Ungroup, Layers, SprayCan, Save, Wand2,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Scissors, Spline, Magnet, Frame, Ruler, SlidersHorizontal, Sparkles, ArrowRight, Move, Droplet, PaintBucket, Crop, Sun,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Bold, Italic, Underline, Strikethrough, CaseSensitive, FlipHorizontal2, FlipVertical2,
} from 'lucide-react'
import '../../graphics/setup'
import { PROPS, toJSON, ensureFonts } from '../../graphics/setup'
import { removeBackground, healRegion, canvasToTiff, loadImg } from '../../graphics/imageOps'
import { drawCropMarks, download, slug } from '../../lib/exportBook'
import { readAsDataURL } from '../../lib/importers'
import { FONT_LIST, uid } from '../../lib/defaults'
import { useStore } from '../../lib/store'
import type { DesignDoc } from '../../lib/types'
import { Color, Field, Menu, MenuItem, MenuSep, Num, Slider, Toggle, FileButton, Modal, Section, Seg, Tabs } from '../ui'
import { aiReady, askClaude, extractJSON } from '../../lib/ai'

type Tool = 'select' | 'hand' | 'lasso' | 'rect' | 'ellipse' | 'triangle' | 'line' | 'star' | 'text' | 'pencil' | 'brush' | 'spray' | 'eraser' | 'pen' | 'heal'
type Obj = FabricObject & { name?: string; edRole?: string; edId?: string; edFilters?: Record<string, number> }

export interface EditorBridge {
  summary: () => string
  applyOps: (ops: DesignOp[]) => Promise<number>
  selectionIds: () => string[]
}
export type DesignOp = { id?: string; set?: Record<string, unknown>; delete?: boolean; add?: { type: 'text' | 'rect' | 'circle'; props: Record<string, unknown> }; order?: 'front' | 'back' }
export const editorBridge: { current: EditorBridge | null } = { current: null }

const BLENDS = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']
const BLEND_FR: Record<string, string> = { 'source-over': 'Normal', multiply: 'Produit', screen: 'Superposition claire (écran)', overlay: 'Incrustation', darken: 'Assombrir', lighten: 'Éclaircir', 'color-dodge': 'Densité couleur −', 'color-burn': 'Densité couleur +', 'hard-light': 'Lumière crue', 'soft-light': 'Lumière tamisée', difference: 'Différence', exclusion: 'Exclusion', hue: 'Teinte', saturation: 'Saturation', color: 'Couleur', luminosity: 'Luminosité' }
const FILTER_DEFAULT = { brightness: 0, contrast: 0, saturation: 0, vibrance: 0, hue: 0, blur: 0, noise: 0, sharpen: 0, grayscale: 0, sepia: 0, invert: 0, gamma: 1, warmth: 0 }

const isText = (o?: FabricObject | null): o is Textbox => !!o && (o.type === 'textbox' || o.type === 'i-text' || o.type === 'text')
const isImage = (o?: FabricObject | null): o is FabricImage => !!o && o.type === 'image'

function ensureId(o: Obj) { if (!o.edId) o.edId = uid(); return o.edId }
const typeFr = (o: Obj) => ({ textbox: 'Texte', 'i-text': 'Texte', rect: 'Rectangle', ellipse: 'Ellipse', circle: 'Cercle', triangle: 'Triangle', line: 'Ligne', path: 'Tracé', polygon: 'Polygone', polyline: 'Tracé', image: 'Image', group: 'Groupe' } as Record<string, string>)[o.type] || o.type

function bbox(o: FabricObject) {
  const pts = o.getCoords()
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  return { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) }
}

function starPoints(cx: number, cy: number, r: number, n = 5, inner = 0.45) {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < n * 2; i++) { const a = (Math.PI * i) / n - Math.PI / 2; const rr = i % 2 ? r * inner : r; pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr }) }
  return pts
}

/** Tracé lissé (Catmull-Rom → Bézier) à partir des points de la plume. */
function smoothPath(pts: { x: number; y: number }[], closed: boolean, smooth: boolean) {
  if (!smooth || pts.length < 3) return 'M ' + pts.map((p) => `${p.x} ${p.y}`).join(' L ') + (closed ? ' Z' : '')
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]]
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2]
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`
  }
  return d + (closed ? ' Z' : '')
}

function arcText(text: string, radius: number, size: number, font: string, fill: string, left: number, top: number) {
  const chars = [...text]
  const tmp = document.createElement('canvas').getContext('2d')!
  tmp.font = `${size}px "${font}"`
  const widths = chars.map((c) => tmp.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0)
  let ang = -total / radius / 2
  const items = chars.map((c, i) => {
    const a = ang + widths[i] / radius / 2
    ang += widths[i] / radius
    return new Textbox(c, { left: Math.sin(a) * radius, top: -Math.cos(a) * radius, originX: 'center', originY: 'center', angle: (a * 180) / Math.PI, fontSize: size, fontFamily: font, fill, width: widths[i] + 2, textAlign: 'center' })
  })
  const g = new Group(items, { left, top }) as Obj
  g.name = 'Texte sur tracé : ' + text
  return g
}

export default function GraphicEditor({ doc, onSave, name, kind }: { doc: DesignDoc; onSave: (json: unknown, thumb: string, doc: DesignDoc) => void; name: string; kind: 'cover' | 'poster' | 'design' }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const elRef = useRef<HTMLCanvasElement>(null)
  const cv = useRef<Canvas | null>(null)
  const hist = useRef<{ stack: string[]; i: number; lock: boolean }>({ stack: [], i: -1, lock: false })
  const toolRef = useRef<Tool>('select')
  const [tool, setToolState] = useState<Tool>('select')
  const [zoom, setZoom] = useState(0.3)
  const [, setTick] = useState(0)
  const rerender = () => setTick((t) => t + 1)
  const [grid, setGrid] = useState(false)
  const [snap, setSnap] = useState(false)
  const [guidesOn, setGuidesOn] = useState(true)
  const [brushSize, setBrushSize] = useState(8)
  const [brushColor, setBrushColor] = useState('#1d2124')
  const [penSmooth, setPenSmooth] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)
  const [arcOpen, setArcOpen] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [docSize, setDocSize] = useState({ w: doc.width, h: doc.height })
  const [rulers, setRulers] = useState(() => window.innerWidth >= 1024)
  const [sheet, setSheet] = useState(false)
  const [rulerTick, setRulerTick] = useState(0)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [panelTab, setPanelTab] = useState<'props' | 'layers'>('props')
  const paperRef = useRef<HTMLDivElement>(null)
  const cursorCb = useRef<((x: number, y: number) => void) | null>(null)
  const store = useStore()
  const fonts = [...FONT_LIST, ...store.assets.filter((a) => a.type === 'font').map((a) => a.name)]
  const gridPx = doc.unitsPerMm ? doc.unitsPerMm * 10 : 40
  const clip = useRef<FabricObject[] | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const docRef = useRef(doc)
  docRef.current = { ...doc, width: docSize.w, height: docSize.h }

  const c = () => cv.current!

  // ───── Historique (annuler / rétablir) + sauvegarde automatique
  const pushHistory = useCallback(() => {
    const h = hist.current
    if (h.lock || !cv.current) return
    const s = JSON.stringify(toJSON(cv.current))
    if (h.stack[h.i] === s) return
    h.stack = h.stack.slice(0, h.i + 1)
    h.stack.push(s)
    if (h.stack.length > 80) h.stack.shift()
    h.i = h.stack.length - 1
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (!cv.current) return
      const canvas = cv.current
      const guides = canvas.getObjects().filter((o) => (o as Obj).edRole === 'guide')
      guides.forEach((g) => (g.visible = false))
      const thumb = canvas.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: Math.min(1, 420 / (docRef.current.width * canvas.getZoom())) })
      guides.forEach((g) => (g.visible = guidesOnRef.current))
      canvas.requestRenderAll()
      onSave(JSON.parse(s), thumb, { ...docRef.current, json: JSON.parse(s) })
    }, 900)
    rerender()
  }, [onSave])
  const guidesOnRef = useRef(true)
  guidesOnRef.current = guidesOn

  const restore = async (s: string) => {
    const h = hist.current
    h.lock = true
    await c().loadFromJSON(JSON.parse(s))
    c().getObjects().forEach((o) => { if ((o as Obj).edRole === 'guide') o.visible = guidesOnRef.current })
    c().requestRenderAll()
    h.lock = false
    rerender()
  }
  const undo = () => { const h = hist.current; if (h.i > 0) { h.i--; void restore(h.stack[h.i]).then(() => pushSave()) } }
  const redo = () => { const h = hist.current; if (h.i < h.stack.length - 1) { h.i++; void restore(h.stack[h.i]).then(() => pushSave()) } }
  const pushSave = () => { const s = hist.current.stack[hist.current.i]; clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => onSave(JSON.parse(s), '', { ...docRef.current, json: JSON.parse(s) }), 600) }

  // ───── Initialisation du canevas
  useEffect(() => {
    const canvas = new Canvas(elRef.current!, { width: doc.width, height: doc.height, preserveObjectStacking: true, backgroundColor: '#ffffff', stopContextMenu: true, fireRightClick: true })
    cv.current = canvas
    const wrap = wrapRef.current!
    const fit = Math.min((wrap.clientWidth - 80) / doc.width, (wrap.clientHeight - 80) / doc.height, 1.5)
    ;(async () => {
      hist.current.lock = true
      if (doc.json) {
        const fams = new Set<string>()
        JSON.stringify(doc.json).replace(/"fontFamily":"([^"]+)"/g, (_m, f) => { fams.add(f); return '' })
        await ensureFonts([...fams])
        if (cv.current !== canvas) return
        await canvas.loadFromJSON(doc.json as Record<string, unknown>)
      }
      if (cv.current !== canvas) return
      hist.current.lock = false
      applyZoom(fit)
      pushHistory()
      canvas.requestRenderAll()
    })()
    const sel = () => rerender()
    canvas.on('selection:created', sel); canvas.on('selection:updated', sel); canvas.on('selection:cleared', sel)
    canvas.on('object:modified', () => pushHistory())
    canvas.on('object:added', (e) => { ensureId(e.target as Obj); pushHistory() })
    canvas.on('object:removed', () => pushHistory())
    canvas.on('text:changed', () => rerender())
    canvas.on('path:created', (e) => {
      const p = (e as unknown as { path: Obj }).path
      if (toolRef.current === 'eraser') { p.globalCompositeOperation = 'destination-out'; p.name = 'Gomme' }
      else p.name = toolRef.current === 'brush' ? 'Coup de pinceau' : toolRef.current === 'spray' ? 'Aérographe' : 'Crayon'
      pushHistory()
    })
    editorBridge.current = bridge
    return () => { editorBridge.current = null; clearTimeout(saveTimer.current); canvas.dispose(); cv.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyZoom = (z: number) => {
    const canvas = c()
    z = Math.max(0.05, Math.min(4, z))
    canvas.setZoom(z)
    canvas.setDimensions({ width: docRef.current.width * z, height: docRef.current.height * z })
    setZoom(z)
  }
  const fitZoom = () => { const w = wrapRef.current!; applyZoom(Math.min((w.clientWidth - 80) / docRef.current.width, (w.clientHeight - 80) / docRef.current.height)) }

  // ───── Outils
  const setTool = (t: Tool) => {
    const canvas = c()
    toolRef.current = t
    setToolState(t)
    canvas.isDrawingMode = ['pencil', 'brush', 'eraser', 'spray'].includes(t)
    if (canvas.isDrawingMode) {
      const b = t === 'spray' ? new SprayBrush(canvas) : new PencilBrush(canvas)
      b.width = t === 'pencil' ? Math.max(1, brushSize / 3) : t === 'eraser' ? brushSize * 2.5 : brushSize * (t === 'spray' ? 2 : 1.6)
      b.color = t === 'eraser' ? '#ffffff' : brushColor
      if (b instanceof PencilBrush) { b.decimate = t === 'pencil' ? 0.4 : 2; b.strokeLineCap = 'round'; b.strokeLineJoin = 'round' }
      canvas.freeDrawingBrush = b
    }
    canvas.selection = t === 'select'
    canvas.defaultCursor = t === 'hand' ? 'grab' : t === 'select' ? 'default' : 'crosshair'
    canvas.getObjects().forEach((o) => { if ((o as Obj).edRole !== 'guide' && o.selectable !== false) o.evented = t === 'select' || t === 'heal' })
    if (t !== 'pen') cancelPen()
  }
  useEffect(() => { if (cv.current && ['pencil', 'brush', 'eraser', 'spray'].includes(tool)) setTool(tool) }, [brushSize, brushColor]) // eslint-disable-line react-hooks/exhaustive-deps

  const drawing = useRef<{ obj?: Obj; start?: Point; lasso?: { x: number; y: number }[]; temp?: FabricObject; pan?: { x: number; y: number; sl: number; st: number } }>({})
  const pen = useRef<{ pts: { x: number; y: number }[]; preview?: Polyline }>({ pts: [] })

  const cancelPen = () => { if (pen.current.preview) cv.current?.remove(pen.current.preview); pen.current = { pts: [] } }
  const finishPen = (closed = false) => {
    const pts = pen.current.pts
    cancelPen()
    if (pts.length < 2) return
    const p = new Path(smoothPath(pts, closed, penSmooth), { fill: closed ? brushColor + '55' : '', stroke: brushColor, strokeWidth: Math.max(1, brushSize / 2), strokeLineCap: 'round', strokeLineJoin: 'round' }) as Obj
    p.name = closed ? 'Forme vectorielle' : 'Tracé vectoriel'
    c().add(p); c().setActiveObject(p); setTool('select')
  }

  useEffect(() => {
    const canvas = cv.current
    if (!canvas) return
    const down = (opt: TPointerEventInfo<TPointerEvent>) => {
      const t = toolRef.current
      const p = canvas.getScenePoint(opt.e)
      const d = drawing.current
      if (t === 'hand') { const ev = opt.e as MouseEvent; d.pan = { x: ev.clientX, y: ev.clientY, sl: wrapRef.current!.scrollLeft, st: wrapRef.current!.scrollTop }; return }
      if (t === 'pen') {
        const pts = pen.current.pts
        if (pts.length > 2 && Math.hypot(pts[0].x - p.x, pts[0].y - p.y) < 12 / canvas.getZoom()) { finishPen(true); return }
        pts.push({ x: p.x, y: p.y })
        if (pen.current.preview) canvas.remove(pen.current.preview)
        const pl = new Polyline(pts.map((q) => ({ ...q })), { fill: '', stroke: '#2f9bff', strokeWidth: 2 / canvas.getZoom(), strokeDashArray: [6, 4], selectable: false, evented: false, excludeFromExport: true })
        hist.current.lock = true; canvas.add(pl); hist.current.lock = false
        pen.current.preview = pl
        return
      }
      if (t === 'lasso') { d.lasso = [{ x: p.x, y: p.y }]; return }
      if (t === 'heal') {
        if (!isImage(canvas.getActiveObject())) { store.notify('Sélectionnez d’abord une image, puis tracez la zone à corriger.'); return }
        d.start = p
        const r = new Rect({ left: p.x, top: p.y, width: 1, height: 1, fill: 'rgba(47,155,255,0.2)', stroke: '#2f9bff', strokeWidth: 1, selectable: false, evented: false, excludeFromExport: true })
        hist.current.lock = true; canvas.add(r); hist.current.lock = false
        d.temp = r
        return
      }
      if (['rect', 'ellipse', 'triangle', 'line', 'star'].includes(t)) {
        d.start = p
        let o: Obj
        const fill = brushColor
        if (t === 'rect') o = new Rect({ left: p.x, top: p.y, width: 1, height: 1, fill, rx: 0, ry: 0 })
        else if (t === 'ellipse') o = new Ellipse({ left: p.x, top: p.y, rx: 1, ry: 1, fill })
        else if (t === 'triangle') o = new Triangle({ left: p.x, top: p.y, width: 1, height: 1, fill })
        else if (t === 'line') o = new Line([p.x, p.y, p.x, p.y], { stroke: fill, strokeWidth: Math.max(2, brushSize / 2), strokeLineCap: 'round' })
        else o = new Polygon(starPoints(0, 0, 50), { left: p.x, top: p.y, fill, scaleX: 0.02, scaleY: 0.02 })
        o.name = typeFr(o) + (t === 'star' ? ' (étoile)' : '')
        hist.current.lock = true; canvas.add(o); hist.current.lock = false
        d.obj = o
        return
      }
      if (t === 'text') {
        const tb = new Textbox('Votre texte', { left: p.x, top: p.y, width: docRef.current.width * 0.4, fontSize: Math.round(docRef.current.width / 18), fontFamily: 'Montserrat', fill: brushColor })
        ;(tb as Obj).name = 'Texte'
        canvas.add(tb); canvas.setActiveObject(tb); tb.enterEditing(); tb.selectAll()
        setTool('select')
      }
    }
    const move = (opt: TPointerEventInfo<TPointerEvent>) => {
      const d = drawing.current
      const p = canvas.getScenePoint(opt.e)
      cursorCb.current?.(p.x, p.y)
      if (d.pan) { const ev = opt.e as MouseEvent; wrapRef.current!.scrollLeft = d.pan.sl - (ev.clientX - d.pan.x); wrapRef.current!.scrollTop = d.pan.st - (ev.clientY - d.pan.y); return }
      if (d.lasso) { d.lasso.push({ x: p.x, y: p.y }); if (d.temp) canvas.remove(d.temp); d.temp = new Polyline(d.lasso.map((q) => ({ ...q })), { fill: 'rgba(47,155,255,0.08)', stroke: '#2f9bff', strokeWidth: 1 / canvas.getZoom(), selectable: false, evented: false, excludeFromExport: true }); hist.current.lock = true; canvas.add(d.temp); hist.current.lock = false; canvas.requestRenderAll(); return }
      if (d.temp && d.start) { d.temp.set({ left: Math.min(p.x, d.start.x), top: Math.min(p.y, d.start.y), width: Math.abs(p.x - d.start.x), height: Math.abs(p.y - d.start.y) }); canvas.requestRenderAll(); return }
      if (!d.obj || !d.start) return
      const o = d.obj, s = d.start
      const w = Math.abs(p.x - s.x), h = Math.abs(p.y - s.y)
      const l = Math.min(p.x, s.x), tp = Math.min(p.y, s.y)
      if (o.type === 'line') (o as Line).set({ x2: p.x, y2: p.y })
      else if (o.type === 'ellipse') o.set({ left: l, top: tp, rx: w / 2, ry: h / 2 })
      else if (o.type === 'polygon') o.set({ left: l, top: tp, scaleX: Math.max(0.02, w / 100), scaleY: Math.max(0.02, h / 100) })
      else o.set({ left: l, top: tp, width: w, height: h })
      o.setCoords()
      canvas.requestRenderAll()
    }
    const up = async () => {
      const d = drawing.current
      if (d.pan) { d.pan = undefined; return }
      if (d.lasso) {
        const poly = d.lasso
        if (d.temp) { hist.current.lock = true; canvas.remove(d.temp); hist.current.lock = false }
        const inside = (x: number, y: number) => { let r = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) r = !r } return r }
        const picked = canvas.getObjects().filter((o) => o.selectable !== false && o.visible && (o as Obj).edRole !== 'guide' && (() => { const bb = bbox(o); return inside((bb.l + bb.r) / 2, (bb.t + bb.b) / 2) })())
        drawing.current = {}
        setTool('select')
        if (picked.length === 1) canvas.setActiveObject(picked[0])
        else if (picked.length > 1) canvas.setActiveObject(new ActiveSelection(picked, { canvas }))
        canvas.requestRenderAll()
        return
      }
      if (d.temp && d.start) {
        const r = d.temp
        hist.current.lock = true; canvas.remove(r); hist.current.lock = false
        const img = canvas.getActiveObject()
        drawing.current = {}
        if (isImage(img) && (r.width || 0) > 2) await healOnImage(img, r)
        return
      }
      if (d.obj) {
        const o = d.obj
        if (o.type !== 'line' && (o.width || 0) * (o.scaleX || 1) < 4 && ((o as unknown as { rx?: number }).rx ?? 99) > 2) {
          const sz = docRef.current.width * 0.2
          if (o.type === 'ellipse') o.set({ rx: sz / 2, ry: sz / 2 })
          else if (o.type === 'polygon') o.set({ scaleX: sz / 100, scaleY: sz / 100 })
          else o.set({ width: sz, height: sz })
        }
        o.setCoords()
        drawing.current = {}
        canvas.setActiveObject(o)
        setTool('select')
        pushHistory()
      }
    }
    const dbl = () => { if (toolRef.current === 'pen') finishPen(false) }
    const moving = (e: { target: FabricObject }) => {
      const o = e.target
      if (snap) { o.set({ left: Math.round((o.left || 0) / gridPx) * gridPx, top: Math.round((o.top || 0) / gridPx) * gridPx }) }
      // aimantation au centre de la page
      const bb = bbox(o), cx = (bb.l + bb.r) / 2, cy = (bb.t + bb.b) / 2
      const W = docRef.current.width, H = docRef.current.height, tol = 8 / canvas.getZoom()
      if (Math.abs(cx - W / 2) < tol) o.set({ left: (o.left || 0) + W / 2 - cx })
      if (Math.abs(cy - H / 2) < tol) o.set({ top: (o.top || 0) + H / 2 - cy })
    }
    const wheel = (opt: TPointerEventInfo<WheelEvent>) => {
      const e = opt.e
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      applyZoom(canvas.getZoom() * (e.deltaY > 0 ? 0.9 : 1.1))
    }
    canvas.on('mouse:down', down); canvas.on('mouse:move', move); canvas.on('mouse:up', up); canvas.on('mouse:dblclick', dbl); canvas.on('object:moving', moving); canvas.on('mouse:wheel', wheel)
    return () => { canvas.off('mouse:down', down); canvas.off('mouse:move', move); canvas.off('mouse:up', up); canvas.off('mouse:dblclick', dbl); canvas.off('object:moving', moving); canvas.off('mouse:wheel', wheel) }
  })

  // ───── Raccourcis clavier
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const canvas = cv.current
      if (!canvas) return
      const tgt = e.target as HTMLElement
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return
      const a = canvas.getActiveObject() as Obj | undefined
      if (isText(a) && a.isEditing) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copy() }
      else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); void paste() }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); void duplicate() }
      else if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); if (e.shiftKey) ungroup(); else group() }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove() }
      else if (e.key === 'Escape') { if (toolRef.current === 'pen') finishPen(false); else { canvas.discardActiveObject(); canvas.requestRenderAll() } }
      else if (e.key === 'Enter' && toolRef.current === 'pen') finishPen(false)
      else if (e.key.startsWith('Arrow') && a) {
        e.preventDefault()
        const st = e.shiftKey ? 10 : 1
        a.set({ left: (a.left || 0) + (e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0), top: (a.top || 0) + (e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0) })
        a.setCoords(); canvas.requestRenderAll(); pushHistory()
      } else if (!mod) {
        const map: Record<string, Tool> = { v: 'select', h: 'hand', l: 'lasso', r: 'rect', e: 'ellipse', t: 'text', p: 'pen', b: 'brush', n: 'pencil', g: 'eraser' }
        if (map[e.key]) setTool(map[e.key])
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  // ───── Actions
  const active = () => cv.current?.getActiveObject() as Obj | undefined
  const actives = () => (cv.current?.getActiveObjects() || []) as Obj[]
  const remove = () => { const canvas = c(); actives().forEach((o) => canvas.remove(o)); canvas.discardActiveObject(); canvas.requestRenderAll() }
  const copy = () => { clip.current = actives() }
  const paste = async () => {
    if (!clip.current?.length) return
    const canvas = c()
    const clones = await Promise.all(clip.current.map((o) => o.clone(PROPS)))
    canvas.discardActiveObject()
    clones.forEach((o) => { o.set({ left: (o.left || 0) + 20, top: (o.top || 0) + 20 }); (o as Obj).edId = uid(); canvas.add(o) })
    canvas.setActiveObject(clones.length === 1 ? clones[0] : new ActiveSelection(clones, { canvas }))
    canvas.requestRenderAll()
  }
  const duplicate = async () => { copy(); await paste() }
  const group = () => {
    const canvas = c()
    const a = canvas.getActiveObject()
    if (!(a instanceof ActiveSelection)) return
    const objs = a.removeAll()
    canvas.discardActiveObject()
    hist.current.lock = true
    objs.forEach((o) => canvas.remove(o))
    const g = new Group(objs) as Obj
    g.name = 'Groupe'
    hist.current.lock = false
    canvas.add(g); canvas.setActiveObject(g); canvas.requestRenderAll()
  }
  const ungroup = () => {
    const canvas = c()
    const g = canvas.getActiveObject()
    if (!g || g.type !== 'group') return
    const objs = (g as Group).removeAll()
    hist.current.lock = true
    canvas.remove(g)
    objs.forEach((o) => canvas.add(o))
    hist.current.lock = false
    canvas.setActiveObject(new ActiveSelection(objs, { canvas }))
    canvas.requestRenderAll(); pushHistory()
  }
  const order = (dir: 'up' | 'down' | 'front' | 'back', o?: Obj) => {
    const canvas = c(), t = o || active()
    if (!t) return
    if (dir === 'up') canvas.bringObjectForward(t); else if (dir === 'down') canvas.sendObjectBackwards(t); else if (dir === 'front') canvas.bringObjectToFront(t); else canvas.sendObjectToBack(t)
    canvas.requestRenderAll(); pushHistory()
  }
  const setProp = (props: Record<string, unknown>, o?: Obj) => {
    const canvas = c()
    const list = o ? [o] : actives()
    list.forEach((x) => { x.set(props as Partial<FabricObject>); x.setCoords() })
    canvas.requestRenderAll(); pushHistory()
  }

  const align = (how: 'l' | 'c' | 'r' | 't' | 'm' | 'b') => {
    const canvas = c()
    const list = actives()
    if (!list.length) return
    canvas.discardActiveObject()
    const boxes = list.map(bbox)
    const ref = list.length === 1 ? { l: 0, t: 0, r: docRef.current.width, b: docRef.current.height } : { l: Math.min(...boxes.map((b) => b.l)), t: Math.min(...boxes.map((b) => b.t)), r: Math.max(...boxes.map((b) => b.r)), b: Math.max(...boxes.map((b) => b.b)) }
    list.forEach((o, i) => {
      const b = boxes[i]
      let dx = 0, dy = 0
      if (how === 'l') dx = ref.l - b.l; if (how === 'r') dx = ref.r - b.r; if (how === 'c') dx = (ref.l + ref.r) / 2 - (b.l + b.r) / 2
      if (how === 't') dy = ref.t - b.t; if (how === 'b') dy = ref.b - b.b; if (how === 'm') dy = (ref.t + ref.b) / 2 - (b.t + b.b) / 2
      o.set({ left: (o.left || 0) + dx, top: (o.top || 0) + dy }); o.setCoords()
    })
    canvas.setActiveObject(list.length > 1 ? new ActiveSelection(list, { canvas }) : list[0])
    canvas.requestRenderAll(); pushHistory()
  }
  const distribute = (axis: 'h' | 'v') => {
    const canvas = c()
    const list = actives()
    if (list.length < 3) { store.notify('Sélectionnez au moins 3 objets à répartir.'); return }
    canvas.discardActiveObject()
    const items = list.map((o) => ({ o, b: bbox(o) })).sort((a, b) => (axis === 'h' ? a.b.l - b.b.l : a.b.t - b.b.t))
    const first = items[0].b, last = items[items.length - 1].b
    const total = items.reduce((s, it) => s + (axis === 'h' ? it.b.r - it.b.l : it.b.b - it.b.t), 0)
    const gap = ((axis === 'h' ? last.r - first.l : last.b - first.t) - total) / (items.length - 1)
    let pos = axis === 'h' ? first.l : first.t
    items.forEach(({ o, b }) => {
      if (axis === 'h') { o.set({ left: (o.left || 0) + pos - b.l }); pos += b.r - b.l + gap } else { o.set({ top: (o.top || 0) + pos - b.t }); pos += b.b - b.t + gap }
      o.setCoords()
    })
    canvas.setActiveObject(new ActiveSelection(list, { canvas }))
    canvas.requestRenderAll(); pushHistory()
  }

  const addImage = async (src: string, name = 'Image') => {
    const canvas = c()
    const img = (await FabricImage.fromURL(src)) as Obj & FabricImage
    const s = Math.min((docRef.current.width * 0.6) / img.width, (docRef.current.height * 0.6) / img.height, 1)
    img.set({ left: (docRef.current.width - img.width * s) / 2, top: (docRef.current.height - img.height * s) / 2, scaleX: s, scaleY: s })
    img.name = name
    canvas.add(img); canvas.setActiveObject(img); canvas.requestRenderAll()
  }
  const replaceImage = async (src: string) => {
    const img = active()
    if (!isImage(img)) return
    const dispW = img.getScaledWidth(), dispH = img.getScaledHeight()
    await img.setSrc(src)
    const s = Math.max(dispW / img.width, dispH / img.height)
    img.set({ scaleX: s, scaleY: s, cropX: 0, cropY: 0 })
    img.setCoords(); c().requestRenderAll(); pushHistory()
  }

  const applyFilters = (img: FabricImage & Obj, f: Record<string, number>) => {
    img.edFilters = f
    const list = []
    if (f.brightness) list.push(new filters.Brightness({ brightness: f.brightness }))
    if (f.contrast) list.push(new filters.Contrast({ contrast: f.contrast }))
    if (f.saturation) list.push(new filters.Saturation({ saturation: f.saturation }))
    if (f.vibrance) list.push(new filters.Vibrance({ vibrance: f.vibrance }))
    if (f.hue) list.push(new filters.HueRotation({ rotation: f.hue }))
    if (f.gamma !== 1) list.push(new filters.Gamma({ gamma: [f.gamma, f.gamma, f.gamma] }))
    if (f.warmth) list.push(new filters.ColorMatrix({ matrix: [1 + f.warmth * 0.2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1 - f.warmth * 0.2, 0, 0, 0, 0, 0, 1, 0] }))
    if (f.blur) list.push(new filters.Blur({ blur: f.blur }))
    if (f.sharpen) list.push(new filters.Convolute({ matrix: [0, -f.sharpen, 0, -f.sharpen, 1 + 4 * f.sharpen, -f.sharpen, 0, -f.sharpen, 0] }))
    if (f.noise) list.push(new filters.Noise({ noise: f.noise }))
    if (f.grayscale) list.push(new filters.Grayscale())
    if (f.sepia) list.push(new filters.Sepia())
    if (f.invert) list.push(new filters.Invert())
    img.filters = list
    img.applyFilters()
    c().requestRenderAll()
  }

  const pixelEdit = async (img: FabricImage & Obj, fn: (el: HTMLImageElement) => string) => {
    const el = await loadImg(img.getSrc())
    const keep = { width: img.width, height: img.height, cropX: img.cropX, cropY: img.cropY, scaleX: img.scaleX, scaleY: img.scaleY, left: img.left, top: img.top, angle: img.angle }
    const url = fn(el)
    await img.setSrc(url)
    img.set(keep)
    if (img.edFilters) applyFilters(img, img.edFilters)
    img.setCoords(); c().requestRenderAll(); pushHistory()
  }
  const healOnImage = async (img: FabricImage & Obj, r: FabricObject) => {
    const inv = util.invertTransform(img.calcTransformMatrix())
    const p1 = util.transformPoint(new Point(r.left!, r.top!), inv)
    const p2 = util.transformPoint(new Point(r.left! + r.width!, r.top! + r.height!), inv)
    const x = Math.min(p1.x, p2.x) + img.width / 2 + (img.cropX || 0), y = Math.min(p1.y, p2.y) + img.height / 2 + (img.cropY || 0)
    await pixelEdit(img, (el) => healRegion(el, x, y, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y)))
    store.notify('Zone corrigée — Ctrl+Z pour annuler')
  }

  const mask = () => {
    const canvas = c()
    const list = actives()
    if (list.length !== 2) { store.notify('Sélectionnez 2 objets : la forme du dessus servira de masque.'); return }
    const sorted = [...list].sort((a, b) => canvas.getObjects().indexOf(a) - canvas.getObjects().indexOf(b))
    const [target, shape] = sorted
    canvas.discardActiveObject()
    void shape.clone().then((m) => {
      m.set({ absolutePositioned: true })
      target.clipPath = m
      canvas.remove(shape)
      canvas.setActiveObject(target); canvas.requestRenderAll(); pushHistory()
    })
  }

  const toggleGuides = (v: boolean) => { setGuidesOn(v); c().getObjects().forEach((o) => { if ((o as Obj).edRole === 'guide') o.visible = v }); c().requestRenderAll() }

  // ───── Pont pour l'assistant IA
  const bridge: EditorBridge = {
    summary: () => {
      const canvas = cv.current
      if (!canvas) return ''
      const objs = canvas.getObjects().filter((o) => (o as Obj).edRole !== 'guide').map((o) => {
        const x = o as Obj
        ensureId(x)
        const base: Record<string, unknown> = { id: x.edId, type: x.type, name: x.name, left: Math.round(x.left || 0), top: Math.round(x.top || 0), width: Math.round(x.getScaledWidth()), height: Math.round(x.getScaledHeight()), angle: x.angle, opacity: x.opacity, fill: typeof x.fill === 'string' ? x.fill : 'dégradé' }
        if (isText(x)) Object.assign(base, { text: x.text, fontFamily: x.fontFamily, fontSize: x.fontSize, fontWeight: x.fontWeight, textAlign: x.textAlign, charSpacing: x.charSpacing, lineHeight: x.lineHeight })
        return base
      })
      return JSON.stringify({ document: { width: docRef.current.width, height: docRef.current.height, type: kind }, objects: objs, selection: (canvas.getActiveObjects() as Obj[]).map((o) => o.edId) })
    },
    selectionIds: () => actives().map((o) => ensureId(o)),
    applyOps: async (ops) => {
      const canvas = c()
      let n = 0
      for (const op of ops) {
        if (op.add) {
          const p = op.add.props
          const o = (op.add.type === 'text' ? new Textbox(String(p.text || 'Texte'), p as Partial<Textbox>) : op.add.type === 'circle' ? new Ellipse(p as Partial<Ellipse>) : new Rect(p as Partial<Rect>)) as Obj
          o.name = String(p.name || typeFr(o))
          canvas.add(o); n++
          continue
        }
        const o = canvas.getObjects().find((x) => (x as Obj).edId === op.id) as Obj | undefined
        if (!o) continue
        if (op.delete) { canvas.remove(o); n++; continue }
        if (op.set) {
          const s = { ...op.set }
          if (typeof s.fontFamily === 'string') await ensureFonts([s.fontFamily])
          if (s.width && !isText(o) && o.type !== 'rect') { o.scaleToWidth(Number(s.width)); delete s.width }
          if (s.height && !isText(o) && o.type !== 'rect') { o.scaleToHeight(Number(s.height)); delete s.height }
          o.set(s as Partial<FabricObject>); o.setCoords(); n++
        }
        if (op.order) order(op.order === 'front' ? 'front' : 'back', o)
      }
      canvas.requestRenderAll(); pushHistory()
      return n
    },
  }
  editorBridge.current = bridge

  const aiImprove = async (instruction: string) => {
    if (!aiReady()) { store.notify('Configurez une clé API Claude dans Paramètres pour utiliser l’IA.'); return }
    setAiBusy(true)
    try {
      const txt = await askClaude({ maxTokens: 16000, system: DESIGN_SYSTEM_PROMPT, messages: [{ role: 'user', content: `Demande : ${instruction}\n\nÉtat du document :\n${bridge.summary()}` }] })
      const r = extractJSON<{ ops: DesignOp[]; explanation: string }>(txt)
      const n = await bridge.applyOps(r.ops || [])
      store.notify(`${n} modification(s) appliquée(s) — ${r.explanation || ''} (Ctrl+Z pour annuler)`)
    } catch (e) { store.notify('IA : ' + (e as Error).message) } finally { setAiBusy(false) }
  }

  // ───── Export
  const exportFile = async (fmt: 'png' | 'jpg' | 'svg' | 'pdf' | 'tiff' | 'front', opts: { bleed: boolean; marks: boolean; dpi: number }) => {
    const canvas = c()
    const d = docRef.current
    const z = canvas.getZoom()
    const guides = canvas.getObjects().filter((o) => (o as Obj).edRole === 'guide')
    guides.forEach((g) => (g.visible = false))
    canvas.discardActiveObject()
    const bleedPx = d.unitsPerMm && !opts.bleed ? d.bleedMm * d.unitsPerMm : 0
    const pxPerMm = d.unitsPerMm || 0
    let mult = pxPerMm ? opts.dpi / 25.4 / pxPerMm : 1
    const maxDim = 14000
    if (Math.max(d.width, d.height) * mult > maxDim) { mult = maxDim / Math.max(d.width, d.height); store.notify(`Résolution limitée à ${Math.round(mult * pxPerMm * 25.4 || 0)} dpi pour ce très grand format.`) }
    const region = { left: bleedPx * z, top: bleedPx * z, width: (d.width - 2 * bleedPx) * z, height: (d.height - 2 * bleedPx) * z }
    const base = slug(name)
    try {
      if (fmt === 'svg') {
        download(new Blob([canvas.toSVG()], { type: 'image/svg+xml' }), base + '.svg')
      } else if (fmt === 'front' && d.coverGuides) {
        const g = d.coverGuides
        const url = canvas.toDataURL({ format: 'png', multiplier: mult / z, left: (g.bleed + g.back + g.spine) * z, top: g.bleed * z, width: g.front * z, height: (d.height - 2 * g.bleed) * z })
        download(await (await fetch(url)).blob(), base + '-premiere.png')
      } else if (fmt === 'png' || fmt === 'jpg') {
        const url = canvas.toDataURL({ format: fmt === 'png' ? 'png' : 'jpeg', quality: 0.95, multiplier: mult / z, ...region })
        download(await (await fetch(url)).blob(), `${base}.${fmt}`)
      } else if (fmt === 'tiff') {
        const el = canvas.toCanvasElement(mult / z, region)
        download(canvasToTiff(el, Math.round(opts.dpi)), base + '.tif')
      } else if (fmt === 'pdf') {
        const url = canvas.toDataURL({ format: 'jpeg', quality: 0.95, multiplier: mult / z, ...region })
        const wmm = pxPerMm ? (d.width - 2 * bleedPx) / pxPerMm : (d.width * 25.4) / 96
        const hmm = pxPerMm ? (d.height - 2 * bleedPx) / pxPerMm : (d.height * 25.4) / 96
        const slugMm = opts.marks && pxPerMm ? 10 : 0
        const pdf = new jsPDF({ unit: 'mm', format: [wmm + 2 * slugMm, hmm + 2 * slugMm], orientation: wmm > hmm ? 'landscape' : 'portrait' })
        pdf.setProperties({ title: name, creator: 'EDICREA AI' })
        pdf.addImage(url, 'JPEG', slugMm, slugMm, wmm, hmm)
        if (slugMm) drawCropMarks(pdf, slugMm, opts.bleed ? d.bleedMm : 0, wmm - (opts.bleed ? 2 * d.bleedMm : 0), hmm - (opts.bleed ? 2 * d.bleedMm : 0), false)
        download(pdf.output('blob'), base + '.pdf')
      }
      store.log(`Export ${fmt.toUpperCase()} : ${name}`)
    } finally {
      guides.forEach((g) => (g.visible = guidesOn))
      canvas.requestRenderAll()
    }
  }

  const saveTemplate = () => {
    const canvas = c()
    const thumb = canvas.toDataURL({ format: 'jpeg', quality: 0.7, multiplier: 300 / (docRef.current.width * canvas.getZoom()) })
    store.addTemplate({ name: name + ' — modèle', kind: 'design', json: toJSON(canvas), width: docRef.current.width, height: docRef.current.height, thumb })
  }

  const resizeDoc = (w: number, h: number) => {
    setDocSize({ w, h })
    docRef.current = { ...docRef.current, width: w, height: h }
    applyZoom(zoom)
    pushHistory()
  }

  const a = active()
  const sel = actives()
  const objects = (cv.current?.getObjects() || []).filter((o) => (o as Obj).edRole !== 'guide') as Obj[]
  const toolGroups: [Tool, typeof MousePointer2, string, string?][][] = [
    [['select', MousePointer2, 'Sélection', 'V'], ['lasso', Lasso, 'Sélection libre (lasso)', 'L'], ['hand', Hand, 'Main', 'H']],
    [['text', Type, 'Texte', 'T']],
    [['rect', Square, 'Rectangle', 'R'], ['ellipse', CircleIcon, 'Ellipse', 'E'], ['triangle', TriIcon, 'Triangle'], ['star', Star, 'Étoile'], ['line', Minus, 'Ligne']],
    [['pen', PenTool, 'Plume vectorielle', 'P'], ['pencil', Pencil, 'Crayon', 'N'], ['brush', Brush, 'Pinceau', 'B'], ['spray', SprayCan, 'Aérographe'], ['eraser', Eraser, 'Gomme', 'G']],
    [['heal', Bandage, 'Correcteur — suppression d’objet']],
  ]
  const TOOL_HINT: Partial<Record<Tool, string>> = {
    select: 'Cliquez pour sélectionner · Maj + clic : sélection multiple · flèches : déplacer (Maj ×10)',
    lasso: 'Tracez librement autour des objets à sélectionner',
    hand: 'Faites glisser pour déplacer la vue · Ctrl + molette : zoom',
    text: 'Cliquez sur le document pour insérer un bloc de texte',
    pen: 'Cliquez pour poser des points · double-clic ou Entrée : terminer · cliquez le 1er point : fermer la forme',
    heal: 'Sélectionnez une image, puis tracez un rectangle sur la zone à effacer',
    eraser: 'Peignez pour effacer', pencil: 'Dessin à main levée fin', brush: 'Dessin à main levée', spray: 'Aérographe',
    rect: 'Cliquez-glissez pour dessiner', ellipse: 'Cliquez-glissez pour dessiner', triangle: 'Cliquez-glissez pour dessiner', star: 'Cliquez-glissez pour dessiner', line: 'Cliquez-glissez pour tracer',
  }
  const unit = doc.unitsPerMm ? 'mm' : 'px'
  const toUnit = (px: number) => (doc.unitsPerMm ? px / doc.unitsPerMm : px)
  const sizeLabel = `${Math.round(toUnit(docSize.w))} × ${Math.round(toUnit(docSize.h))} ${unit}`
  const ZOOMS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      {/* Barre d'outils supérieure */}
      <div className="scroll-thin flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2">
        <button className="btn-icon" data-tip="Annuler (Ctrl Z)" onClick={undo} disabled={hist.current.i <= 0}><Undo2 size={16} /></button>
        <button className="btn-icon" data-tip="Rétablir (Ctrl Y)" onClick={redo} disabled={hist.current.i >= hist.current.stack.length - 1}><Redo2 size={16} /></button>
        <span className="divider-v" />
        <Menu className="btn-ghost !h-7 gap-1 text-[12.5px]" label={<><ImageIcon size={15} /><span className="max-md:hidden">Insérer</span> <ChevronDown size={12} className="text-subtle" /></>}>
          {(close) => <>
            <FileButton accept="image/*" className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-panel3" onFiles={async (f) => { close(); for (const x of f) { const url = await readAsDataURL(x); await addImage(url, x.name); store.addAsset({ name: x.name, type: 'image', data: url }) } }}><ImageIcon size={14} className="text-muted" /> Image ou logo…</FileButton>
            {store.assets.filter((x) => x.type === 'image' || x.type === 'logo').length > 0 && <>
              <MenuSep /><div className="eyebrow px-2.5 pb-1 pt-1">Depuis la bibliothèque</div>
              <div className="grid max-h-48 grid-cols-4 gap-1 overflow-y-auto p-1.5">{store.assets.filter((x) => x.type === 'image' || x.type === 'logo').slice(0, 24).map((x) => <button key={x.id} className="canvas-bg aspect-square overflow-hidden rounded border border-line hover:border-accent" onClick={() => { close(); void addImage(x.data, x.name) }}><img src={x.data} className="h-full w-full object-contain" /></button>)}</div>
            </>}
            <MenuSep />
            <MenuItem icon={Type} shortcut="T" onClick={() => { close(); setTool('text') }}>Bloc de texte</MenuItem>
            <MenuItem icon={Spline} onClick={() => { close(); setArcOpen(true) }}>Texte sur tracé</MenuItem>
          </>}
        </Menu>
        <Menu className="btn-ghost !h-7 gap-1 text-[12.5px]" label={<><AlignHorizontalJustifyCenter size={15} /><span className="max-md:hidden">Disposition</span> <ChevronDown size={12} className="text-subtle" /></>}>
          {(close) => <>
            <div className="eyebrow px-2.5 pb-1 pt-1.5">Aligner {sel.length > 1 ? 'la sélection' : 'sur la page'}</div>
            <div className="grid grid-cols-6 gap-0.5 px-1.5 pb-1.5">
              {([['l', AlignHorizontalJustifyStart, 'À gauche'], ['c', AlignHorizontalJustifyCenter, 'Centre horizontal'], ['r', AlignHorizontalJustifyEnd, 'À droite'], ['t', AlignVerticalJustifyStart, 'En haut'], ['m', AlignVerticalJustifyCenter, 'Centre vertical'], ['b', AlignVerticalJustifyEnd, 'En bas']] as const).map(([k, I, t]) => <button key={k} className="btn-icon" data-tip={t} onClick={() => align(k)}><I size={15} /></button>)}
            </div>
            <MenuSep />
            <MenuItem icon={AlignHorizontalSpaceAround} onClick={() => { close(); distribute('h') }}>Répartir horizontalement</MenuItem>
            <MenuItem icon={AlignVerticalSpaceAround} onClick={() => { close(); distribute('v') }}>Répartir verticalement</MenuItem>
            <MenuSep />
            <MenuItem icon={ChevronUp} onClick={() => { close(); order('front') }}>Premier plan</MenuItem>
            <MenuItem icon={ChevronUp} onClick={() => { close(); order('up') }}>Avancer</MenuItem>
            <MenuItem icon={ChevronDown} onClick={() => { close(); order('down') }}>Reculer</MenuItem>
            <MenuItem icon={ChevronDown} onClick={() => { close(); order('back') }}>Arrière-plan</MenuItem>
            <MenuSep />
            <MenuItem icon={GroupIcon} shortcut="Ctrl G" onClick={() => { close(); group() }}>Grouper</MenuItem>
            <MenuItem icon={Ungroup} onClick={() => { close(); ungroup() }}>Dégrouper</MenuItem>
            <MenuItem icon={Scissors} onClick={() => { close(); mask() }}>Masquer avec la forme du dessus</MenuItem>
          </>}
        </Menu>
        <span className="divider-v" />
        <button className={`btn-icon ${grid ? 'on' : ''}`} data-tip="Grille" onClick={() => setGrid(!grid)}><Grid3x3 size={16} /></button>
        <button className={`btn-icon ${snap ? 'on' : ''}`} data-tip="Magnétisme de la grille" onClick={() => setSnap(!snap)}><Magnet size={16} /></button>
        <button className={`btn-icon ${guidesOn ? 'on' : ''}`} data-tip="Repères (coupe, plis)" onClick={() => toggleGuides(!guidesOn)}><Frame size={16} /></button>
        <button className={`btn-icon ${rulers ? 'on' : ''}`} data-tip="Règles" onClick={() => setRulers(!rulers)}><Ruler size={16} /></button>
        <div className="flex-1" />
        {sel.length > 0 && <span className="chip mr-1 max-w-56 truncate max-md:hidden">{sel.length > 1 ? `${sel.length} objets` : (a?.name || (a ? typeFr(a) : ''))}</span>}
        <Menu align="right" className={`btn !h-8 ${aiBusy ? 'opacity-70' : ''}`} label={<>{aiBusy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" /> : <Wand2 size={15} className="text-accent" />}<span className="max-md:hidden">IA design</span></>}>
          {(close) => (
            <div className="w-80 p-1">
              <div className="eyebrow px-2.5 pb-1 pt-1.5">{sel.length ? 'Sur la sélection' : 'Sur tout le document'}</div>
              {[['Améliorer la typographie', 'Améliore la typographie (hiérarchie, polices, espacements) sans changer les textes'], ['Renforcer la hiérarchie visuelle', 'Réorganise la composition pour une meilleure hiérarchie visuelle'], ['Harmoniser les couleurs', 'Harmonise la palette de couleurs'], ['Aligner et équilibrer', 'Aligne et équilibre les éléments']].map(([l, s]) => (
                <MenuItem key={l} icon={Sparkles} disabled={aiBusy} onClick={() => { close(); void aiImprove(s) }}>{l}</MenuItem>
              ))}
              <MenuSep />
              <form className="flex gap-1.5 p-1.5" onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value; if (v) { close(); void aiImprove(v) } }}>
                <input name="q" className="input" placeholder="Décrivez la modification…" autoFocus />
                <button className="btn-accent !px-2.5"><ArrowRight size={14} /></button>
              </form>
              {!aiReady() && <p className="px-2.5 pb-2 text-[11.5px] text-muted">Nécessite une clé API Claude (Paramètres).</p>}
            </div>
          )}
        </Menu>
        <button className="btn max-md:hidden" data-tip="Enregistrer comme modèle réutilisable" onClick={saveTemplate}><Save size={15} /> Modèle</button>
        <button className={`btn lg:hidden ${sheet ? '!border-accent/50 !bg-accent-soft !text-accent' : ''}`} onClick={() => setSheet(!sheet)}><SlidersHorizontal size={15} /><span className="max-sm:hidden">Propriétés</span></button>
        <button className="btn-accent" onClick={() => setExportOpen(true)}><Download size={15} /><span className="max-sm:hidden">Exporter</span></button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Barre d'outils latérale */}
        <div className="scroll-thin flex w-[46px] shrink-0 flex-col items-center overflow-y-auto border-r border-line bg-panel py-1.5">
          {toolGroups.map((g, gi) => (
            <div key={gi} className={`flex flex-col items-center gap-0.5 py-1 ${gi ? 'border-t border-line' : ''}`}>
              {g.map(([t, Icon, label, key]) => (
                <button key={t} className={`tool ${tool === t ? 'active' : ''}`} data-tip={key ? `${label}  (${key})` : label} data-tip-side="right" onClick={() => setTool(t)}><Icon size={16} /></button>
              ))}
            </div>
          ))}
          <div className="flex-1" />
          <div className="flex flex-col items-center gap-1.5 border-t border-line pt-2">
            <label className="relative h-7 w-7 cursor-pointer rounded-md border-2 border-panel shadow-[0_0_0_1px_var(--line2)]" style={{ background: brushColor }} data-tip="Couleur de l’outil" data-tip-side="right">
              <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <div className="relative">
              <button className="btn-icon !h-7 !w-8 font-mono text-[10.5px] text-ink" data-tip="Taille de l’outil" data-tip-side="right" onClick={() => setSizeOpen(!sizeOpen)}>{brushSize}</button>
              {sizeOpen && (
                <div className="anim-pop absolute bottom-0 left-full z-40 ml-2 w-52 rounded-lg border border-line bg-panel p-3" style={{ boxShadow: 'var(--shadow-lg)' }} onMouseLeave={() => setSizeOpen(false)}>
                  <Slider label="Taille de l’outil" value={brushSize} min={1} max={80} step={1} onChange={setBrushSize} fmt={(v) => v + ' px'} />
                  {tool === 'pen' && <div className="mt-2"><Toggle label="Courbes lissées" checked={penSmooth} onChange={setPenSmooth} /></div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Zone centrale avec règles */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {rulers && <Rulers wrapRef={wrapRef} paperRef={paperRef} zoom={zoom} unitsPerMm={doc.unitsPerMm} tick={rulerTick} />}
            <div ref={wrapRef} onScroll={() => setRulerTick((t) => t + 1)} className={`canvas-bg absolute overflow-auto ${rulers ? 'left-5 top-5' : 'left-0 top-0'} bottom-0 right-0`}>
              <div className="flex min-h-full min-w-full items-center justify-center p-12" style={{ width: docSize.w * zoom + 96, height: docSize.h * zoom + 96 }}>
                <div ref={paperRef} className="paper-shadow relative" style={{ width: docSize.w * zoom, height: docSize.h * zoom }}>
                  <canvas ref={elRef} />
                  {grid && <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(to right, rgba(47,155,255,.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(47,155,255,.22) 1px, transparent 1px)', backgroundSize: `${gridPx * zoom}px ${gridPx * zoom}px` }} />}
                </div>
              </div>
            </div>
          </div>
          {/* Barre d'état */}
          <div className="flex h-7 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-t border-line bg-panel px-3 text-[11.5px] text-muted">
            <span className="flex items-center gap-1.5"><Frame size={12} />{sizeLabel}{doc.bleedMm ? ` · fonds perdus ${doc.bleedMm} mm` : ''}</span>
            <span className="divider-v !h-3.5" />
            <span className="max-md:hidden"><CursorReadout cb={cursorCb} unit={unit} toUnit={toUnit} /></span>
            {a && sel.length === 1 && <><span className="divider-v !h-3.5" /><span className="tabular-nums">L {Math.round(toUnit(a.getScaledWidth()))} × H {Math.round(toUnit(a.getScaledHeight()))} {unit}</span></>}
            <span className="divider-v !h-3.5" />
            <span className="min-w-0 flex-1 truncate max-md:hidden">{TOOL_HINT[tool]}</span>
            <span className="tabular-nums">{objects.length} calque(s)</span>
            <span className="divider-v !h-3.5" />
            <button className="btn-icon !h-5 !w-5" onClick={() => applyZoom(zoom / 1.2)}><ZoomOut size={13} /></button>
            <select className="h-5 cursor-pointer rounded bg-transparent text-[11.5px] tabular-nums text-ink outline-none hover:bg-panel3" value="" onChange={(e) => { const v = e.target.value; if (v === 'fit') fitZoom(); else if (v) applyZoom(+v) }}>
              <option value="">{Math.round(zoom * 100)} %</option>
              <option value="fit">Ajuster à la fenêtre</option>
              {ZOOMS.map((z) => <option key={z} value={z}>{z * 100} %</option>)}
            </select>
            <button className="btn-icon !h-5 !w-5" onClick={() => applyZoom(zoom * 1.2)}><ZoomIn size={13} /></button>
            <button className="btn-icon !h-5 !w-5" data-tip="Ajuster" onClick={fitZoom}><Maximize size={12} /></button>
          </div>
        </div>

        {/* Inspecteur */}
        {sheet && <div className="anim-fade fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSheet(false)} />}
        <div className={`flex w-[288px] shrink-0 flex-col border-l border-line bg-panel max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:h-[62vh] max-lg:w-full max-lg:rounded-t-2xl max-lg:border-l-0 max-lg:border-t max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-12px_40px_rgba(0,0,0,.35)] ${sheet ? '' : 'max-lg:hidden'}`}>
          <div className="flex justify-center pt-2 lg:hidden"><button className="h-1.5 w-10 rounded-full bg-line2" aria-label="Fermer" onClick={() => setSheet(false)} /></div>
          <Tabs value={panelTab} onChange={setPanelTab} tabs={[{ v: 'props', label: 'Propriétés', icon: SlidersHorizontal }, { v: 'layers', label: 'Calques', icon: Layers, badge: objects.length }]} />
          {panelTab === 'props' ? (
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              <Properties key={(a?.edId || 'none') + sel.length} o={a} sel={sel} setProp={setProp} fonts={fonts} applyFilters={applyFilters} pixelEdit={pixelEdit} replaceImage={replaceImage} mask={mask} group={group} ungroup={ungroup}
                doc={{ ...docRef.current }} kind={kind} resizeDoc={resizeDoc} bg={(cv.current?.backgroundColor as string) || '#ffffff'} setBg={(v) => { c().backgroundColor = v; c().requestRenderAll(); pushHistory() }} toUnit={toUnit} unit={unit} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-9 items-center gap-0.5 border-b border-line px-2">
                <button className="btn-icon" data-tip="Grouper (Ctrl G)" onClick={group}><GroupIcon size={14} /></button>
                <button className="btn-icon" data-tip="Dégrouper" onClick={ungroup}><Ungroup size={14} /></button>
                <button className="btn-icon" data-tip="Masque" onClick={mask}><Scissors size={14} /></button>
                <div className="flex-1" />
                <button className="btn-icon" data-tip="Dupliquer (Ctrl D)" onClick={() => void duplicate()}><Copy size={14} /></button>
                <button className="btn-icon" data-tip="Supprimer (Suppr)" onClick={remove}><Trash2 size={14} /></button>
              </div>
              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto py-1">
                {[...objects].reverse().map((o) => {
                  const on = sel.includes(o)
                  const LI = layerIcon(o)
                  return (
                    <div key={ensureId(o)} className={`group mx-1 flex h-8 cursor-default items-center gap-1.5 rounded-md px-1.5 text-[12.5px] ${on ? 'bg-accent-soft text-ink' : 'hover:bg-panel2'} ${o.visible ? '' : 'opacity-50'}`} onClick={() => { if (o.selectable === false) return; c().setActiveObject(o); c().requestRenderAll() }}>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-panel2 ${on ? 'text-accent' : 'text-muted'}`}>{o.type === 'image' ? <img src={(o as FabricImage).getSrc()} className="h-full w-full rounded object-cover" /> : <LI size={12} />}</span>
                      <span className="min-w-0 flex-1 truncate" onDoubleClick={() => { const n = prompt('Nom du calque', o.name || typeFr(o)); if (n) { o.name = n; pushHistory() } }} data-tip="Double-clic pour renommer">
                        {o.clipPath && <Scissors size={10} className="mr-1 inline text-accent" />}{o.name || typeFr(o)}{isText(o) ? <span className="text-subtle"> — {o.text?.slice(0, 18)}</span> : ''}
                      </span>
                      <span className="hidden items-center group-hover:flex">
                        <button className="btn-icon !h-6 !w-6" onClick={(e) => { e.stopPropagation(); order('up', o) }}><ChevronUp size={12} /></button>
                        <button className="btn-icon !h-6 !w-6" onClick={(e) => { e.stopPropagation(); order('down', o) }}><ChevronDown size={12} /></button>
                      </span>
                      <button className={`btn-icon !h-6 !w-6 ${o.selectable === false ? '!text-accent' : 'opacity-0 group-hover:opacity-100'}`} onClick={(e) => { e.stopPropagation(); const lock = o.selectable !== false; setProp({ selectable: !lock, evented: !lock }, o); if (lock) c().discardActiveObject() }}>{o.selectable === false ? <Lock size={12} /> : <Unlock size={12} />}</button>
                      <button className={`btn-icon !h-6 !w-6 ${o.visible ? 'opacity-0 group-hover:opacity-100' : ''}`} onClick={(e) => { e.stopPropagation(); setProp({ visible: !o.visible }, o) }}>{o.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                    </div>
                  )
                })}
                {!objects.length && <p className="p-6 text-center text-[12.5px] text-muted">Aucun calque. Utilisez les outils à gauche pour commencer.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {exportOpen && <ExportDialog doc={docRef.current} onClose={() => setExportOpen(false)} onExport={(f, o) => void exportFile(f, o)} />}
      {arcOpen && <ArcDialog fonts={fonts} onClose={() => setArcOpen(false)} onOk={(t, r, s, f, col) => { const g = arcText(t, r, s, f, col, docRef.current.width / 2 - r, docRef.current.height / 2 - r); c().add(g); c().setActiveObject(g); setArcOpen(false) }} />}
    </div>
  )
}

function layerIcon(o: Obj) {
  return ({ textbox: Type, 'i-text': Type, rect: Square, ellipse: CircleIcon, circle: CircleIcon, triangle: TriIcon, line: Minus, path: PenTool, polygon: Star, polyline: PenTool, group: Layers } as Record<string, typeof Type>)[o.type] || Square
}

function CursorReadout({ cb, unit, toUnit }: { cb: React.MutableRefObject<((x: number, y: number) => void) | null>; unit: string; toUnit: (v: number) => number }) {
  const [p, setP] = useState<[number, number] | null>(null)
  useEffect(() => { cb.current = (x, y) => setP([x, y]); return () => { cb.current = null } }, [cb])
  return <span className="w-32 tabular-nums">{p ? `X ${Math.round(toUnit(p[0]))}  Y ${Math.round(toUnit(p[1]))} ${unit}` : '—'}</span>
}

/** Règles graduées (mm ou px) synchronisées avec le zoom et le défilement. */
function Rulers({ wrapRef, paperRef, zoom, unitsPerMm, tick }: { wrapRef: React.RefObject<HTMLDivElement | null>; paperRef: React.RefObject<HTMLDivElement | null>; zoom: number; unitsPerMm: number; tick: number }) {
  const top = useRef<HTMLCanvasElement>(null)
  const left = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const draw = () => {
      const w = wrapRef.current, p = paperRef.current
      if (!w || !p || !top.current || !left.current) return
      const wr = w.getBoundingClientRect(), pr = p.getBoundingClientRect()
      const dark = document.documentElement.classList.contains('dark')
      const bg = dark ? '#13161a' : '#ffffff', fg = dark ? '#6b7480' : '#8a9099', hi = dark ? '#1d2228' : '#f1efe9'
      const pxPerUnit = (unitsPerMm || 1) * zoom
      const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
      const major = steps.find((s) => s * pxPerUnit >= 60) || 1000
      const minor = major / (major % 5 === 0 || major === 1 ? 5 : 4)
      const dpr = window.devicePixelRatio || 1
      const paint = (cv: HTMLCanvasElement, len: number, horizontal: boolean) => {
        cv.width = (horizontal ? len : 20) * dpr; cv.height = (horizontal ? 20 : len) * dpr
        cv.style.width = (horizontal ? len : 20) + 'px'; cv.style.height = (horizontal ? 20 : len) + 'px'
        const ctx = cv.getContext('2d')!
        ctx.scale(dpr, dpr)
        ctx.fillStyle = bg; ctx.fillRect(0, 0, horizontal ? len : 20, horizontal ? 20 : len)
        const origin = horizontal ? pr.left - wr.left : pr.top - wr.top
        const size = horizontal ? pr.width : pr.height
        ctx.fillStyle = hi
        if (horizontal) ctx.fillRect(origin, 0, size, 20); else ctx.fillRect(0, origin, 20, size)
        ctx.strokeStyle = fg; ctx.fillStyle = fg; ctx.lineWidth = 1; ctx.font = '9px Inter, sans-serif'
        const startU = Math.floor(-origin / pxPerUnit / minor) * minor
        const endU = (len - origin) / pxPerUnit
        ctx.beginPath()
        for (let u = startU; u <= endU; u += minor) {
          const pos = Math.round(origin + u * pxPerUnit) + 0.5
          const isMajor = Math.abs(u / major - Math.round(u / major)) < 1e-6
          const l = isMajor ? 9 : 4
          if (horizontal) { ctx.moveTo(pos, 20); ctx.lineTo(pos, 20 - l) } else { ctx.moveTo(20, pos); ctx.lineTo(20 - l, pos) }
          if (isMajor) {
            const label = String(Math.round(u))
            if (horizontal) ctx.fillText(label, pos + 3, 9)
            else { ctx.save(); ctx.translate(9, pos + 3); ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore() }
          }
        }
        ctx.stroke()
        ctx.fillStyle = dark ? '#242a31' : '#e5e2da'
        if (horizontal) ctx.fillRect(0, 19, len, 1); else ctx.fillRect(19, 0, 1, len)
      }
      paint(top.current, wr.width, true)
      paint(left.current, wr.height, false)
    }
    draw()
    const ro = new ResizeObserver(draw)
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [wrapRef, paperRef, zoom, unitsPerMm, tick])
  return (
    <>
      <div className="absolute left-0 top-0 z-10 h-5 w-5 border-b border-r border-line bg-panel" />
      <canvas ref={top} className="absolute left-5 top-0 z-10" />
      <canvas ref={left} className="absolute left-0 top-5 z-10" />
    </>
  )
}

export const DESIGN_SYSTEM_PROMPT = `Tu es un·e graphiste et typographe senior. Tu modifies un document graphique (Fabric.js) UNIQUEMENT sur les éléments concernés par la demande. Si des objets sont sélectionnés et que la demande ne précise rien d'autre, n'agis que sur eux.
Polices disponibles : ${FONT_LIST.join(', ')}.
Réponds UNIQUEMENT avec un objet JSON : {"explanation": "résumé court en français", "ops": [ ... ]}
Chaque op : {"id": "...", "set": {propriétés Fabric : left, top, width, height, angle, opacity, fill, stroke, strokeWidth, fontFamily, fontSize, fontWeight, fontStyle, textAlign, charSpacing (1/1000 em), lineHeight, text, shadow ...}} ou {"id": "...", "delete": true} ou {"add": {"type": "text"|"rect"|"circle", "props": {...}}} ou {"id": "...", "order": "front"|"back"}.
Ne modifie jamais le contenu des textes sauf demande explicite. Respecte les marges et l'équilibre de la page.`

function Properties({ o, sel, setProp, fonts, applyFilters, pixelEdit, replaceImage, mask, group, ungroup, doc, kind, resizeDoc, bg, setBg, toUnit, unit }: {
  o?: Obj; sel: Obj[]; setProp: (p: Record<string, unknown>, o?: Obj) => void; fonts: string[]
  applyFilters: (img: FabricImage & Obj, f: Record<string, number>) => void
  pixelEdit: (img: FabricImage & Obj, fn: (el: HTMLImageElement) => string) => Promise<void>
  replaceImage: (src: string) => Promise<void>; mask: () => void; group: () => void; ungroup: () => void
  doc: DesignDoc; kind: string; resizeDoc: (w: number, h: number) => void; bg: string; setBg: (v: string) => void
  toUnit: (v: number) => number; unit: string
}) {
  const [, force] = useState(0)
  const set = (p: Record<string, unknown>) => { setProp(p); force((x) => x + 1) }
  const [f, setF] = useState<Record<string, number>>({ ...FILTER_DEFAULT, ...(o?.edFilters || {}) })
  const [tol, setTol] = useState(40)
  const [busy, setBusy] = useState(false)
  const [crop, setCrop] = useState({ l: 0, r: 0, t: 0, b: 0 })
  const fromUnit = (v: number) => (doc.unitsPerMm ? v * doc.unitsPerMm : v)

  if (!o) return (
    <>
      <Section title="Document" icon={Frame}>
        <div className="rounded-lg border border-line bg-panel2 p-3">
          <div className="text-[13px] font-semibold tabular-nums">{Math.round(toUnit(doc.width))} × {Math.round(toUnit(doc.height))} {unit}</div>
          <div className="text-[11.5px] text-subtle">{doc.unitsPerMm ? `Impression · fonds perdus ${doc.bleedMm} mm inclus` : 'Écran · pixels'}</div>
        </div>
        {kind === 'design' && (
          <div className="grid grid-cols-2 gap-2">
            <Num prefix="L" suffix="px" value={doc.width} onChange={(v) => v > 50 && resizeDoc(v, doc.height)} />
            <Num prefix="H" suffix="px" value={doc.height} onChange={(v) => v > 50 && resizeDoc(doc.width, v)} />
          </div>
        )}
        <Field label="Couleur de fond"><Color value={bg} onChange={setBg} /></Field>
      </Section>
      <div className="space-y-2 p-3 text-[12px] text-muted">
        <div className="eyebrow">Raccourcis</div>
        {[['Sélection multiple', 'Maj + clic'], ['Dupliquer', 'Ctrl D'], ['Grouper', 'Ctrl G'], ['Annuler', 'Ctrl Z'], ['Zoom', 'Ctrl molette'], ['Palette de commandes', 'Ctrl K']].map(([l, k]) => <div key={l} className="flex justify-between"><span>{l}</span><span className="kbd">{k}</span></div>)}
      </div>
    </>
  )
  if (sel.length > 1) return (
    <Section title={`${sel.length} objets sélectionnés`} icon={Layers}>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn" onClick={group}><GroupIcon size={14} /> Grouper</button>
        <button className="btn" disabled={sel.length !== 2} onClick={mask}><Scissors size={14} /> Masquer</button>
      </div>
      <Slider label="Opacité" value={o.opacity ?? 1} min={0} max={1} onChange={(v) => set({ opacity: v })} fmt={(v) => Math.round(v * 100) + ' %'} />
      <p className="text-[11.5px] text-subtle">Le masque découpe l’objet du dessous avec la forme du dessus.</p>
    </Section>
  )
  const fill = typeof o.fill === 'string' ? o.fill : ''
  const grad = o.fill instanceof Gradient ? (o.fill as Gradient<'linear'>) : null
  const sh = o.shadow as Shadow | null
  const img = isImage(o) ? (o as FabricImage & Obj) : null
  const upd = (k: string, v: number) => { const n = { ...f, [k]: v }; setF(n); if (img) applyFilters(img, n) }
  const fillMode = grad ? grad.type : fill === '' || fill === 'transparent' ? 'none' : 'solid'
  const fw = (o as unknown as { fontWeight?: string | number }).fontWeight
  const bold = fw === 'bold' || Number(fw) >= 700

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">{(() => { const I = layerIcon(o); return <I size={14} /> })()}</span>
        <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold">{o.name || typeFr(o)}</div><div className="text-[11px] text-subtle">{typeFr(o)}</div></div>
        {o.type === 'group' && <button className="btn !h-7 !px-2 text-[12px]" onClick={ungroup}><Ungroup size={13} /> Dégrouper</button>}
      </div>

      <Section title="Transformation" icon={Move}>
        <div className="grid grid-cols-2 gap-2">
          <Num prefix="X" suffix={unit} value={toUnit(o.left || 0)} onChange={(v) => set({ left: fromUnit(v) })} />
          <Num prefix="Y" suffix={unit} value={toUnit(o.top || 0)} onChange={(v) => set({ top: fromUnit(v) })} />
          <Num prefix="L" suffix={unit} value={toUnit(o.getScaledWidth())} onChange={(v) => { const px = fromUnit(v); if (px > 0) { if (isText(o)) set({ width: px / (o.scaleX || 1) }); else set({ scaleX: px / (o.width || 1) }) } }} />
          <Num prefix="H" suffix={unit} value={toUnit(o.getScaledHeight())} onChange={(v) => { const px = fromUnit(v); if (px > 0 && !isText(o)) set({ scaleY: px / (o.height || 1) }) }} />
          <Num prefix="∠" suffix="°" value={o.angle || 0} onChange={(v) => set({ angle: v })} />
          <div className="flex gap-1">
            <button className="btn-icon !h-8 flex-1 border border-line" data-tip="Miroir horizontal" onClick={() => set({ flipX: !o.flipX })}><FlipHorizontal2 size={14} /></button>
            <button className="btn-icon !h-8 flex-1 border border-line" data-tip="Miroir vertical" onClick={() => set({ flipY: !o.flipY })}><FlipVertical2 size={14} /></button>
          </div>
        </div>
      </Section>

      <Section title="Apparence" icon={Droplet}>
        <Slider label="Opacité" value={o.opacity ?? 1} min={0} max={1} onChange={(v) => set({ opacity: v })} fmt={(v) => Math.round(v * 100) + ' %'} />
        <Field label="Mode de fusion">
          <select className="input" value={o.globalCompositeOperation || 'source-over'} onChange={(e) => set({ globalCompositeOperation: e.target.value })}>
            {BLENDS.map((b) => <option key={b} value={b}>{BLEND_FR[b]}</option>)}
          </select>
        </Field>
        {o.clipPath && <button className="btn w-full" onClick={() => set({ clipPath: undefined })}><Scissors size={13} /> Retirer le masque</button>}
      </Section>

      {isText(o) && (
        <Section title="Typographie" icon={Type}>
          <textarea className="input" rows={2} value={o.text} onChange={(e) => set({ text: e.target.value })} />
          <select className="input" value={o.fontFamily} onChange={async (e) => { await ensureFonts([e.target.value]); set({ fontFamily: e.target.value }) }} style={{ fontFamily: o.fontFamily }}>
            {fonts.map((ft) => <option key={ft} value={ft} style={{ fontFamily: ft }}>{ft}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={String(fw) === '700' ? 'bold' : String(fw) === '400' ? 'normal' : String(fw)} onChange={(e) => set({ fontWeight: e.target.value })}>{[['300', 'Light'], ['normal', 'Regular'], ['600', 'Semibold'], ['bold', 'Bold'], ['800', 'Extrabold'], ['900', 'Black']].map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select>
            <Num suffix="px" value={o.fontSize || 20} onChange={(v) => v > 0 && set({ fontSize: v })} />
            <div data-tip="Approche (‰ em)"><Num prefix="VA" value={o.charSpacing || 0} step={10} onChange={(v) => set({ charSpacing: v })} /></div>
            <div data-tip="Interlignage"><Num prefix="↕" value={o.lineHeight || 1.16} step={0.05} onChange={(v) => v > 0 && set({ lineHeight: v })} /></div>
          </div>
          <div className="flex gap-2">
            <Seg className="flex-1" value={(o.textAlign || 'left') as string} onChange={(v) => set({ textAlign: v })} options={[{ v: 'left', label: <AlignLeft size={14} />, tip: 'Gauche' }, { v: 'center', label: <AlignCenter size={14} />, tip: 'Centre' }, { v: 'right', label: <AlignRight size={14} />, tip: 'Droite' }, { v: 'justify', label: <AlignJustify size={14} />, tip: 'Justifié' }]} />
          </div>
          <div className="seg w-full">
            <button className={bold ? 'on' : ''} data-tip="Gras" onClick={() => set({ fontWeight: bold ? 'normal' : 'bold' })}><Bold size={14} className="mx-auto" /></button>
            <button className={o.fontStyle === 'italic' ? 'on' : ''} data-tip="Italique" onClick={() => set({ fontStyle: o.fontStyle === 'italic' ? 'normal' : 'italic' })}><Italic size={14} className="mx-auto" /></button>
            <button className={o.underline ? 'on' : ''} data-tip="Souligné" onClick={() => set({ underline: !o.underline })}><Underline size={14} className="mx-auto" /></button>
            <button className={o.linethrough ? 'on' : ''} data-tip="Barré" onClick={() => set({ linethrough: !o.linethrough })}><Strikethrough size={14} className="mx-auto" /></button>
            <button data-tip="Majuscules / minuscules" onClick={() => set({ text: o.text === o.text?.toUpperCase() ? o.text?.toLowerCase() : o.text?.toUpperCase() })}><CaseSensitive size={15} className="mx-auto" /></button>
          </div>
          <Field label="Couleur du texte"><Color value={fill || '#000000'} onChange={(v) => set({ fill: v })} /></Field>
          <div className="rounded-md border border-line bg-panel2 p-2 text-[11.5px] text-muted">
            <div className="mb-1.5">Crénage : double-cliquez dans le texte et sélectionnez des lettres.</div>
            <div className="flex gap-1">
              {[-25, 25].map((d) => <button key={d} className="btn !h-7 flex-1 text-[12px]" onClick={() => { const t = o as Textbox; const s = t.selectionStart ?? 0, e = t.selectionEnd ?? 0; if (e > s) { const cur = ((t.getSelectionStyles(s, e)[0] as Record<string, number> | undefined)?.charSpacing) || t.charSpacing || 0; t.setSelectionStyles({ charSpacing: cur + d } as never, s, e); setProp({}) } }}>{d > 0 ? 'Écarter +' : 'Resserrer −'}</button>)}
            </div>
          </div>
        </Section>
      )}

      {!img && (
        <Section title="Remplissage" icon={PaintBucket}>
          <Seg className="flex w-full" value={fillMode} onChange={(v) => {
            const w = o.width || 100, h = o.height || 100
            if (v === 'solid') set({ fill: fill && fill !== 'transparent' ? fill : '#c9963f' })
            else if (v === 'none') set({ fill: 'transparent' })
            else set({ fill: new Gradient({ type: v as 'linear', gradientUnits: 'pixels', coords: v === 'linear' ? { x1: 0, y1: 0, x2: w, y2: h } : { x1: w / 2, y1: h / 2, r1: 0, x2: w / 2, y2: h / 2, r2: Math.max(w, h) / 2 } as never, colorStops: [{ offset: 0, color: '#e3c48c' }, { offset: 1, color: '#13294b' }] }) })
          }} options={[{ v: 'solid', label: 'Uni' }, { v: 'linear', label: 'Linéaire' }, { v: 'radial', label: 'Radial' }, { v: 'none', label: 'Aucun' }]} />
          {fillMode === 'solid' && <Color value={fill} onChange={(v) => set({ fill: v })} />}
          {grad && (
            <>
              <div className="h-5 rounded border border-line" style={{ background: `linear-gradient(to right, ${grad.colorStops.map((s) => s.color).join(', ')})` }} />
              {grad.colorStops.map((cs, i) => <Color key={i} value={cs.color} onChange={(v) => { const g = new Gradient({ type: grad.type, gradientUnits: grad.gradientUnits, coords: grad.coords, colorStops: grad.colorStops.map((x, j) => (j === i ? { ...x, color: v } : x)) }); set({ fill: g }) }} />)}
            </>
          )}
        </Section>
      )}

      <Section title="Contour" icon={Square} defaultOpen={!!o.strokeWidth}>
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <Color value={typeof o.stroke === 'string' ? o.stroke : '#000000'} onChange={(v) => set({ stroke: v, strokeWidth: o.strokeWidth || 2 })} />
          <Num suffix="px" value={o.strokeWidth || 0} min={0} onChange={(v) => set({ strokeWidth: v, stroke: o.stroke || '#000000' })} />
        </div>
        {o.type === 'rect' && <Num prefix="◜" suffix="px" value={(o as Rect).rx || 0} min={0} onChange={(v) => set({ rx: v, ry: v })} />}
      </Section>

      <Section title="Effets" icon={Sparkles} defaultOpen={!!sh}>
        <Toggle label="Ombre portée" checked={!!sh} onChange={(v) => set({ shadow: v ? new Shadow({ color: 'rgba(0,0,0,0.45)', blur: 18, offsetX: 6, offsetY: 8 }) : null })} />
        {sh && (
          <>
            <Color value={sh.color} onChange={(v) => set({ shadow: new Shadow({ ...sh, color: v }) })} />
            <Slider label="Flou" value={sh.blur} min={0} max={120} step={1} onChange={(v) => set({ shadow: new Shadow({ ...sh, blur: v }) })} />
            <div className="grid grid-cols-2 gap-2">
              <Num prefix="X" value={sh.offsetX} onChange={(v) => set({ shadow: new Shadow({ ...sh, offsetX: v }) })} />
              <Num prefix="Y" value={sh.offsetY} onChange={(v) => set({ shadow: new Shadow({ ...sh, offsetY: v }) })} />
            </div>
          </>
        )}
        <button className="btn w-full" onClick={() => set({ shadow: new Shadow({ color: '#ffe9a8', blur: 40, offsetX: 0, offsetY: 0 }) })}><Sun size={13} /> Effet lumineux (halo)</button>
      </Section>

      {img && (
        <>
          <Section title="Réglages photo" icon={SlidersHorizontal} action={<button className="text-[11px] font-medium text-accent hover:underline" onClick={() => { setF({ ...FILTER_DEFAULT }); applyFilters(img, { ...FILTER_DEFAULT }) }}>Réinitialiser</button>}>
            <Slider label="Luminosité" value={f.brightness} min={-1} max={1} onChange={(v) => upd('brightness', v)} />
            <Slider label="Contraste" value={f.contrast} min={-1} max={1} onChange={(v) => upd('contrast', v)} />
            <Slider label="Saturation" value={f.saturation} min={-1} max={1} onChange={(v) => upd('saturation', v)} />
            <Slider label="Vibrance" value={f.vibrance} min={-1} max={1} onChange={(v) => upd('vibrance', v)} />
            <Slider label="Température (froid ↔ chaud)" value={f.warmth} min={-1} max={1} onChange={(v) => upd('warmth', v)} />
            <Slider label="Teinte" value={f.hue} min={-1} max={1} onChange={(v) => upd('hue', v)} />
            <Slider label="Gamma" value={f.gamma} min={0.2} max={2.2} onChange={(v) => upd('gamma', v)} />
            <Slider label="Netteté" value={f.sharpen} min={0} max={1.5} onChange={(v) => upd('sharpen', v)} />
            <Slider label="Flou" value={f.blur} min={0} max={1} onChange={(v) => upd('blur', v)} />
            <Slider label="Grain" value={f.noise} min={0} max={300} step={1} onChange={(v) => upd('noise', v)} />
            <div className="seg w-full">
              <button className={f.grayscale ? 'on' : ''} onClick={() => upd('grayscale', f.grayscale ? 0 : 1)}>N&B</button>
              <button className={f.sepia ? 'on' : ''} onClick={() => upd('sepia', f.sepia ? 0 : 1)}>Sépia</button>
              <button className={f.invert ? 'on' : ''} onClick={() => upd('invert', f.invert ? 0 : 1)}>Négatif</button>
            </div>
          </Section>
          <Section title="Recadrage" icon={Crop} defaultOpen={false}>
            <div className="grid grid-cols-2 gap-2">
              {(['l', 'r', 't', 'b'] as const).map((k) => <Num key={k} prefix={{ l: '←', r: '→', t: '↑', b: '↓' }[k]} suffix="%" value={crop[k]} min={0} max={90} onChange={(v) => setCrop({ ...crop, [k]: v })} />)}
            </div>
            <button className="btn w-full" onClick={() => {
              const el = img.getOriginalSize()
              const cx = (crop.l / 100) * el.width, cy = (crop.t / 100) * el.height
              const w = el.width * (1 - (crop.l + crop.r) / 100), h = el.height * (1 - (crop.t + crop.b) / 100)
              if (w > 4 && h > 4) set({ cropX: cx, cropY: cy, width: w, height: h })
            }}><Crop size={13} /> Appliquer le recadrage</button>
          </Section>
          <Section title="Détourage" icon={Scissors}>
            <Slider label="Tolérance" value={tol} min={5} max={140} step={1} onChange={setTol} />
            <button className="btn w-full" disabled={busy} onClick={async () => { setBusy(true); await pixelEdit(img, (el) => removeBackground(el, tol)); setBusy(false) }}>{busy ? 'Traitement…' : <><Wand2 size={13} /> Supprimer l’arrière-plan</>}</button>
            <p className="text-[11px] leading-snug text-subtle">Pour les fonds unis ou peu texturés. Pour effacer un objet : outil Correcteur de la barre latérale.</p>
            <FileButton accept="image/*" className="btn w-full" onFiles={async (fl) => replaceImage(await readAsDataURL(fl[0]))}><ImageIcon size={13} /> Remplacer l’image…</FileButton>
          </Section>
        </>
      )}
    </>
  )
}

function ExportDialog({ doc, onClose, onExport }: { doc: DesignDoc; onClose: () => void; onExport: (f: 'png' | 'jpg' | 'svg' | 'pdf' | 'tiff' | 'front', o: { bleed: boolean; marks: boolean; dpi: number }) => void }) {
  const print = !!doc.unitsPerMm
  const [bleed, setBleed] = useState(print)
  const [marks, setMarks] = useState(print)
  const [dpi, setDpi] = useState(300)
  const E = (f: Parameters<typeof onExport>[0], label: string, desc: string) => (
    <button className="card flex w-full flex-col items-start p-3 text-left hover:border-accent" onClick={() => { onExport(f, { bleed, marks, dpi }); onClose() }}>
      <span className="font-semibold">{label}</span><span className="text-xs text-muted">{desc}</span>
    </button>
  )
  return (
    <Modal title="Exporter" onClose={onClose}>
      {print && (
        <div className="mb-4 space-y-1">
          <Toggle label={`Inclure les fonds perdus (${doc.bleedMm} mm)`} checked={bleed} onChange={setBleed} />
          <Toggle label="Traits de coupe (PDF)" checked={marks} onChange={setMarks} />
          <Field label="Résolution"><select className="input" value={dpi} onChange={(e) => setDpi(+e.target.value)}><option value={150}>150 dpi (épreuve)</option><option value={300}>300 dpi (impression)</option><option value={450}>450 dpi (haute qualité)</option></select></Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {E('pdf', 'PDF impression', print ? `${dpi} dpi${marks ? ', traits de coupe' : ''}` : 'Document PDF')}
        {E('png', 'PNG', 'Transparence, haute qualité')}
        {E('jpg', 'JPG', 'Léger, pour le web et les réseaux')}
        {E('svg', 'SVG', 'Vectoriel, éditable')}
        {E('tiff', 'TIFF', `RVB non compressé, ${print ? dpi : 96} dpi`)}
        {doc.coverGuides && E('front', '1ʳᵉ de couverture seule', 'PNG pour e-book et boutiques en ligne')}
      </div>
    </Modal>
  )
}

function ArcDialog({ fonts, onClose, onOk }: { fonts: string[]; onClose: () => void; onOk: (t: string, r: number, s: number, f: string, c: string) => void }) {
  const [t, setT] = useState('TEXTE SUR UN TRACÉ COURBE')
  const [r, setR] = useState(220)
  const [s, setS] = useState(36)
  const [f, setF] = useState('Montserrat')
  const [col, setCol] = useState('#1d2124')
  return (
    <Modal title="Texte sur tracé (arc)" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn-accent" onClick={() => onOk(t, r, s, f, col)}>Insérer</button></>}>
      <div className="space-y-3">
        <Field label="Texte"><input className="input" value={t} onChange={(e) => setT(e.target.value)} /></Field>
        <Slider label="Rayon de courbure" value={r} min={60} max={1200} step={10} onChange={setR} />
        <Field label="Taille"><Num value={s} onChange={setS} /></Field>
        <Field label="Police"><select className="input" value={f} onChange={(e) => setF(e.target.value)}>{fonts.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Couleur"><Color value={col} onChange={setCol} /></Field>
      </div>
    </Modal>
  )
}
