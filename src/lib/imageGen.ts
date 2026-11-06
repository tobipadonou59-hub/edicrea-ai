import { useStore } from './store'

// ───────── Génération d'images : Nano Banana, GPT Image, et 4 options gratuites ─────────
// (Pollinations, Cloudflare Workers AI, Hugging Face, IA locale). Appels directs depuis le navigateur ;
// les clés restent dans les Paramètres de l'utilisateur.

export type ImageProvider = 'gemini' | 'openai' | 'pollinations' | 'cloudflare' | 'huggingface' | 'local'
export const PROVIDERS: { id: ImageProvider; label: string; free: boolean }[] = [
  { id: 'pollinations', label: 'Pollinations (gratuit)', free: true },
  { id: 'cloudflare', label: 'Cloudflare FLUX (gratuit)', free: true },
  { id: 'huggingface', label: 'Hugging Face (gratuit)', free: true },
  { id: 'local', label: 'IA locale (gratuit)', free: true },
  { id: 'gemini', label: 'Nano Banana', free: false },
  { id: 'openai', label: 'GPT Image', free: false },
]
export const POLLINATIONS_MODELS = [{ id: 'flux', label: 'FLUX (recommandé)' }, { id: 'turbo', label: 'Turbo (rapide)' }, { id: 'kontext', label: 'Kontext' }]
export const CF_MODELS = [
  { id: '@cf/black-forest-labs/flux-1-schnell', label: 'FLUX.1 schnell (recommandé)' },
  { id: '@cf/bytedance/stable-diffusion-xl-lightning', label: 'SDXL Lightning (formats libres)' },
  { id: '@cf/lykon/dreamshaper-8-lcm', label: 'DreamShaper 8 (illustration)' },
]
export const HF_MODELS = [
  { id: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 schnell (recommandé)' },
  { id: 'black-forest-labs/FLUX.1-dev', label: 'FLUX.1 dev (plus détaillé)' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'Stable Diffusion XL' },
]
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

function configured(p: ImageProvider): boolean {
  const s = useStore.getState().settings
  switch (p) {
    case 'gemini': return !!s.geminiKey
    case 'openai': return !!s.openaiKey
    case 'pollinations': return s.pollinationsOn !== false
    case 'cloudflare': return !!s.cfUrl
    case 'huggingface': return !!s.hfKey
    case 'local': return !!s.localUrl && s.imageProvider === 'local'
  }
}
// ordre de secours : services les plus fiables d'abord, Pollinations (anonyme, plus lent) en dernier
const FALLBACK: ImageProvider[] = ['gemini', 'openai', 'cloudflare', 'huggingface', 'local', 'pollinations']

/** Liste des générateurs disponibles, le générateur choisi en premier. */
export function readyProviders(p?: ImageProvider): ImageProvider[] {
  if (p) return configured(p) ? [p] : []
  const pref = useStore.getState().settings.imageProvider
  return [pref, ...FALLBACK.filter((x) => x !== pref)].filter(configured)
}
export function imageReady(p?: ImageProvider): ImageProvider | null { return readyProviders(p)[0] || null }
/** Durée indicative pour n images. */
export const durationHint = (p: ImageProvider, n: number) => (p === 'pollinations' && !useStore.getState().settings.pollinationsKey ? `environ ${Math.max(1, Math.round(n * 17 / 60))} min, service gratuit` : p === 'local' ? 'selon votre ordinateur' : '30 à 60 s')
export const isFree = (p: ImageProvider) => PROVIDERS.find((x) => x.id === p)?.free ?? false
export const providerLabel = (p: ImageProvider) => ({ gemini: 'Nano Banana', openai: 'GPT Image', pollinations: 'Pollinations', cloudflare: 'Cloudflare FLUX', huggingface: 'Hugging Face', local: 'IA locale' })[p]

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

// ───────── Outils communs aux générateurs gratuits
/** Dimensions (multiples de 64, ≈ 1 mégapixel) pour chaque proportion. */
export const ASPECT_PX: Record<Aspect, [number, number]> = { '1:1': [1024, 1024], '2:3': [832, 1248], '3:2': [1248, 832], '3:4': [896, 1152], '4:3': [1152, 896], '9:16': [768, 1344], '16:9': [1344, 768] }
const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(b) })
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Annulé', 'AbortError')) }) })

/** Recadre au centre à la proportion voulue (pour les modèles à format carré fixe). */
async function cropToAspect(dataUrl: string, aspect?: Aspect): Promise<string> {
  if (!aspect) return dataUrl
  const [aw, ah] = aspect.split(':').map(Number)
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl })
  const W = img.naturalWidth, H = img.naturalHeight
  if (Math.abs(W / H - aw / ah) < 0.02) return dataUrl
  let cw = W, ch = Math.round(W * ah / aw)
  if (ch > H) { ch = H; cw = Math.round(H * aw / ah) }
  const c = document.createElement('canvas'); c.width = cw; c.height = ch
  c.getContext('2d')!.drawImage(img, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, cw, ch)
  return c.toDataURL('image/png')
}
const NEGATIVE = 'text, letters, words, watermark, logo, signature, blurry, low quality, deformed'

