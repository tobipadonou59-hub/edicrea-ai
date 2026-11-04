import Anthropic from '@anthropic-ai/sdk'
import { useStore } from './store'

// Couche IA : appels à l'API Claude depuis le navigateur avec la clé saisie dans Paramètres.
// En production, ces appels passeront par le backend (proxy NestJS) pour ne pas exposer la clé.

export const aiReady = () => !!useStore.getState().settings.apiKey

type Part = { type: 'text'; text: string } | { type: 'image'; dataUrl: string }

export interface AskOptions {
  system: string
  messages: { role: 'user' | 'assistant'; content: string | Part[] }[]
  maxTokens?: number
  onText?: (t: string) => void
  signal?: AbortSignal
}

function toContent(c: string | Part[]): Anthropic.Beta.BetaMessageParam['content'] {
  if (typeof c === 'string') return c
  return c.map((p) => {
    if (p.type === 'text') return { type: 'text' as const, text: p.text }
    const [head, data] = p.dataUrl.split(',')
    const media = (head.match(/data:(.*?);/)?.[1] || 'image/png') as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
    return { type: 'image' as const, source: { type: 'base64' as const, media_type: media, data } }
  })
}

export async function askClaude(o: AskOptions): Promise<string> {
  const { apiKey, apiBase, model, effort } = useStore.getState().settings
  if (!apiKey) throw new Error("Aucune clé API Claude n'est configurée (Paramètres).")
  const client = new Anthropic({ apiKey, baseURL: apiBase || undefined, dangerouslyAllowBrowser: true })
  const params = {
    model: model || 'claude-opus-5-5',
    max_tokens: o.maxTokens ?? 32000,
    system: o.system,
    thinking: { type: 'adaptive' },
    output_config: { effort },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: o.messages.map((m) => ({ role: m.role, content: toContent(m.content) })),
  } as unknown as Anthropic.Beta.MessageCreateParamsStreaming
  const run = async (p: Anthropic.Beta.MessageCreateParamsStreaming) => {
    const stream = client.beta.messages.stream(p, { signal: o.signal })
    let acc = ''
    stream.on('text', (t) => { acc += t; o.onText?.(acc) })
    return stream.finalMessage()
  }
  let msg: Anthropic.Beta.BetaMessage
  try {
    msg = await run(params)
  } catch (e) {
    // compte ou plateforme sans repli serveur : on relance la requête sans ce paramètre bêta
    if (e instanceof Anthropic.BadRequestError && /fallback|beta/i.test(e.message)) {
      const { fallbacks: _f, betas: _b, ...plain } = params as unknown as Record<string, unknown>
      msg = await run(plain as unknown as Anthropic.Beta.MessageCreateParamsStreaming)
    } else if (e instanceof Anthropic.AuthenticationError) throw new Error('Clé API invalide (Paramètres).')
    else if (e instanceof Anthropic.RateLimitError) throw new Error('Limite de débit atteinte : réessayez dans un instant.')
    else throw e
  }
  if (msg.stop_reason === 'refusal') throw new Error("La demande a été refusée par le modèle.")
  return msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
}

/** Extrait le premier objet/tableau JSON d'une réponse. */
export function extractJSON<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const src = fenced ? fenced[1] : text
  const start = src.search(/[[{]/)
  if (start < 0) throw new Error('Réponse IA sans JSON')
  const open = src[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close) { depth--; if (depth === 0) return JSON.parse(src.slice(start, i + 1)) }
  }
  throw new Error('JSON IA incomplet')
}

export async function ocrImages(images: string[], onProgress?: (i: number) => void): Promise<string> {
  let out = ''
  for (let i = 0; i < images.length; i++) {
    onProgress?.(i)
    const t = await askClaude({
      system: "Tu es un moteur de reconnaissance de texte (OCR). Transcris fidèlement tout le texte de l'image, dans l'ordre de lecture, sans rien corriger ni commenter. Marque les titres avec # / ## et sépare les paragraphes par une ligne vide.",
      messages: [{ role: 'user', content: [{ type: 'image', dataUrl: images[i] }, { type: 'text', text: 'Transcris le texte de cette page.' }] }],
      maxTokens: 8000,
    })
    out += t + '\n\n'
  }
  return out
}
