import { useStore } from './store'

// ───────── Génération d'images : Nano Banana (Google Gemini) ou GPT Image (OpenAI) ─────────
// Appels directs depuis le navigateur avec la clé de l'utilisateur (Paramètres).

export type ImageProvider = 'gemini' | 'openai'
export type Aspect = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9'

export interface GenOptions {
  prompt: string
  aspect?: Aspect
  n?: number
  /** images de référence (dataURL) : style, personnage, photo à modifier */
  refs?: string[]
  provider?: ImageProvider
  signal?: AbortSignal
  /** JPEG compressé (illustrations de fond) plutôt que PNG */
  jpeg?: boolean
}

export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana (Gemini 2.5 Flash Image)' },
  { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro (Gemini 3 Pro Image)' },
]
export const OPENAI_MODELS = [
  { id: 'gpt-image-2', label: 'GPT Image 2' },
  { id: 'gpt-image-1.5', label: 'GPT Image 1.5' },
  { id: 'gpt-image-1', label: 'GPT Image 1' },
  { id: 'gpt-image-1-mini', label: 'GPT Image 1 mini (économique)' },
]

export function imageReady(p?: ImageProvider): ImageProvider | null {
  const s = useStore.getState().settings
  const want = p || s.imageProvider
  if (want === 'gemini' && s.geminiKey) return 'gemini'
  if (want === 'openai' && s.openaiKey) return 'openai'
  if (!p) { if (s.geminiKey) return 'gemini'; if (s.openaiKey) return 'openai' }
  return null
}
export const providerLabel = (p: ImageProvider) => (p === 'gemini' ? 'Nano Banana' : 'GPT Image')

const b64ToBlob = (b64: string, type: string) => { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type }) }
const splitDataUrl = (d: string) => { const [h, data] = d.split(','); return { mime: h.match(/data:(.*?);/)?.[1] || 'image/png', data } }

async function toJpeg(dataUrl: string, q = 0.9): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl })
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0)
  return c.toDataURL('image/jpeg', q)
}

async function errorText(r: Response) {
  try { const j = await r.json(); return j.error?.message || JSON.stringify(j).slice(0, 300) } catch { return r.statusText }
}

// ───────── Nano Banana (Gemini)
async function gemini(o: GenOptions): Promise<string[]> {
  const s = useStore.getState().settings
  const model = s.geminiModel || 'gemini-2.5-flash-image'
  const parts: unknown[] = [{ text: o.prompt }]
  for (const r of o.refs || []) { const { mime, data } = splitDataUrl(r); parts.push({ inline_data: { mime_type: mime, data } }) }
  const call = async (withConfig: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal: o.signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'], ...(withConfig && o.aspect ? { imageConfig: { aspectRatio: o.aspect } } : {}) } }),
  })
  const one = async () => {
    let r = await call(true)
    if (r.status === 400) { const t = await errorText(r); if (/imageConfig|aspect/i.test(t)) r = await call(false); else throw new Error('Nano Banana : ' + t) }
    if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? 'Nano Banana : clé API Google invalide ou non autorisée.' : r.status === 429 ? 'Nano Banana : quota atteint, réessayez plus tard.' : 'Nano Banana : ' + (await errorText(r)))
    const j = await r.json()
    const cand = j.candidates?.[0]
    const img = cand?.content?.parts?.find((p: { inlineData?: unknown; inline_data?: unknown }) => p.inlineData || p.inline_data)
    const d = img?.inlineData || img?.inline_data
    if (!d) {
      const txt = cand?.content?.parts?.map((p: { text?: string }) => p.text).filter(Boolean).join(' ')
      throw new Error('Nano Banana n’a pas renvoyé d’image' + (cand?.finishReason ? ` (${cand.finishReason})` : '') + (txt ? ` : ${txt.slice(0, 160)}` : '.'))
    }
    return `data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`
  }
  // Gemini renvoie une image par appel : n appels en parallèle
  return Promise.all(Array.from({ length: o.n || 1 }, one))
}

