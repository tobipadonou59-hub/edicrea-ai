import { FabricObject, Textbox, IText, StaticCanvas, type Canvas } from 'fabric'

// Réglages globaux du moteur graphique (Fabric.js)
FabricObject.ownDefaults.originX = 'left'
FabricObject.ownDefaults.originY = 'top'
FabricObject.ownDefaults.strokeWidth = 0
FabricObject.ownDefaults.cornerColor = '#e3c48c'
FabricObject.ownDefaults.cornerStrokeColor = '#1a1d1f'
FabricObject.ownDefaults.borderColor = '#e3c48c'
FabricObject.ownDefaults.transparentCorners = false
FabricObject.ownDefaults.cornerSize = 11
FabricObject.customProperties = ['name', 'edRole', 'edId', 'edFilters']
void Textbox; void IText

export const PROPS = ['name', 'edRole', 'edId', 'edFilters', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'lockScalingX', 'lockScalingY', 'lockRotation', 'hasControls', 'visible', 'excludeFromExport']

export const toJSON = (c: Canvas | StaticCanvas) => (c as unknown as { toObject: (p: string[]) => unknown }).toObject(PROPS)

export async function ensureFonts(fonts: string[]) {
  await Promise.all([...new Set(fonts)].flatMap((f) => [`400 40px "${f}"`, `700 40px "${f}"`, `italic 400 40px "${f}"`].map((s) => document.fonts.load(s).catch(() => null))))
}

export async function renderThumb(json: unknown, w: number, h: number, maxW = 360): Promise<string> {
  const el = document.createElement('canvas')
  const sc = new StaticCanvas(el, { width: w, height: h, renderOnAddRemove: false })
  await sc.loadFromJSON(json as Record<string, unknown>)
  sc.getObjects().forEach((o) => { if ((o as FabricObject & { edRole?: string }).edRole === 'guide') o.visible = false })
  sc.renderAll()
  const url = sc.toDataURL({ format: 'jpeg', quality: 0.85, multiplier: Math.min(1, maxW / w) })
  sc.dispose()
  return url
}
