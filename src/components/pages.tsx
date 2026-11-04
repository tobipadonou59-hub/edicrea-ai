import { useEffect, useState } from 'react'
import { BookOpen, Image as ImageIcon, PenTool, Copy, Trash2, Upload, Plus, FileText, Palette, Type, Search, KeyRound, Moon, Sun, ExternalLink, LayoutGrid, List, MoreHorizontal, FolderOpen, LayoutTemplate, History as HistoryIcon, Sparkles, ArrowRight, Check, Shield, Database, Cpu, FileUp, Clock, Monitor } from 'lucide-react'
import { useStore, type ProjectMeta } from '../lib/store'
import { POSTER_FORMATS, BOOK_FORMATS } from '../lib/defaults'
import { readAsDataURL } from '../lib/importers'
import type { Project, ProjectKind } from '../lib/types'
import { EmptyState, Field, FileButton, Menu, MenuItem, MenuSep, PageHeader, Seg } from './ui'
import { aiReady } from '../lib/ai'
import { GEMINI_MODELS, OPENAI_MODELS, generateImages } from '../lib/imageGen'
import { STEPS } from './book/steps'

const KIND: Record<ProjectKind, { label: string; icon: typeof BookOpen; color: string; grad: string }> = {
  book: { label: 'Livre', icon: BookOpen, color: '#dcb56f', grad: 'from-[#3a2c14] to-[#1b160d]' },
  poster: { label: 'Affiche', icon: ImageIcon, color: '#6fa3f0', grad: 'from-[#142a48] to-[#0d1726]' },
  design: { label: 'Création', icon: PenTool, color: '#b893f0', grad: 'from-[#2c1d48] to-[#160f26]' },
}
const ago = (t: number) => { const d = (Date.now() - t) / 1000; return d < 60 ? 'à l’instant' : d < 3600 ? `il y a ${Math.round(d / 60)} min` : d < 86400 ? `il y a ${Math.round(d / 3600)} h` : new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }
const wrap = 'mx-auto w-full max-w-[1320px] px-4 py-6 md:px-8 md:py-8'

function ProjectMenu({ m }: { m: ProjectMeta }) {
  const { deleteProject, duplicateProject, openProject } = useStore()
  return (
    <Menu label={<MoreHorizontal size={15} />} align="right" className="btn-icon">
      {(close) => <>
        <MenuItem icon={ExternalLink} onClick={() => { close(); void openProject(m.id) }}>Ouvrir</MenuItem>
        <MenuItem icon={Copy} onClick={() => { close(); void duplicateProject(m.id) }}>Dupliquer</MenuItem>
        <MenuSep />
        <MenuItem icon={Trash2} danger onClick={() => { close(); if (confirm(`Supprimer « ${m.name} » ? Cette action est définitive.`)) void deleteProject(m.id) }}>Supprimer</MenuItem>
      </>}
    </Menu>
  )
}

function ProjectCard({ m }: { m: ProjectMeta }) {
  const { openProject } = useStore()
  const K = KIND[m.kind]
  return (
    <div className="group overflow-hidden rounded-xl border border-line bg-panel transition hover:-translate-y-0.5 hover:border-line2" style={{ boxShadow: 'var(--shadow)' }}>
      <button className="canvas-bg relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden p-4" onClick={() => void openProject(m.id)}>
        {m.thumb ? <img src={m.thumb} className="paper-shadow max-h-full max-w-full rounded-[2px] object-contain transition group-hover:scale-[1.02]" /> : (
          <div className={`flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br ${K.grad}`}><K.icon size={34} style={{ color: K.color }} strokeWidth={1.5} /></div>
        )}
        <span className="absolute left-2.5 top-2.5 inline-flex h-[22px] items-center gap-1 rounded-md bg-black/55 px-1.5 text-[10.5px] font-semibold text-white backdrop-blur"><K.icon size={11} style={{ color: K.color }} />{K.label}</span>
      </button>
      <div className="flex items-start gap-2 border-t border-line p-3">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => void openProject(m.id)}>
          <div className="truncate text-[13.5px] font-semibold">{m.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-subtle">
            <Clock size={11} />{ago(m.updatedAt)}{m.client && <><span>·</span><span className="truncate">{m.client}</span></>}
          </div>
          {m.kind === 'book' && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-0.5">{STEPS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= m.step ? 'bg-accent' : 'bg-line2'}`} />)}</div>
              <span className="text-[10.5px] text-muted">{STEPS[m.step]?.label}</span>
            </div>
          )}
        </div>
        <div className="opacity-0 transition group-hover:opacity-100"><ProjectMenu m={m} /></div>
      </div>
    </div>
  )
}