// ───────── GPT Image (OpenAI)
const OPENAI_SIZE: Record<Aspect, string> = { '1:1': '1024x1024', '2:3': '1024x1536', '3:4': '1024x1536', '9:16': '1024x1536', '3:2': '1536x1024', '4:3': '1536x1024', '16:9': '1536x1024' }

async function openai(o: GenOptions): Promise<string[]> {
  const s = useStore.getState().settings
  const model = s.openaiModel || 'gpt-image-2'
  const size = OPENAI_SIZE[o.aspect || '1:1']
  const headers = { Authorization: `Bearer ${s.openaiKey}` }
  let r: Response
  if (o.refs?.length) {
    // retouche / variation à partir d'images de référence
    const fd = new FormData()
    fd.append('model', model); fd.append('prompt', o.prompt); fd.append('size', size); fd.append('n', String(o.n || 1)); fd.append('quality', s.imageQuality)
    o.refs.forEach((ref, i) => { const { mime, data } = splitDataUrl(ref); fd.append('image[]', b64ToBlob(data, mime), `reference-${i}.${mime.split('/')[1] || 'png'}`) })
    r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers, body: fd, signal: o.signal })
  } else {
    r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', signal: o.signal, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt: o.prompt, size, n: o.n || 1, quality: s.imageQuality }) })
  }
  if (!r.ok) throw new Error(r.status === 401 ? 'GPT Image : clé API OpenAI invalide.' : r.status === 429 ? 'GPT Image : quota ou limite de débit atteint.' : 'GPT Image : ' + (await errorText(r)))
  const j = await r.json()
  const out = (j.data || []).map((d: { b64_json?: string; url?: string }) => (d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url)).filter(Boolean) as string[]
  if (!out.length) throw new Error('GPT Image n’a pas renvoyé d’image.')
  return out
}

export async function generateImages(o: GenOptions): Promise<string[]> {
  const p = imageReady(o.provider)
  if (!p) throw new Error('Aucun générateur d’images configuré : ajoutez une clé Google (Nano Banana) ou OpenAI (GPT Image) dans Paramètres.')
  const imgs = p === 'gemini' ? await gemini(o) : await openai(o)
  const final = o.jpeg ? await Promise.all(imgs.map((d) => (d.startsWith('data:') ? toJpeg(d) : Promise.resolve(d)))) : imgs
  useStore.getState().log(`Image générée (${providerLabel(p)}) : ${o.prompt.slice(0, 60)}`)
  return final
}

/** Consigne d'illustration de couverture : sans texte, place réservée au titre. */
export function coverArtPrompt(x: { title: string; subtitle?: string; category: string; audience: string; style: string; colors?: string; instructions?: string; concept?: string; palette?: string[]; excerpt?: string; kind?: 'cover' | 'poster' }) {
  const what = x.kind === 'poster' ? 'une affiche' : 'une couverture de livre'
  return [
    `Crée l’illustration principale pour ${what}, de qualité professionnelle, prête pour l’impression.`,
    `Thème (ne PAS écrire ce texte sur l’image) : « ${x.title} »${x.subtitle ? ` — ${x.subtitle}` : ''}.`,
    `Genre / catégorie : ${x.category}. Public : ${x.audience}. Style graphique : ${x.style}.`,
    x.concept ? `Direction artistique : ${x.concept}.` : '',
    x.palette?.length ? `Palette dominante : ${x.palette.join(', ')}.` : x.colors ? `Couleurs souhaitées : ${x.colors}.` : '',
    x.instructions ? `Consignes : ${x.instructions}.` : '',
    x.excerpt ? `Contexte de l’histoire : ${x.excerpt.slice(0, 600)}` : '',
    'IMPORTANT : aucune lettre, aucun mot, aucun titre, aucun logo ni filigrane dans l’image. Laisse un espace calme et dégagé dans le tiers supérieur pour placer le titre. Composition équilibrée, éclairage soigné, haute définition.',
  ].filter(Boolean).join('\n')
}
