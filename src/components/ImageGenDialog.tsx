import { useRef, useState } from 'react'
import { ImagePlus, Sparkles, Wand2, X, Check, RefreshCw, KeyRound, FolderPlus, Upload } from 'lucide-react'
import { Modal, Seg, Spinner, FileButton } from './ui'
import { useStore } from '../lib/store'
import { generateImages, imageReady, readyProviders, providerLabel, durationHint, isFree, type Aspect, type ImageProvider } from '../lib/imageGen'
import { aiReady, askClaude } from '../lib/ai'
import { readAsDataURL } from '../lib/importers'

const STYLES = ['Photo réaliste', 'Illustration éditoriale', 'Aquarelle', 'Peinture à l’huile', 'Rendu 3D', 'Flat design', 'Gravure vintage', 'Manga', 'Crayon et encre', 'Collage']
const ASPECTS: { v: Aspect; label: string }[] = [{ v: '2:3', label: '2:3 livre' }, { v: '3:4', label: '3:4' }, { v: '1:1', label: '1:1' }, { v: '4:3', label: '4:3' }, { v: '16:9', label: '16:9' }, { v: '9:16', label: '9:16' }]

export default function ImageGenDialog({ onClose, onPick, initialPrompt = '', initialAspect = '1:1', reference, title = 'Générer une image' }: {
  onClose: () => void
  onPick: (dataUrl: string) => void
  initialPrompt?: string
  initialAspect?: Aspect
  /** image sélectionnée, proposée comme référence (retouche, variation) */
  reference?: string
  title?: string
}) {
  const { settings, setSettings, addAsset, notify, go } = useStore()
  const avail = readyProviders()
  const ready = imageReady()
  const [provider, setProvider] = useState<ImageProvider>(ready || settings.imageProvider)
  const [prompt, setPrompt] = useState(initialPrompt)
  const [style, setStyle] = useState('')
  const [aspect, setAspect] = useState<Aspect>(initialAspect)
  const [n, setN] = useState(2)
  const [refs, setRefs] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [results, setResults] = useState<string[]>([])
  const [picked, setPicked] = useState(0)
  const abort = useRef<AbortController | null>(null)

  const run = async () => {
    if (!prompt.trim()) return
    setErr(''); setBusy(`${providerLabel(provider)} crée ${n > 1 ? n + ' images' : 'l’image'}…`)
    abort.current = new AbortController()
    try {
      const full = `${prompt.trim()}${style ? `\nStyle : ${style}.` : ''}\nAucun texte, aucune lettre ni filigrane dans l’image sauf demande explicite.`
      const imgs = await generateImages({ prompt: full, aspect, n, refs, provider, signal: abort.current.signal })
      setResults(imgs); setPicked(0)
    } catch (e) { if ((e as Error).name !== 'AbortError') setErr((e as Error).message) } finally { setBusy('') }
  }

  const improve = async () => {
    setBusy('Claude enrichit la consigne…')
    try {
      const t = await askClaude({ maxTokens: 1500, system: 'Tu es directeur·rice artistique. Réécris la demande en une consigne de génération d’image précise et visuelle (sujet, composition, cadrage, lumière, ambiance, palette, style), en français, en 3 à 5 phrases. Pas de texte dans l’image. Réponds uniquement avec la consigne.', messages: [{ role: 'user', content: prompt }] })
      setPrompt(t.trim())
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }

  if (!ready) return (
    <Modal title={title} icon={ImagePlus} onClose={onClose}>
      <div className="space-y-3 text-[13px]">
        <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent-soft p-3"><KeyRound size={16} className="mt-0.5 shrink-0 text-accent" /><span>Pour générer des images, activez <b>Pollinations</b> (gratuit, sans clé) ou un autre générateur : Cloudflare, Hugging Face, IA locale, Nano Banana, GPT Image.</span></div>
        <button className="btn-accent w-full" onClick={() => { onClose(); go({ name: 'settings' }); setTimeout(() => window.dispatchEvent(new CustomEvent('edicrea:settings', { detail: 'images' })), 50) }}>Ouvrir les paramètres</button>
      </div>
    </Modal>
  )

  return (
    <Modal title={title} subtitle="Décrivez l’image : elle est créée par l’IA, puis insérée et entièrement modifiable." icon={ImagePlus} wide onClose={() => { abort.current?.abort(); onClose() }}
      footer={<>
        {results.length > 0 && <button className="btn mr-auto" onClick={() => { results.forEach((r, i) => addAsset({ name: `IA ${providerLabel(provider)} ${new Date().toLocaleDateString('fr-FR')} #${i + 1}`, type: 'image', data: r })); notify('Images enregistrées dans la bibliothèque.') }}><FolderPlus size={14} /> Tout garder dans la bibliothèque</button>}
        <button className="btn" onClick={onClose}>Fermer</button>
        <button className="btn-accent" disabled={!results.length} onClick={() => { onPick(results[picked]); onClose() }}><Check size={14} /> Utiliser cette image</button>
      </>}>
      <div className="grid gap-5 md:grid-cols-[340px_1fr]">
        <div className="space-y-3.5">
          {avail.length > 1 ? <div><span className="label">Générateur</span><select className="input" value={provider} onChange={(e) => { const v = e.target.value as ImageProvider; setProvider(v); setSettings({ imageProvider: v }) }}>{avail.map((p) => <option key={p} value={p}>{providerLabel(p)}{isFree(p) ? ' — gratuit' : ''}</option>)}</select></div>
            : <div className="chip"><Sparkles size={11} className="text-accent" /> {providerLabel(provider)}{isFree(provider) ? ' · gratuit' : ''}</div>}
          <div>
            <span className="label">Description</span>
            <textarea className="input" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ex. : un phare au crépuscule sur une côte bretonne, une jeune fille sur les rochers regarde l’horizon, lumière dorée, ambiance mélancolique" autoFocus />
            {aiReady() && <button className="mt-1.5 text-[12px] font-medium text-accent hover:underline disabled:opacity-40" disabled={!prompt.trim() || !!busy} onClick={improve}><Wand2 size={12} className="mr-1 inline" />Améliorer la description avec Claude</button>}
          </div>
          <div>
            <span className="label">Style</span>
            <div className="flex flex-wrap gap-1.5">{STYLES.map((s) => <button key={s} className={`chip ${style === s ? '!border-accent/60 !bg-accent-soft !text-ink' : ''}`} onClick={() => setStyle(style === s ? '' : s)}>{s}</button>)}</div>
          </div>
          <div>
            <span className="label">Format</span>
            <div className="flex flex-wrap gap-1.5">{ASPECTS.map((a) => <button key={a.v} className={`chip ${aspect === a.v ? '!border-accent/60 !bg-accent-soft !text-ink' : ''}`} onClick={() => setAspect(a.v)}>{a.label}</button>)}</div>
          </div>
          <div>
            <span className="label">Nombre de propositions</span>
            <Seg className="flex w-full" value={String(n)} onChange={(v) => setN(+v)} options={['1', '2', '3', '4'].map((v) => ({ v, label: v }))} />
          </div>
          <div>
            <span className="label">Images de référence (facultatif)</span>
            <div className="flex flex-wrap gap-2">
              {refs.map((r, i) => <div key={i} className="relative"><img src={r} className="h-14 w-14 rounded-md border border-line object-cover" /><button className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white" onClick={() => setRefs(refs.filter((_, j) => j !== i))}><X size={11} /></button></div>)}
              {reference && !refs.includes(reference) && <button className="flex h-14 items-center gap-1.5 rounded-md border border-dashed border-line2 px-2 text-[11.5px] text-muted hover:border-accent" onClick={() => setRefs([...refs, reference])}><img src={reference} className="h-9 w-9 rounded object-cover" />Utiliser la sélection</button>}
              <FileButton accept="image/*" multiple className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-line2 text-muted hover:border-accent" onFiles={async (f) => setRefs([...refs, ...(await Promise.all(f.map(readAsDataURL)))].slice(0, 4))}><Upload size={16} /></FileButton>
            </div>
            <p className="mt-1 text-[11px] text-subtle">Pour garder un style, un personnage ou retoucher une photo (« change le fond en plage », « style aquarelle »…).</p>
          </div>
          {busy ? <div className="flex items-center gap-2"><Spinner label={busy} /><button className="btn ml-auto" onClick={() => abort.current?.abort()}>Annuler</button></div>
            : <button className="btn-accent h-10 w-full" disabled={!prompt.trim()} onClick={run}>{results.length ? <><RefreshCw size={15} /> Régénérer</> : <><Sparkles size={15} /> Générer</>}</button>}
          {err && <p className="rounded-md border border-danger/30 bg-danger/10 p-2 text-[12px] text-danger">{err}</p>}
          <p className="text-[11px] text-subtle">{isFree(provider) ? `${providerLabel(provider)} : génération gratuite (${durationHint(provider, n)}).${provider === 'pollinations' ? ' Les images de référence ne sont pas utilisées par ce service.' : ''}` : `La génération est facturée par ${provider === 'gemini' ? 'Google' : 'OpenAI'} sur votre compte (quelques centimes par image).`}</p>
        </div>
        <div className="canvas-bg flex min-h-[340px] items-center justify-center rounded-lg border border-line p-4">
          {results.length ? (
            <div className={`grid w-full gap-3 ${results.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {results.map((r, i) => (
                <button key={i} onClick={() => setPicked(i)} className={`relative overflow-hidden rounded-md bg-panel transition ${picked === i ? 'ring-[3px] ring-accent' : 'opacity-80 hover:opacity-100'}`}>
                  <img src={r} className="w-full" />
                  {picked === i && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink"><Check size={14} strokeWidth={3} /></span>}
                </button>
              ))}
            </div>
          ) : busy ? <Spinner label={`Création en cours… (${durationHint(provider, n)})`} /> : (
            <div className="max-w-xs text-center text-[12.5px] text-muted"><ImagePlus size={28} className="mx-auto mb-2 text-subtle" />Les propositions apparaîtront ici. Cliquez sur celle que vous préférez, puis « Utiliser cette image ».</div>
          )}
        </div>
      </div>
    </Modal>
  )
}