/** Illustrations des cartes de création (CSS/SVG, aucune image externe). */
function CreateVisual({ kind }: { kind: ProjectKind }) {
  if (kind === 'book') return (
    <div className="relative h-full w-full">
      <div className="absolute bottom-3 left-1/2 h-[78%] w-[30%] -translate-x-[78%] rotate-[-8deg] rounded-r-[3px] bg-gradient-to-br from-[#efe4cf] to-[#cdb98f] shadow-[6px_8px_18px_rgba(0,0,0,.45)]">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-black/15" /><div className="mx-auto mt-[22%] h-1 w-1/2 rounded bg-[#5c4826]/60" /><div className="mx-auto mt-2 h-0.5 w-1/3 rounded bg-[#5c4826]/40" />
      </div>
      <div className="absolute bottom-3 left-1/2 h-[84%] w-[32%] -translate-x-[12%] rotate-[5deg] rounded-r-[3px] bg-gradient-to-br from-[#1f3a5f] to-[#0e1c30] shadow-[6px_10px_22px_rgba(0,0,0,.5)]">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-black/30" /><div className="absolute bottom-[18%] left-1/2 h-7 w-7 -translate-x-1/2 rounded-full bg-[#dcb56f]" /><div className="mx-auto mt-[20%] h-1.5 w-3/5 rounded bg-white/85" /><div className="mx-auto mt-1.5 h-1 w-2/5 rounded bg-white/50" />
      </div>
    </div>
  )
  if (kind === 'poster') return (
    <div className="relative h-full w-full">
      <div className="absolute bottom-2 left-1/2 h-[86%] w-[34%] -translate-x-1/2 overflow-hidden rounded-[3px] bg-gradient-to-b from-[#ff7a59] via-[#c23b6b] to-[#3a1d5c] shadow-[0_10px_24px_rgba(0,0,0,.5)]">
        <div className="absolute -right-4 top-3 h-12 w-12 rounded-full bg-[#ffd166]/90" />
        <div className="absolute bottom-0 h-1/3 w-full bg-[#1b0f2e]/70" />
        <div className="absolute bottom-[38%] left-2.5 h-2 w-3/4 rounded bg-white" /><div className="absolute bottom-[30%] left-2.5 h-1 w-1/2 rounded bg-white/70" />
      </div>
    </div>
  )
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 h-full w-full">
      <path d="M40 95 C 70 20, 120 20, 160 70" fill="none" stroke="#b893f0" strokeWidth="2.5" />
      <path d="M40 95 L 80 30 M160 70 L 135 25" stroke="#b893f0" strokeWidth="1" strokeDasharray="3 3" opacity=".6" />
      {[[40, 95], [160, 70]].map(([x, y]) => <rect key={x} x={x - 4} y={y - 4} width="8" height="8" fill="#16101f" stroke="#e7d7ff" strokeWidth="1.5" />)}
      {[[80, 30], [135, 25]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.5" fill="#e7d7ff" />)}
      <rect x="100" y="62" width="50" height="38" rx="4" fill="#6fa3f0" opacity=".85" /><circle cx="78" cy="80" r="16" fill="#dcb56f" opacity=".9" />
    </svg>
  )
}

const QUICK: { label: string; sub: string; kind: ProjectKind; fmt: string }[] = [
  { label: 'Roman', sub: '130 × 200 mm', kind: 'book', fmt: 'roman' },
  { label: 'Manuel scolaire', sub: '195 × 265 mm', kind: 'book', fmt: 'manuel' },
  { label: 'Magazine A4', sub: '210 × 297 mm', kind: 'book', fmt: 'a4' },
  { label: 'Affiche A3', sub: '297 × 420 mm', kind: 'poster', fmt: 'a3' },
  { label: 'Flyer A5', sub: '148 × 210 mm', kind: 'poster', fmt: 'flyer' },
  { label: 'Post Instagram', sub: '1080 × 1350 px', kind: 'design', fmt: 'igpost' },
  { label: 'Story', sub: '1080 × 1920 px', kind: 'design', fmt: 'story' },
  { label: 'Miniature YouTube', sub: '1280 × 720 px', kind: 'design', fmt: 'ytthumb' },
]

async function createWithFormat(kind: ProjectKind, fmt: string, name: string, client = '') {
  const s = useStore.getState()
  await s.createProject(kind, name, client)
  if (kind === 'book' && BOOK_FORMATS[fmt]) s.update((p) => { const f = BOOK_FORMATS[fmt]; Object.assign(p.book!.layout, { format: fmt, width: f.w, height: f.h }) }, { undoable: false })
  if (kind === 'poster' && POSTER_FORMATS[fmt]) s.update((p) => { p.poster!.format = fmt }, { undoable: false })
  if (kind === 'design' && POSTER_FORMATS[fmt]) {
    const f = POSTER_FORMATS[fmt], k = f.px ? 1 : 3
    s.update((p) => { p.design = { width: f.w * k, height: f.h * k, unitsPerMm: f.px ? 0 : k, bleedMm: 0, json: null } }, { undoable: false })
  }
}

export function Dashboard() {
  const { index, go, history, templates, assets, settings } = useStore()
  const h = new Date().getHours()
  const hello = h < 6 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir'
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const create: { kind: ProjectKind; title: string; text: string; name: string }[] = [
    { kind: 'book', title: 'Concevoir un livre', text: 'Du manuscrit au PDF imprimeur : correction, composition, pagination, couverture.', name: 'Nouveau livre' },
    { kind: 'poster', title: 'Créer une affiche', text: 'Décrivez l’événement, l’IA propose quatre compositions à personnaliser.', name: 'Nouvelle affiche' },
    { kind: 'design', title: 'Studio graphique', text: 'Vectoriel, retouche photo, calques et typographie sur un canevas libre.', name: 'Nouvelle création' },
  ]
  const stats = [
    { label: 'Livres', v: index.filter((m) => m.kind === 'book').length, icon: BookOpen },
    { label: 'Affiches', v: index.filter((m) => m.kind === 'poster').length, icon: ImageIcon },
    { label: 'Créations', v: index.filter((m) => m.kind === 'design').length, icon: PenTool },
    { label: 'Modèles', v: templates.length, icon: LayoutTemplate },
    { label: 'Ressources', v: assets.length, icon: FolderOpen },
  ]
  return (
    <div className={wrap}>
      <PageHeader eyebrow={today} title={`${hello}${settings.userName && settings.userName !== 'Moi' ? ', ' + settings.userName : ''}`} subtitle="De l’idée au livre, de l’imagination à l’affiche, jusqu’au document prêt à imprimer."
        actions={<><button className="btn" onClick={() => go({ name: 'library' })}><FolderOpen size={15} /> Ressources</button><button className="btn-accent" onClick={() => go({ name: 'new' })}><Plus size={15} /> Nouveau projet</button></>} />

      <div className="grid gap-4 md:grid-cols-3">
        {create.map((c) => {
          const K = KIND[c.kind]
          return (
            <button key={c.kind} onClick={() => void useStore.getState().createProject(c.kind, c.name)} className="group relative overflow-hidden rounded-xl border border-line bg-panel text-left transition hover:-translate-y-0.5 hover:border-line2" style={{ boxShadow: 'var(--shadow)' }}>
              <div className={`relative h-36 overflow-hidden bg-gradient-to-br ${K.grad}`}>
                <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '14px 14px' }} />
                <div className="absolute inset-0 transition duration-300 group-hover:scale-105"><CreateVisual kind={c.kind} /></div>
              </div>
              <div className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: K.color + '22', color: K.color }}><K.icon size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{c.title}</span><span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{c.text}</span></span>
                <ArrowRight size={16} className="mt-1 text-subtle transition group-hover:translate-x-0.5 group-hover:text-accent" />
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-6">
        <div className="eyebrow mb-2">Partir d’un format</div>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => { const K = KIND[q.kind]; return (
            <button key={q.label} onClick={() => void createWithFormat(q.kind, q.fmt, q.label)} className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 text-left transition hover:border-accent/60">
              <K.icon size={14} style={{ color: K.color }} /><span><span className="block text-[12.5px] font-medium">{q.label}</span><span className="block text-[10.5px] text-subtle">{q.sub}</span></span>
            </button>
          ) })}
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Projets récents</h2>
            {index.length > 0 && <button className="btn-ghost text-muted" onClick={() => go({ name: 'list', filter: 'all' })}>Tout voir <ArrowRight size={14} /></button>}
          </div>
          {index.length ? <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">{index.slice(0, 8).map((m) => <ProjectCard key={m.id} m={m} />)}</div>
            : <EmptyState icon={FileText} title="Aucun projet pour l’instant" text="Créez un livre, une affiche ou une création graphique pour commencer." action={<button className="btn-accent" onClick={() => go({ name: 'new' })}><Plus size={15} /> Nouveau projet</button>} />}
        </section>
        <aside className="space-y-4">
          <div className="card overflow-hidden">
            {stats.map((s, i) => (
              <div key={s.label} className={`flex items-center gap-3 px-4 py-2.5 ${i ? 'border-t border-line' : ''}`}>
                <s.icon size={15} className="text-subtle" /><span className="flex-1 text-[12.5px] text-muted">{s.label}</span><span className="text-[15px] font-semibold tabular-nums">{s.v}</span>
              </div>
            ))}
          </div>
          {!aiReady() && (
            <div className="relative overflow-hidden rounded-xl border border-accent/30 bg-gradient-to-br from-accent-soft to-transparent p-4">
              <KeyRound size={18} className="text-accent" />
              <div className="mt-2 text-[13.5px] font-semibold">Activez l’IA Claude</div>
              <p className="mt-1 text-[12.5px] leading-snug text-muted">Correction avancée, révision éditoriale, direction artistique, illustrations, OCR et assistant complet.</p>
              <button className="btn-accent mt-3" onClick={() => go({ name: 'settings' })}>Ajouter une clé API</button>
            </div>
          )}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-[13.5px] font-semibold">Activité</h3><button className="btn-icon" onClick={() => go({ name: 'history' })}><ArrowRight size={14} /></button></div>
            {history.length ? (
              <ol className="relative ml-1 space-y-3 border-l border-line pl-4">
                {history.slice(0, 7).map((h) => <li key={h.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border-2 border-panel bg-line2" /><div className="text-[12.5px] leading-snug">{h.text}</div><div className="text-[11px] text-subtle">{ago(h.at)}</div></li>)}
              </ol>
            ) : <p className="text-[12.5px] text-muted">L’activité de vos projets apparaîtra ici.</p>}
          </div>
        </aside>
      </div>
    </div>
  )
}

export function NewProject() {
  const { importProject, notify, templates, createProject, update } = useStore()
  const [kind, setKind] = useState<ProjectKind>('book')
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [fmt, setFmt] = useState<Record<ProjectKind, string>>({ book: 'a5', poster: 'a3', design: 'igsq' })
  const info: Record<ProjectKind, { title: string; text: string; points: string[] }> = {
    book: { title: 'Livre', text: 'Romans, manuels, guides, magazines, rapports.', points: ['Import Word, PDF, TXT, OCR', 'Correction IA à valider', 'Pagination et sommaire automatiques', 'Couverture complète et PDF imprimeur'] },
    poster: { title: 'Affiche', text: 'Événements, écoles, campagnes, promotions.', points: ['4 propositions depuis une description', 'Formats impression et réseaux sociaux', 'Personnalisation totale', 'Fonds perdus et traits de coupe'] },
    design: { title: 'Création graphique', text: 'Canevas libre, vectoriel et retouche.', points: ['Plume, formes, pinceaux', 'Calques, masques, fusion', 'Retouche et détourage', 'Export PNG, SVG, TIFF, PDF'] },
  }
  const formats = kind === 'book' ? Object.entries(BOOK_FORMATS).map(([k, f]) => [k, f.label] as const) : Object.entries(POSTER_FORMATS).map(([k, f]) => [k, f.label] as const)
  return (
    <div className={wrap}>
      <PageHeader eyebrow="Créer" title="Nouveau projet" subtitle="Choisissez un type de document et un format, puis commencez." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-3 md:grid-cols-3">
          {(Object.keys(KIND) as ProjectKind[]).map((k) => { const K = KIND[k]; const on = kind === k; return (
            <button key={k} onClick={() => setKind(k)} className={`relative overflow-hidden rounded-xl border bg-panel text-left transition ${on ? 'border-accent ring-2 ring-accent/25' : 'border-line hover:border-line2'}`} style={{ boxShadow: 'var(--shadow)' }}>
              <div className={`relative h-28 bg-gradient-to-br ${K.grad}`}><CreateVisual kind={k} /></div>
              <div className="p-4">
                <div className="flex items-center gap-2"><K.icon size={15} style={{ color: K.color }} /><span className="font-semibold">{info[k].title}</span>{on && <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink"><Check size={12} strokeWidth={3} /></span>}</div>
                <p className="mt-1 text-[12.5px] text-muted">{info[k].text}</p>
                <ul className="mt-3 space-y-1.5">{info[k].points.map((p) => <li key={p} className="flex items-start gap-2 text-[12px]"><Check size={12} className="mt-0.5 shrink-0 text-ok" />{p}</li>)}</ul>
              </div>
            </button>
          ) })}
        </div>
        <div className="card h-fit space-y-4 p-5">
          <div className="eyebrow">Paramètres du projet</div>
          <Field label="Nom du projet"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'book' ? 'Titre du livre' : 'Nom du document'} /></Field>
          <Field label="Client ou commanditaire" hint="Facultatif — permet de filtrer vos projets par client."><input className="input" value={client} onChange={(e) => setClient(e.target.value)} /></Field>
          <Field label="Format"><select className="input" value={fmt[kind]} onChange={(e) => setFmt({ ...fmt, [kind]: e.target.value })}>{formats.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <button className="btn-accent h-10 w-full" onClick={() => void createWithFormat(kind, fmt[kind], name || (kind === 'book' ? 'Nouveau livre' : kind === 'poster' ? 'Nouvelle affiche' : 'Nouvelle création'), client)}><Plus size={16} /> Créer le projet</button>
          <div className="relative py-1 text-center"><span className="absolute inset-x-0 top-1/2 h-px bg-line" /><span className="relative bg-panel px-2 text-[11px] text-subtle">ou</span></div>
          <FileButton accept=".edicrea,.json" className="btn w-full" onFiles={async (f) => { try { const p = JSON.parse(await f[0].text()) as Project; if (!p.kind) throw new Error(); await importProject(p); notify('Projet importé dans votre espace.') } catch { notify('Erreur : fichier .edicrea invalide.') } }}><FileUp size={15} /> Ouvrir un fichier .edicrea</FileButton>
        </div>
      </div>
      {templates.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-[15px] font-semibold">Partir d’un de mes modèles</h2>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">{templates.map((t) => (
            <button key={t.id} className="overflow-hidden rounded-lg border border-line bg-panel text-left hover:border-accent/60" onClick={async () => { await createProject('design', t.name.replace(' — modèle', '')); update((p) => { p.design = { width: t.width, height: t.height, unitsPerMm: 0, bleedMm: 0, json: t.json } }, { undoable: false }); await useStore.getState().saveNow(); await useStore.getState().openProject(useStore.getState().project!.id) }}>
              <div className="canvas-bg flex aspect-square items-center justify-center p-2">{t.thumb && <img src={t.thumb} className="paper-shadow max-h-full max-w-full" />}</div><div className="truncate border-t border-line px-2.5 py-2 text-[12px]">{t.name}</div>
            </button>
          ))}</div>
        </div>
      )}
    </div>
  )
}

export function ProjectList({ filter }: { filter: 'book' | 'poster' | 'cover' | 'design' | 'all' }) {
  const { index, go, openProject } = useStore()
  const [q, setQ] = useState('')
  const [client, setClient] = useState('')
  const [mode, setMode] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<'recent' | 'name' | 'created'>('recent')
  const list = index
    .filter((m) => (filter === 'all' || (filter === 'cover' ? m.kind === 'book' && m.thumb : m.kind === filter)) && (!q || m.name.toLowerCase().includes(q.toLowerCase())) && (!client || m.client === client))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'fr') : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt)
  const clients = [...new Set(index.map((m) => m.client).filter(Boolean))]
  const meta = { book: ['Mes livres', 'Romans, manuels, guides et publications en cours.'], poster: ['Mes affiches', 'Affiches et visuels pour l’impression et les réseaux.'], cover: ['Mes couvertures', 'Couvertures conçues à l’étape 5 de vos livres.'], design: ['Mes créations', 'Compositions libres du studio graphique.'], all: ['Tous les projets', 'L’ensemble de votre espace de travail.'] }[filter]
  return (
    <div className={wrap}>
      <PageHeader eyebrow="Espace de travail" title={meta[0]} subtitle={meta[1]} actions={<button className="btn-accent" onClick={() => go({ name: 'new' })}><Plus size={15} /> Nouveau</button>} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" /><input className="input !pl-8" placeholder="Rechercher un projet…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {clients.length > 0 && <select className="input !w-48" value={client} onChange={(e) => setClient(e.target.value)}><option value="">Tous les clients</option>{clients.map((c) => <option key={c}>{c}</option>)}</select>}
        <select className="input !w-48" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="recent">Modifiés récemment</option><option value="created">Créés récemment</option><option value="name">Nom (A → Z)</option></select>
        <div className="flex-1" />
        <span className="text-[12px] text-subtle">{list.length} projet(s)</span>
        <Seg value={mode} onChange={setMode} options={[{ v: 'grid', label: <LayoutGrid size={14} />, tip: 'Grille' }, { v: 'list', label: <List size={14} />, tip: 'Liste' }]} />
      </div>
      {!list.length ? <EmptyState icon={filter === 'poster' ? ImageIcon : filter === 'design' ? PenTool : BookOpen} title="Aucun projet" text={q ? 'Aucun résultat pour cette recherche.' : 'Créez votre premier projet pour le voir apparaître ici.'} action={<button className="btn-accent" onClick={() => go({ name: 'new' })}><Plus size={15} /> Nouveau projet</button>} />
        : mode === 'grid' ? <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{list.map((m) => <ProjectCard key={m.id} m={m} />)}</div>
          : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="bg-panel2 text-left text-[11px] uppercase tracking-wider text-subtle"><tr><th className="px-4 py-2.5 font-semibold">Nom</th><th className="px-4 py-2.5 font-semibold">Type</th><th className="px-4 py-2.5 font-semibold">Client</th><th className="px-4 py-2.5 font-semibold">Avancement</th><th className="px-4 py-2.5 font-semibold">Modifié</th><th /></tr></thead>
                <tbody className="divide-y divide-line">
                  {list.map((m) => { const K = KIND[m.kind]; return (
                    <tr key={m.id} className="cursor-pointer hover:bg-panel2" onClick={() => void openProject(m.id)}>
                      <td className="px-4 py-2"><div className="flex items-center gap-3"><div className="canvas-bg flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-line">{m.thumb ? <img src={m.thumb} className="max-h-full max-w-full" /> : <K.icon size={16} style={{ color: K.color }} />}</div><span className="font-medium">{m.name}</span></div></td>
                      <td className="px-4 py-2"><span className="chip"><K.icon size={11} style={{ color: K.color }} />{K.label}</span></td>
                      <td className="px-4 py-2 text-muted">{m.client || '—'}</td>
                      <td className="px-4 py-2 text-muted">{m.kind === 'book' ? `${m.step + 1}/6 · ${STEPS[m.step]?.label}` : '—'}</td>
                      <td className="px-4 py-2 text-muted">{ago(m.updatedAt)}</td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><ProjectMenu m={m} /></td>
                    </tr>
                  ) })}
                </tbody>
              </table>
            </div>
          )}
    </div>
  )
}

export function Templates() {
  const { templates, removeTemplate, createProject, update } = useStore()
  return (
    <div className={wrap}>
      <PageHeader eyebrow="Ressources" title="Mes modèles" subtitle="Enregistrez une création comme modèle depuis l’éditeur (bouton « Modèle »), puis réutilisez-la ici." />
      {templates.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          {templates.map((t) => (
            <div key={t.id} className="group overflow-hidden rounded-xl border border-line bg-panel" style={{ boxShadow: 'var(--shadow)' }}>
              <div className="canvas-bg flex aspect-square items-center justify-center p-3">{t.thumb && <img src={t.thumb} className="paper-shadow max-h-full max-w-full" />}</div>
              <div className="flex items-center gap-1 border-t border-line p-2.5">
                <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-medium">{t.name}</div><div className="text-[11px] text-subtle">{t.width} × {t.height}</div></div>
                <button className="btn !h-7 !px-2 text-[12px]" onClick={async () => { await createProject('design', t.name.replace(' — modèle', '')); update((p) => { p.design = { width: t.width, height: t.height, unitsPerMm: 0, bleedMm: 0, json: t.json } }, { undoable: false }); await useStore.getState().saveNow(); await useStore.getState().openProject(useStore.getState().project!.id) }}>Utiliser</button>
                <button className="btn-icon" onClick={() => removeTemplate(t.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={LayoutTemplate} title="Aucun modèle enregistré" text="Ouvrez une affiche ou une création, puis cliquez sur « Modèle » dans la barre d’outils de l’éditeur." />}
    </div>
  )
}

export function Library() {
  const { assets, addAsset, removeAsset, notify } = useStore()
  const [palette, setPalette] = useState({ name: '', colors: '#13294b, #1f4e8c, #e3b04b, #f7f5f0' })
  const [tab, setTab] = useState<'image' | 'logo' | 'font' | 'palette'>('image')
  const addFont = async (f: File) => {
    const name = f.name.replace(/\.(ttf|otf|woff2?)$/i, '')
    const data = await readAsDataURL(f)
    try { const ff = new FontFace(name, await f.arrayBuffer()); await ff.load(); document.fonts.add(ff); addAsset({ name, type: 'font', data }); notify(`Police « ${name} » importée et disponible dans l’éditeur.`) } catch { notify('Erreur : police illisible.') }
  }
  const list = assets.filter((a) => a.type === tab)
  const tabs = [{ v: 'image' as const, label: 'Photos et illustrations', icon: ImageIcon }, { v: 'logo' as const, label: 'Logos', icon: FileText }, { v: 'font' as const, label: 'Polices', icon: Type }, { v: 'palette' as const, label: 'Palettes', icon: Palette }]
  return (
    <div className={wrap}>
      <PageHeader eyebrow="Ressources" title="Bibliothèque" subtitle="Vos images, logos, polices et palettes, disponibles dans tous les projets."
        actions={<>
          {(tab === 'image' || tab === 'logo') && <FileButton accept="image/*" multiple className="btn-accent" onFiles={async (fs) => { for (const f of fs) addAsset({ name: f.name, type: tab, data: await readAsDataURL(f) }) }}><Upload size={15} /> Importer</FileButton>}
          {tab === 'font' && <FileButton accept=".ttf,.otf,.woff,.woff2" multiple className="btn-accent" onFiles={async (fs) => { for (const f of fs) await addFont(f) }}><Upload size={15} /> Importer des polices</FileButton>}
        </>} />
      <div className="mb-5 flex gap-1 border-b border-line">
        {tabs.map((t) => <button key={t.v} onClick={() => setTab(t.v)} className={`relative flex items-center gap-2 px-3 pb-2.5 pt-1 text-[13px] font-medium ${tab === t.v ? 'text-ink' : 'text-muted hover:text-ink'}`}><t.icon size={14} />{t.label}<span className="rounded-full bg-panel3 px-1.5 text-[10.5px] tabular-nums text-muted">{assets.filter((a) => a.type === t.v).length}</span>{tab === t.v && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-accent" />}</button>)}
      </div>
      {tab === 'palette' && (
        <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
          <Field label="Nom de la palette"><input className="input" value={palette.name} onChange={(e) => setPalette({ ...palette, name: e.target.value })} /></Field>
          <Field label="Couleurs (hexadécimal, séparées par des virgules)" className="min-w-64 flex-1"><input className="input font-mono" value={palette.colors} onChange={(e) => setPalette({ ...palette, colors: e.target.value })} /></Field>
          <div className="flex h-8 overflow-hidden rounded-md border border-line">{(palette.colors.match(/#[0-9a-f]{3,6}/gi) || []).map((c, i) => <span key={i} className="w-8" style={{ background: c }} />)}</div>
          <button className="btn-accent" onClick={() => { const cs = palette.colors.match(/#[0-9a-f]{3,6}/gi) || []; if (cs.length) addAsset({ name: palette.name || 'Palette', type: 'palette', data: JSON.stringify(cs) }) }}>Enregistrer</button>
        </div>
      )}
      {list.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          {list.map((a) => (
            <div key={a.id} className="group overflow-hidden rounded-xl border border-line bg-panel" style={{ boxShadow: 'var(--shadow)' }}>
              {a.type === 'palette' ? <div className="flex h-28">{(JSON.parse(a.data) as string[]).map((c) => <div key={c} className="flex flex-1 items-end justify-center pb-1.5 font-mono text-[9px] text-white/80" style={{ background: c }}>{c}</div>)}</div>
                : a.type === 'font' ? <div className="flex h-28 flex-col items-center justify-center bg-panel2"><span className="text-[34px] leading-none" style={{ fontFamily: a.name }}>Aa</span><span className="mt-1 text-[11px] text-subtle" style={{ fontFamily: a.name }}>Portez ce vieux whisky</span></div>
                  : <div className="canvas-bg flex aspect-square items-center justify-center p-2"><img src={a.data} className="max-h-full max-w-full object-contain" /></div>}
              <div className="flex items-center gap-1 border-t border-line px-2.5 py-2"><span className="min-w-0 flex-1 truncate text-[12px]">{a.name}</span>
                <button className="btn-icon opacity-0 group-hover:opacity-100" onClick={() => removeAsset(a.id)}><Trash2 size={13} /></button></div>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={tab === 'font' ? Type : tab === 'palette' ? Palette : ImageIcon} title="Rien ici pour l’instant" text="Les images ajoutées dans l’éditeur sont aussi enregistrées automatiquement dans la bibliothèque." />}
    </div>
  )
}

export function History() {
  const { history, openProject, index } = useStore()
  const days = new Map<string, typeof history>()
  history.forEach((h) => { const d = new Date(h.at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); days.set(d, [...(days.get(d) || []), h]) })
  return (
    <div className={`${wrap} !max-w-4xl`}>
      <PageHeader eyebrow="Ressources" title="Historique" subtitle="Toutes les actions réalisées sur vos projets." />
      {history.length ? [...days.entries()].map(([d, items]) => (
        <section key={d} className="mb-6">
          <div className="eyebrow mb-2">{d}</div>
          <div className="card divide-y divide-line">
            {items.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="w-12 shrink-0 tabular-nums text-subtle">{new Date(h.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="flex-1">{h.text}</span>
                {h.projectId && index.some((m) => m.id === h.projectId) && <button className="btn-ghost text-[12px] text-muted" onClick={() => void openProject(h.projectId!)}><ExternalLink size={13} /> Ouvrir</button>}
              </div>
            ))}
          </div>
        </section>
      )) : <EmptyState icon={HistoryIcon} title="Aucune activité" />}
    </div>
  )
}

export function Settings() {
  const { settings, setSettings, notify, index, assets, templates } = useStore()
  const [key, setKey] = useState(settings.apiKey)
  const [show, setShow] = useState(false)
  const [sec, setSec] = useState<'general' | 'ai' | 'images' | 'data'>('general')
  useEffect(() => { const h = (e: Event) => setSec((e as CustomEvent).detail); window.addEventListener('edicrea:settings', h); return () => window.removeEventListener('edicrea:settings', h) }, [])
  const nav = [{ v: 'general' as const, label: 'Général', icon: Monitor }, { v: 'ai' as const, label: 'Intelligence artificielle', icon: Cpu }, { v: 'images' as const, label: 'Génération d’images', icon: ImageIcon }, { v: 'data' as const, label: 'Données et confidentialité', icon: Database }]
  return (
    <div className={`${wrap} !max-w-5xl`}>
      <PageHeader eyebrow="Compte" title="Paramètres" />
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <nav className="space-y-px">{nav.map((n) => <button key={n.v} onClick={() => setSec(n.v)} className={`flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-[13px] ${sec === n.v ? 'bg-panel3 font-medium' : 'text-muted hover:bg-panel2 hover:text-ink'}`}><n.icon size={15} />{n.label}</button>)}</nav>
        <div className="space-y-5">
          {sec === 'general' && (
            <div className="card divide-y divide-line">
              <div className="p-5"><h3 className="font-semibold">Apparence</h3><p className="mt-0.5 text-[12.5px] text-muted">Thème de l’interface.</p>
                <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
                  {(['dark', 'light'] as const).map((t) => (
                    <button key={t} onClick={() => setSettings({ theme: t })} className={`overflow-hidden rounded-lg border text-left ${settings.theme === t ? 'border-accent ring-2 ring-accent/25' : 'border-line'}`}>
                      <div className={`flex h-20 gap-1.5 p-2 ${t === 'dark' ? 'bg-[#0c0e11]' : 'bg-[#e9e7e1]'}`}><div className={`w-1/4 rounded ${t === 'dark' ? 'bg-[#181c21]' : 'bg-white'}`} /><div className="flex flex-1 flex-col gap-1.5"><div className={`h-3 rounded ${t === 'dark' ? 'bg-[#20252b]' : 'bg-white'}`} /><div className={`flex-1 rounded ${t === 'dark' ? 'bg-[#181c21]' : 'bg-white'}`} /></div></div>
                      <div className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium">{t === 'dark' ? <Moon size={13} /> : <Sun size={13} />}{t === 'dark' ? 'Sombre' : 'Clair'}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-5"><h3 className="font-semibold">Profil</h3><p className="mt-0.5 text-[12.5px] text-muted">Nom affiché sur les commentaires et les versions.</p>
                <div className="mt-3 max-w-sm"><input className="input" value={settings.userName} onChange={(e) => setSettings({ userName: e.target.value })} /></div>
              </div>
            </div>
          )}
          {sec === 'ai' && (
            <div className="card divide-y divide-line">
              <div className="flex items-start gap-3 p-5">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${aiReady() ? 'bg-ok/15 text-ok' : 'bg-accent-soft text-accent'}`}><Sparkles size={17} /></span>
                <div className="flex-1"><h3 className="font-semibold">Claude par Anthropic</h3><p className="mt-0.5 text-[12.5px] text-muted">Correction, révision éditoriale, direction artistique, illustrations vectorielles, OCR et assistant. La clé reste dans ce navigateur et n’est envoyée qu’à l’API.</p></div>
                <span className={`chip ${aiReady() ? '!text-ok' : ''}`}>{aiReady() ? <><Check size={11} /> Active</> : 'Inactive'}</span>
              </div>
              <div className="space-y-4 p-5">
                <Field label="Clé API Anthropic" hint="Créez une clé sur console.anthropic.com.">
                  <div className="flex gap-2"><input className="input font-mono" type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" /><button className="btn" onClick={() => setShow(!show)}>{show ? 'Masquer' : 'Afficher'}</button><button className="btn-accent" onClick={() => { setSettings({ apiKey: key.trim() }); notify(key.trim() ? 'Clé enregistrée : l’IA est activée.' : 'Clé supprimée.') }}>Enregistrer</button></div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Modèle"><select className="input" value={settings.model} onChange={(e) => setSettings({ model: e.target.value })}><option value="claude-opus-5-5">Claude Opus 5.5 — recommandé</option><option value="claude-sonnet-5-5">Claude Sonnet 5.5 — plus rapide</option><option value="claude-haiku-5-5">Claude Haiku 5.5 — économique</option></select></Field>
                  <div><span className="label">Effort de réflexion</span><Seg value={settings.effort} onChange={(v) => setSettings({ effort: v })} className="flex w-full" options={[{ v: 'low', label: 'Rapide' }, { v: 'medium', label: 'Équilibré' }, { v: 'high', label: 'Approfondi' }]} /></div>
                </div>
                <Field label="URL de l’API" hint="Facultatif : proxy d’entreprise ou futur backend EDICREA."><input className="input font-mono" value={settings.apiBase} placeholder="https://api.anthropic.com" onChange={(e) => setSettings({ apiBase: e.target.value.trim() })} /></Field>
              </div>
            </div>
          )}
          {sec === 'images' && <ImageSettings />}
          {sec === 'data' && (
            <div className="card divide-y divide-line">
              <div className="flex items-start gap-3 p-5"><Shield size={18} className="mt-0.5 text-accent" /><div><h3 className="font-semibold">Stockage local</h3><p className="mt-0.5 text-[12.5px] text-muted">Projets, modèles et ressources sont enregistrés automatiquement dans ce navigateur (IndexedDB). Rien n’est envoyé à un serveur, hormis les requêtes IA si vous les activez.</p></div></div>
              <div className="grid grid-cols-3 divide-x divide-line">{([['Projets', index.length], ['Modèles', templates.length], ['Ressources', assets.length]] as const).map(([l, v]) => <div key={l} className="p-5"><div className="text-[22px] font-semibold tabular-nums">{v}</div><div className="text-[12px] text-muted">{l}</div></div>)}</div>
              <div className="p-5 text-[12.5px] text-muted">Pour sauvegarder ou transmettre un projet, exportez-le au format <code className="rounded bg-panel3 px-1">.edicrea</code> (étape Finaliser), puis rouvrez-le via « Nouveau projet ».</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ImageSettings() {
  const { settings, setSettings, notify } = useStore()
  const [g, setG] = useState(settings.geminiKey)
  const [o, setO] = useState(settings.openaiKey)
  const [test, setTest] = useState<{ img?: string; busy?: string; err?: string }>({})
  const run = async (provider: 'gemini' | 'openai') => {
    setTest({ busy: provider === 'gemini' ? 'Nano Banana' : 'GPT Image' })
    try { const [img] = await generateImages({ prompt: 'Une petite plume de calligraphie dorée posée sur une feuille de papier crème, lumière douce, style illustration éditoriale, aucun texte.', aspect: '1:1', n: 1, provider }); setTest({ img }) } catch (e) { setTest({ err: (e as Error).message }) }
  }
  const Row = ({ id, name, by, url, keyVal, setKey, models, model, onModel, hint }: { id: 'gemini' | 'openai'; name: string; by: string; url: string; keyVal: string; setKey: (v: string) => void; models: { id: string; label: string }[]; model: string; onModel: (v: string) => void; hint: string }) => {
    const saved = id === 'gemini' ? settings.geminiKey : settings.openaiKey
    return (
      <div className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${id === 'gemini' ? 'bg-[#4285f4]/15 text-[#4285f4]' : 'bg-ok/15 text-ok'}`}>{id === 'gemini' ? 'G' : 'AI'}</span>
          <div className="min-w-0 flex-1"><h3 className="font-semibold">{name}</h3><p className="text-[12.5px] text-muted">{by} · {hint}</p></div>
          {saved ? <span className="chip !text-ok"><Check size={11} /> Configuré</span> : <span className="chip">Non configuré</span>}
        </div>
        <Field label="Clé API" hint={`Obtenez une clé sur ${url}`}>
          <div className="flex gap-2"><input className="input font-mono" type="password" value={keyVal} onChange={(e) => setKey(e.target.value)} placeholder={id === 'gemini' ? 'AIza…' : 'sk-…'} />
            <button className="btn-accent" onClick={() => { setSettings(id === 'gemini' ? { geminiKey: keyVal.trim(), imageProvider: keyVal.trim() ? 'gemini' : settings.imageProvider } : { openaiKey: keyVal.trim(), imageProvider: keyVal.trim() && !settings.geminiKey ? 'openai' : settings.imageProvider }); notify(keyVal.trim() ? `${name} activé.` : 'Clé supprimée.') }}>Enregistrer</button></div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Modèle">
            <div className="flex gap-2">
              <select className="input" value={models.some((m) => m.id === model) ? model : '__custom'} onChange={(e) => e.target.value !== '__custom' && onModel(e.target.value)}>{models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}<option value="__custom">Autre modèle…</option></select>
              <input className="input !w-48 font-mono !text-[12px]" value={model} onChange={(e) => onModel(e.target.value.trim())} />
            </div>
          </Field>
          <div className="flex items-end"><button className="btn w-full" disabled={!saved || !!test.busy} onClick={() => void run(id)}><Sparkles size={14} /> Tester</button></div>
        </div>
      </div>
    )
  }
  return (
    <div className="card divide-y divide-line">
      <div className="flex items-start gap-3 p-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent"><ImageIcon size={17} /></span>
        <div className="flex-1"><h3 className="font-semibold">Génération d’images par IA</h3><p className="mt-0.5 text-[12.5px] text-muted">Illustrations de couverture, visuels d’affiche, images pour vos livres et retouche par description. Les clés restent dans ce navigateur et ne sont envoyées qu’au fournisseur choisi, qui facture la génération sur votre compte.</p></div>
      </div>
      <div className="p-5">
        <span className="label">Générateur utilisé par défaut</span>
        <Seg className="flex w-full max-w-sm" value={settings.imageProvider} onChange={(v) => setSettings({ imageProvider: v })} options={[{ v: 'gemini', label: 'Nano Banana (Google)' }, { v: 'openai', label: 'GPT Image (OpenAI)' }]} />
      </div>
      {Row({ id: 'gemini', name: 'Nano Banana', by: 'Google Gemini', url: 'aistudio.google.com/apikey', keyVal: g, setKey: setG, models: GEMINI_MODELS, model: settings.geminiModel, onModel: (v) => setSettings({ geminiModel: v }), hint: 'excellent pour retoucher une image et garder un même personnage' })}
      {Row({ id: 'openai', name: 'GPT Image', by: 'OpenAI', url: 'platform.openai.com/api-keys', keyVal: o, setKey: setO, models: OPENAI_MODELS, model: settings.openaiModel, onModel: (v) => setSettings({ openaiModel: v }), hint: 'très fidèle aux consignes détaillées' })}
      <div className="p-5">
        <span className="label">Qualité (GPT Image)</span>
        <Seg className="flex w-full max-w-sm" value={settings.imageQuality} onChange={(v) => setSettings({ imageQuality: v })} options={[{ v: 'low', label: 'Brouillon' }, { v: 'medium', label: 'Standard' }, { v: 'high', label: 'Haute' }]} />
      </div>
      {(test.busy || test.img || test.err) && (
        <div className="flex items-center gap-4 p-5">
          {test.busy && <span className="text-[12.5px] text-muted">Test de {test.busy} en cours…</span>}
          {test.img && <><img src={test.img} className="h-24 w-24 rounded-lg border border-line object-cover" /><span className="flex items-center gap-2 text-[13px] text-ok"><Check size={15} /> La génération d’images fonctionne.</span></>}
          {test.err && <span className="text-[12.5px] text-danger">{test.err}</span>}
        </div>
      )}
    </div>
  )
}
