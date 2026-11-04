import { useState } from 'react'
import { FileText, Upload, ClipboardPaste, ArrowRight, BookOpen } from 'lucide-react'
import { useStore } from '../../lib/store'
import { importDocx, importPdf, textToBlocks, pdfToImages, readAsDataURL } from '../../lib/importers'
import { aiReady, ocrImages } from '../../lib/ai'
import { BOOK_CATEGORIES } from '../../lib/defaults'
import type { Block } from '../../lib/types'
import { Field, Spinner } from '../ui'

const SAMPLE = `# Chapitre 1 : Le départ

Il était une fois , dans un petit village au bord de la mer, une jeune fille qui révait de voyager. Chaque matin elle regardait les bateaux partir partir vers l'horizon.. Sa grand-mère lui disait souvent : "Un jour, tu comprendras que le voyage commence dans le coeur".

Malgrés les mises en garde de sa famille, elle décida de partir. Parmis ses affaires, elle emporta un vieux carnet, une boussole et une lettre qu'elle n'avait jamais ouverte. Si il fallait tout recommencer, elle ferait exactement le même choix.

# Chapitre 2 : La traversée

La mer était calme le premier jour. Les marins chantaient, le vent soufflait doucement , et la jeune fille écrivait dans son carnet tout ce qu'elle voyait voyait. Elle nota la couleur du ciel, la forme des nuages, le bruit des vagues contre la coque...

## Une rencontre inattendue

Au troisième jour, un vieil homme s'assit à côté d'elle. Il connaissait sa grand-mère. Quelque soit la raison de sa présence, elle sentit que ce voyage allait changer sa vie.

# Chapitre 3 : L'arrivée

Lorsque le port apparut enfin, elle ouvrit la lettre. Les mots de sa grand-mère dansaient sur le papier jauni !`