// ───────── Pollinations : gratuit, sans clé (clé facultative pour lever les limites)
// Les demandes sont mises en file d'attente : sans clé, une image toutes les ~15 s.
let pollQueue: Promise<unknown> = Promise.resolve()
let pollLast = 0
function pollinations(o: GenOptions): Promise<string[]> {
  const run = pollQueue.then(async () => {
    const gap = useStore.getState().settings.pollinationsKey ? 1000 : 15500
    const wait = pollLast + gap - Date.now()
    if (wait > 0) await sleep(wait, o.signal)
    try { return await pollinationsNow(o) } finally { pollLast = Date.now() }
  })
  pollQueue = run.catch(() => null)
  return run
}
async function pollinationsNow(o: GenOptions): Promise<string[]> {
  const s = useStore.getState().settings
  const [w, h] = ASPECT_PX[o.aspect || '1:1']
  const out: string[] = []
  for (let i = 0; i < (o.n || 1); i++) {
    const q = new URLSearchParams({ width: String(w), height: String(h), model: s.pollinationsModel || 'flux', nologo: 'true', private: 'true', seed: String(Math.floor(Math.random() * 1e9)) })
    if (s.pollinationsKey) q.set('token', s.pollinationsKey)
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(o.prompt.slice(0, 1800))}?${q}`
    let r: Response | null = null
    // sans clé : une requête toutes les ~15 s ; on patiente et on réessaie en cas de file d'attente
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await fetch(url, { signal: o.signal })
      if (r.status !== 429 && r.status < 500) break
      await sleep(s.pollinationsKey ? 3000 : 16000, o.signal)
    }
    if (!r || !r.ok) throw new Error(r?.status === 429 ? 'Pollinations : trop de demandes, réessayez dans une minute (ou ajoutez une clé gratuite).' : 'Pollinations : ' + (r ? await errorText(r) : 'aucune réponse'))
    const blob = await r.blob()
    if (!blob.type.startsWith('image/')) throw new Error('Pollinations n’a pas renvoyé d’image.')
    out.push(await blobToDataUrl(blob))
    if (i < (o.n || 1) - 1 && !s.pollinationsKey) await sleep(15500, o.signal)
  }
  return out
}

// ───────── Cloudflare Workers AI (FLUX) via le relais Worker de l'utilisateur
async function cloudflare(o: GenOptions): Promise<string[]> {
  const s = useStore.getState().settings
  const [w, h] = ASPECT_PX[o.aspect || '1:1']
  const model = s.cfModel || CF_MODELS[0].id
  const flux = /flux/.test(model)
  const one = async () => {
    const r = await fetch(s.cfUrl!.replace(/\/$/, ''), {
      method: 'POST', signal: o.signal,
      headers: { 'Content-Type': 'application/json', ...(s.cfToken ? { Authorization: `Bearer ${s.cfToken}` } : {}) },
      body: JSON.stringify({ model, prompt: o.prompt, ...(flux ? { steps: 8 } : { width: w, height: h, negative_prompt: NEGATIVE, num_steps: 20 }) }),
    })
    if (!r.ok) throw new Error(r.status === 401 ? 'Cloudflare : mot de passe du relais incorrect.' : r.status === 429 ? 'Cloudflare : quota gratuit du jour atteint (remis à zéro à 1 h, heure de Paris en hiver).' : 'Cloudflare : ' + (await errorText(r)))
    const img = await blobToDataUrl(await r.blob())
    return flux ? cropToAspect(img, o.aspect) : img
  }
  return Promise.all(Array.from({ length: o.n || 1 }, one))
}

// ───────── Hugging Face (crédits gratuits mensuels)
async function huggingface(o: GenOptions): Promise<string[]> {
  const s = useStore.getState().settings
  const [w, h] = ASPECT_PX[o.aspect || '1:1']
  const model = s.hfModel || HF_MODELS[0].id
  const one = async () => {
    const r = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: 'POST', signal: o.signal,
      headers: { Authorization: `Bearer ${s.hfKey}`, 'Content-Type': 'application/json', Accept: 'image/png' },
      body: JSON.stringify({ inputs: o.prompt, parameters: { width: w, height: h, ...(/flux/i.test(model) ? {} : { negative_prompt: NEGATIVE }) } }),
    })
    if (!r.ok) throw new Error(r.status === 401 ? 'Hugging Face : jeton invalide.' : r.status === 402 || r.status === 429 ? 'Hugging Face : crédits gratuits du mois épuisés.' : r.status === 503 ? 'Hugging Face : le modèle démarre, réessayez dans 30 secondes.' : 'Hugging Face : ' + (await errorText(r)))
    const blob = await r.blob()
    if (!blob.type.startsWith('image/')) throw new Error('Hugging Face n’a pas renvoyé d’image.')
    return blobToDataUrl(blob)
  }
  return Promise.all(Array.from({ length: o.n || 1 }, one))
}

// ───────── IA locale : Automatic1111, Forge, SD.Next ou Draw Things (API compatible /sdapi/v1)
async function local(o: GenOptions): Promise<string[]> {
  const s = useStore.getState().settings
  const [w, h] = ASPECT_PX[o.aspect || '1:1']
  const base = (s.localUrl || 'http://127.0.0.1:7860').replace(/\/$/, '')
  const body: Record<string, unknown> = { prompt: o.prompt, negative_prompt: NEGATIVE, width: w, height: h, steps: s.localSteps || 25, batch_size: o.n || 1, cfg_scale: 6 }
  let path = '/sdapi/v1/txt2img'
  if (o.refs?.length) { path = '/sdapi/v1/img2img'; body.init_images = [o.refs[0].split(',')[1]]; body.denoising_strength = 0.6 }
  let r: Response
  try { r = await fetch(base + path, { method: 'POST', signal: o.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new Error(`IA locale injoignable à ${base}. Lancez votre logiciel avec l’API activée (--api --cors-allow-origins=*) puis réessayez.`) }
  if (!r.ok) throw new Error('IA locale : ' + (await errorText(r)))
  const j = await r.json()
  const imgs = ((j.images || []) as string[]).map((b) => (b.startsWith('data:') ? b : `data:image/png;base64,${b}`))
  if (!imgs.length) throw new Error('IA locale : aucune image renvoyée.')
  return imgs
}

const RUN: Record<ImageProvider, (o: GenOptions) => Promise<string[]>> = { gemini, openai, pollinations, cloudflare, huggingface, local }

export async function generateImages(o: GenOptions): Promise<string[]> {
  const list = readyProviders(o.provider)
  if (!list.length) throw new Error('Aucun générateur d’images disponible : activez Pollinations (gratuit) ou ajoutez une clé dans Paramètres → Images.')
  let lastErr: Error | null = null
  for (const p of list) {
    try {
      const imgs = await RUN[p](o)
      const final = o.jpeg ? await Promise.all(imgs.map((d) => (d.startsWith('data:') ? toJpeg(d) : Promise.resolve(d)))) : imgs
      useStore.getState().log(`Image générée (${providerLabel(p)}) : ${o.prompt.slice(0, 60)}`)
      if (p !== list[0]) useStore.getState().notify(`${providerLabel(list[0])} indisponible : images créées avec ${providerLabel(p)}.`)
      return final
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      lastErr = e as Error
      // un générateur demandé explicitement ne bascule pas sur un autre
      if (o.provider) break
    }
  }
  throw lastErr || new Error('Échec de la génération d’images.')
}

/** Code du relais Cloudflare à coller dans un Worker (liaison « AI » requise). */
export const CF_WORKER_CODE = `// Relais EDICREA AI → Cloudflare Workers AI (gratuit : 10 000 neurons / jour)
// 1. Remplacez MOT_DE_PASSE ci-dessous par un mot de passe de votre choix.
// 2. Settings → Bindings → Add → Workers AI, nom de variable : AI.
const MOT_DE_PASSE = 'changez-moi'
const MODELES = ['@cf/black-forest-labs/flux-1-schnell', '@cf/bytedance/stable-diffusion-xl-lightning', '@cf/lykon/dreamshaper-8-lcm']
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
    if (req.method !== 'POST') return new Response('EDICREA AI : relais prêt.', { headers: CORS })
    if (req.headers.get('Authorization') !== 'Bearer ' + MOT_DE_PASSE) return new Response(JSON.stringify({ error: { message: 'Mot de passe incorrect' } }), { status: 401, headers: CORS })
    const { model, ...input } = await req.json()
    if (!MODELES.includes(model)) return new Response(JSON.stringify({ error: { message: 'Modèle non autorisé' } }), { status: 400, headers: CORS })
    try {
      const out = await env.AI.run(model, input)
      if (out && out.image) {
        const bin = Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0))
        return new Response(bin, { headers: { ...CORS, 'Content-Type': 'image/jpeg' } })
      }
      return new Response(out, { headers: { ...CORS, 'Content-Type': 'image/png' } })
    } catch (e) {
      return new Response(JSON.stringify({ error: { message: String(e.message || e) } }), { status: /limit|quota|neuron/i.test(String(e)) ? 429 : 500, headers: CORS })
    }
  },
}
`

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
