// Opérations pixel pour la retouche photo (exécutées localement, sans serveur)

export function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src })
}

function toCanvas(img: HTMLImageElement | HTMLCanvasElement) {
  const c = document.createElement('canvas')
  c.width = img instanceof HTMLImageElement ? img.naturalWidth : img.width
  c.height = img instanceof HTMLImageElement ? img.naturalHeight : img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  return { c, ctx }
}

/**
 * Suppression d'arrière-plan par remplissage depuis les bords :
 * les pixels connectés au bord et proches de la couleur de fond deviennent transparents,
 * avec un adoucissement du contour (anti-crénelage).
 */
export function removeBackground(img: HTMLImageElement | HTMLCanvasElement, tolerance = 40, feather = 2): string {
  const { c, ctx } = toCanvas(img)
  const { width: w, height: h } = c
  const d = ctx.getImageData(0, 0, w, h)
  const px = d.data
  // couleur de fond = médiane des pixels du bord
  const samples: number[][] = []
  for (let x = 0; x < w; x += Math.max(1, w >> 6)) { samples.push(at(x, 0), at(x, h - 1)) }
  for (let y = 0; y < h; y += Math.max(1, h >> 6)) { samples.push(at(0, y), at(w - 1, y)) }
  function at(x: number, y: number) { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]] }
  const med = [0, 1, 2].map((k) => samples.map((s) => s[k]).sort((a, b) => a - b)[samples.length >> 1])
  const dist = (i: number) => Math.hypot(px[i] - med[0], px[i + 1] - med[1], px[i + 2] - med[2])
  const mask = new Uint8Array(w * h)
  const stack: number[] = []
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  while (stack.length) {
    const p = stack.pop()!
    if (mask[p]) continue
    if (dist(p * 4) > tolerance) continue
    mask[p] = 1
    const x = p % w, y = (p / w) | 0
    if (x > 0) stack.push(p - 1)
    if (x < w - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - w)
    if (y < h - 1) stack.push(p + w)
  }
  for (let p = 0; p < w * h; p++) {
    if (mask[p]) { px[p * 4 + 3] = 0; continue }
    if (feather > 0) {
      // pixel de contour : transparence partielle selon la proximité de la couleur de fond
      const x = p % w, y = (p / w) | 0
      let near = false
      for (let dy = -feather; dy <= feather && !near; dy++) for (let dx = -feather; dx <= feather; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx]) { near = true; break }
      }
      if (near) { const t = Math.min(1, dist(p * 4) / (tolerance * 2.2)); px[p * 4 + 3] = Math.round(px[p * 4 + 3] * t) }
    }
  }
  ctx.putImageData(d, 0, 0)
  return c.toDataURL('image/png')
}

/**
 * Suppression d'objet / correction d'imperfection : la zone est reconstruite
 * par interpolation des pixels qui l'entourent puis texturée par diffusion.
 */
export function healRegion(img: HTMLImageElement | HTMLCanvasElement, rx: number, ry: number, rw: number, rh: number): string {
  const { c, ctx } = toCanvas(img)
  const w = c.width, h = c.height
  const x0 = Math.max(1, Math.floor(rx)), y0 = Math.max(1, Math.floor(ry))
  const x1 = Math.min(w - 2, Math.ceil(rx + rw)), y1 = Math.min(h - 2, Math.ceil(ry + rh))
  if (x1 <= x0 || y1 <= y0) return c.toDataURL('image/png')
  const d = ctx.getImageData(0, 0, w, h)
  const p = d.data
  const idx = (x: number, y: number) => (y * w + x) * 4
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const tx = (x - x0 + 1) / (x1 - x0 + 2), ty = (y - y0 + 1) / (y1 - y0 + 2)
    const L = idx(x0 - 1, y), R = idx(x1 + 1, y), T = idx(x, y0 - 1), B = idx(x, y1 + 1)
    const i = idx(x, y)
    for (let k = 0; k < 4; k++) {
      const hz = p[L + k] * (1 - tx) + p[R + k] * tx
      const vt = p[T + k] * (1 - ty) + p[B + k] * ty
      p[i + k] = (hz + vt) / 2
    }
  }
  // quelques passes de diffusion + léger grain pour éviter l'effet « lissé »
  for (let pass = 0; pass < 6; pass++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y)
    for (let k = 0; k < 3; k++) p[i + k] = (p[idx(x - 1, y) + k] + p[idx(x + 1, y) + k] + p[idx(x, y - 1) + k] + p[idx(x, y + 1) + k]) / 4
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = idx(x, y); const n = (Math.random() - 0.5) * 6; for (let k = 0; k < 3; k++) p[i + k] = Math.max(0, Math.min(255, p[i + k] + n)) }
  ctx.putImageData(d, 0, 0)
  return c.toDataURL('image/png')
}

/** Encodeur TIFF RVB non compressé (baseline), avec résolution en dpi. */
export function canvasToTiff(canvas: HTMLCanvasElement, dpi = 300): Blob {
  const w = canvas.width, h = canvas.height
  const rgba = canvas.getContext('2d')!.getImageData(0, 0, w, h).data
  const nTags = 12
  const ifdSize = 2 + nTags * 12 + 4
  const bpsOffset = 8 + ifdSize
  const resOffset = bpsOffset + 6
  const dataOffset = resOffset + 16
  const dataLen = w * h * 3
  const buf = new ArrayBuffer(dataOffset + dataLen)
  const v = new DataView(buf)
  v.setUint16(0, 0x4949, false); v.setUint16(2, 42, true); v.setUint32(4, 8, true)
  let o = 8
  v.setUint16(o, nTags, true); o += 2
  const tag = (id: number, type: number, count: number, value: number) => { v.setUint16(o, id, true); v.setUint16(o + 2, type, true); v.setUint32(o + 4, count, true); if (type === 3 && count === 1) v.setUint16(o + 8, value, true); else v.setUint32(o + 8, value, true); o += 12 }
  tag(256, 4, 1, w); tag(257, 4, 1, h); tag(258, 3, 3, bpsOffset); tag(259, 3, 1, 1); tag(262, 3, 1, 2); tag(273, 4, 1, dataOffset)
  tag(277, 3, 1, 3); tag(278, 4, 1, h); tag(279, 4, 1, dataLen); tag(282, 5, 1, resOffset); tag(283, 5, 1, resOffset + 8); tag(296, 3, 1, 2)
  v.setUint32(o, 0, true)
  v.setUint16(bpsOffset, 8, true); v.setUint16(bpsOffset + 2, 8, true); v.setUint16(bpsOffset + 4, 8, true)
  v.setUint32(resOffset, dpi, true); v.setUint32(resOffset + 4, 1, true); v.setUint32(resOffset + 8, dpi, true); v.setUint32(resOffset + 12, 1, true)
  const out = new Uint8Array(buf, dataOffset)
  for (let i = 0, j = 0; i < rgba.length; i += 4) { const a = rgba[i + 3] / 255; out[j++] = rgba[i] * a + 255 * (1 - a); out[j++] = rgba[i + 1] * a + 255 * (1 - a); out[j++] = rgba[i + 2] * a + 255 * (1 - a) }
  return new Blob([buf], { type: 'image/tiff' })
}