export default function ImportStep({ next }: { next: () => void }) {
  const project = useStore((s) => s.project)!
  const update = useStore((s) => s.update)
  const notify = useStore((s) => s.notify)
  const log = useStore((s) => s.log)
  const [busy, setBusy] = useState('')
  const [paste, setPaste] = useState('')
  const [drag, setDrag] = useState(false)
  const book = project.book!
  const info = book.cover.info

  const load = (blocks: Block[], name: string) => {
    if (!blocks.length) { notify('Aucun texte trouvé dans ce fichier.'); return }
    update((p) => {
      const b = p.book!
      b.blocks = blocks
      b.originalBlocks = structuredClone(blocks)
      b.suggestions = []
      b.sourceName = name
      const h1 = blocks.find((x) => x.type === 'h1')
      if (!b.cover.info.title) b.cover.info.title = p.name || h1?.text || ''
    })
    useStore.getState().snapshot('Manuscrit importé : ' + name)
    log(`Manuscrit importé (${blocks.length} blocs) : ${name}`, project.id)
    notify(`${blocks.length} blocs importés — titres, chapitres et listes détectés automatiquement.`)
  }

  const handle = async (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    try {
      if (ext === 'docx') { setBusy('Lecture du document Word…'); load(await importDocx(f), f.name) }
      else if (ext === 'txt' || ext === 'md') { setBusy('Lecture du texte…'); load(textToBlocks(await f.text()), f.name) }
      else if (ext === 'pdf') {
        setBusy('Extraction du texte du PDF…')
        const r = await importPdf(f, (p) => setBusy(`Extraction du texte du PDF… ${Math.round(p * 100)} %`))
        if (r.textChars < 200) {
          if (!aiReady()) { notify('Ce PDF semble scanné (pas de texte). Ajoutez une clé API Claude pour la reconnaissance de texte (OCR).'); return }
          setBusy('PDF scanné : reconnaissance de texte par IA…')
          const imgs = await pdfToImages(f)
          const txt = await ocrImages(imgs, (i) => setBusy(`Reconnaissance de texte (OCR) — page ${i + 1}/${imgs.length}…`))
          load(textToBlocks(txt), f.name + ' (OCR)')
        } else load(r.blocks, f.name)
      } else if (/^(png|jpe?g|webp|gif)$/.test(ext || '')) {
        if (!aiReady()) { notify('La reconnaissance de texte dans les images nécessite une clé API Claude (Paramètres).'); return }
        setBusy('Reconnaissance de texte dans l’image…')
        const txt = await ocrImages([await readAsDataURL(f)])
        load(textToBlocks(txt), f.name + ' (OCR)')
      } else if (ext === 'doc') notify('Format .doc ancien : enregistrez le fichier en .docx depuis Word puis réimportez-le.')
      else notify('Format non pris en charge. Utilisez DOCX, PDF, TXT, MD ou une image.')
    } catch (e) { notify('Erreur d’importation : ' + (e as Error).message) } finally { setBusy('') }
  }

  const words = book.blocks.reduce((a, b) => a + (b.text ? b.text.split(/\s+/).filter(Boolean).length : 0), 0)
  const stats = { h1: book.blocks.filter((b) => b.type === 'h1').length, img: book.blocks.filter((b) => b.type === 'image').length, tab: book.blocks.filter((b) => b.type === 'table').length }

  const formats = [['DOCX', 'Word'], ['PDF', 'texte ou scanné'], ['TXT · MD', 'texte brut'], ['PNG · JPG', 'OCR IA']]
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1180px] gap-6 p-4 md:p-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div>
            <div className="eyebrow mb-1">Étape 1 sur 6</div>
            <h2 className="text-[20px] font-semibold tracking-tight">Importer le manuscrit</h2>
            <p className="mt-1 text-[13px] text-muted">Titres, chapitres, listes, tableaux et images sont détectés automatiquement. Le texte original est conservé pour la comparaison.</p>
          </div>
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void handle(f) }}
            className={`relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-dashed px-8 py-12 text-center transition ${drag ? 'border-accent bg-accent-soft' : 'border-line2 bg-panel hover:border-accent/50'}`}>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/25 to-accent/5 text-accent ring-1 ring-accent/30"><Upload size={24} /></span>
            <div className="text-[15px] font-semibold">Glissez-déposez votre fichier ici</div>
            <p className="max-w-md text-[12.5px] text-muted">ou parcourez votre ordinateur. Les PDF scannés et les photos de pages passent par la reconnaissance de texte IA.</p>
            {busy ? <Spinner label={busy} /> : (
              <label className="btn-accent mt-1 h-9 cursor-pointer px-4">
                <FileText size={15} /> Parcourir…
                <input type="file" hidden accept=".docx,.pdf,.txt,.md,.doc,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handle(f) }} />
              </label>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-2">{formats.map(([f, d]) => <span key={f} className="chip"><b className="font-semibold text-ink">{f}</b>{d}</span>)}</div>
          </div>

          {book.blocks.length > 0 && (
            <div className="card flex flex-wrap items-center gap-4 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ok/15 text-ok"><FileText size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{book.sourceName}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                  {[[words.toLocaleString('fr-FR'), 'mots'], [book.blocks.length, 'blocs'], [stats.h1, 'chapitres'], [stats.img, 'images'], [stats.tab, 'tableaux'], ['~' + Math.max(1, Math.ceil(words / 250)), 'pages']].map(([v, l]) => <span key={String(l)}><b className="tabular-nums text-ink">{v}</b> {l}</span>)}
                </div>
              </div>
              <button className="btn-accent" onClick={next}>Continuer : Corriger <ArrowRight size={15} /></button>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="panel-title justify-between"><span className="flex items-center gap-2"><ClipboardPaste size={14} /> Coller du texte</span><button className="btn-ghost !h-7 text-[12px] text-accent" onClick={() => setPaste(SAMPLE)}>Insérer un exemple</button></div>
            <div className="p-3">
              <textarea className="input font-mono !text-[12px]" rows={7} placeholder={'# Chapitre 1\n\nVotre texte… (une ligne vide sépare les paragraphes ; # titre, ## sous-titre, - liste, > citation)'} value={paste} onChange={(e) => setPaste(e.target.value)} />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11.5px] text-subtle">Syntaxe : <code># titre</code> · <code>## sous-titre</code> · <code>- liste</code> · <code>&gt; citation</code> · <code>---</code> saut de page</span>
                <button className="btn-accent" disabled={!paste.trim()} onClick={() => { load(textToBlocks(paste), 'Texte collé'); setPaste('') }}>Importer le texte</button>
              </div>
            </div>
          </div>
        </div>

        <div className="card h-fit overflow-hidden">
          <div className="panel-title"><BookOpen size={14} /> Informations du livre</div>
          <div className="space-y-3 p-4">
            <Field label="Titre"><input className="input" value={info.title} onChange={(e) => update((p) => { p.book!.cover.info.title = e.target.value; p.name = e.target.value || p.name }, { undoable: false })} /></Field>
            <Field label="Sous-titre"><input className="input" value={info.subtitle} onChange={(e) => update((p) => { p.book!.cover.info.subtitle = e.target.value }, { undoable: false })} /></Field>
            <Field label="Auteur·rice"><input className="input" value={info.author} onChange={(e) => update((p) => { p.book!.cover.info.author = e.target.value }, { undoable: false })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Éditeur"><input className="input" value={info.publisher} onChange={(e) => update((p) => { p.book!.cover.info.publisher = e.target.value }, { undoable: false })} /></Field>
              <Field label="Catégorie"><select className="input" value={info.category} onChange={(e) => update((p) => { p.book!.cover.info.category = e.target.value }, { undoable: false })}>{BOOK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            </div>
            <Field label="Client / commanditaire"><input className="input" value={project.client} onChange={(e) => update((p) => { p.client = e.target.value }, { undoable: false })} /></Field>
          </div>
        </div>
      </div>
    </div>
  )
}
