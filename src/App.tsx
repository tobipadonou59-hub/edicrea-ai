import { useEffect, useState } from 'react'
import { LayoutDashboard, Plus, BookOpen, Image as ImageIcon, BookMarked, PenTool, LayoutTemplate, FolderOpen, Bot, Settings as Cog, History as HistoryIcon, Moon, Sun, Undo2, Redo2, GitBranch, MessageSquare, ChevronRight, Check, Search, Sparkles, CircleAlert, Info, X, PanelLeftClose, PanelLeftOpen, Loader2, Menu as MenuIcon, Download } from 'lucide-react'
import { useStore, type View } from './lib/store'
import { Dashboard, NewProject, ProjectList, Templates, Library, History, Settings } from './components/pages'
import BookWorkflow from './components/book/BookWorkflow'
import PosterStudio from './components/poster/PosterStudio'
import GraphicEditor from './components/editor/GraphicEditor'
import Assistant from './components/Assistant'
import CommandPalette from './components/CommandPalette'
import InstallDialog from './components/InstallDialog'
import { useInstall } from './lib/pwa'
import { diffWords } from './lib/corrector'
import { uid } from './lib/defaults'
import { aiReady } from './lib/ai'
import type { Block } from './lib/types'

const NAV: { group: string; items: { v: View; label: string; icon: typeof BookOpen; count?: (k: string[]) => number }[] }[] = [
  { group: 'Espace de travail', items: [
    { v: { name: 'dashboard' }, label: 'Tableau de bord', icon: LayoutDashboard },
    { v: { name: 'list', filter: 'book' }, label: 'Mes livres', icon: BookOpen, count: (k) => k.filter((x) => x === 'book').length },
    { v: { name: 'list', filter: 'poster' }, label: 'Mes affiches', icon: ImageIcon, count: (k) => k.filter((x) => x === 'poster').length },
    { v: { name: 'list', filter: 'cover' }, label: 'Mes couvertures', icon: BookMarked },
    { v: { name: 'list', filter: 'design' }, label: 'Mes créations', icon: PenTool, count: (k) => k.filter((x) => x === 'design').length },
  ] },
  { group: 'Ressources', items: [
    { v: { name: 'templates' }, label: 'Mes modèles', icon: LayoutTemplate },
    { v: { name: 'library' }, label: 'Bibliothèque', icon: FolderOpen },
    { v: { name: 'history' }, label: 'Historique', icon: HistoryIcon },
  ] },
]

const KIND_LABEL = { book: 'Livres', poster: 'Affiches', design: 'Créations' } as const
const KIND_ICON = { book: BookOpen, poster: ImageIcon, design: PenTool } as const

export default function App() {
  const s = useStore()
  const [palette, setPalette] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [install, setInstall] = useState(false)
  const inst = useInstall()
  useEffect(() => { setDrawer(false) }, [s.view])
  useEffect(() => {
    if (!s.ready) return
    const q = new URLSearchParams(location.search).get('new')
    if (q === 'book' || q === 'poster' || q === 'design') { history.replaceState(null, '', '/'); void s.createProject(q, q === 'book' ? 'Nouveau livre' : q === 'poster' ? 'Nouvelle affiche' : 'Nouvelle création') }
  }, [s.ready]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void s.init() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.documentElement.classList.toggle('dark', s.settings.theme === 'dark'); document.documentElement.dataset.theme = s.settings.theme }, [s.settings.theme])
  useEffect(() => { s.assets.filter((a) => a.type === 'font').forEach((a) => { if (![...document.fonts].some((f) => f.family === a.name)) { const ff = new FontFace(a.name, `url(${a.data})`); void ff.load().then(() => document.fonts.add(ff)).catch(() => null) } }) }, [s.assets])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); useStore.getState().setAssistant(!useStore.getState().assistantOpen) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const inProject = s.view.name === 'project' && s.project
  const rail = !drawer && (collapsed || !!inProject)
  const same = (a: View, b: View) => a.name === b.name && (a.name !== 'list' || (b.name === 'list' && a.filter === b.filter))
  const kinds = s.index.map((m) => m.kind)

  if (!s.ready) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
      <Logo /><Loader2 size={18} className="animate-spin" />
    </div>
  )

  return (
    <div className="flex h-full">
      {drawer && <div className="anim-fade fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setDrawer(false)} />}
      <aside className={`flex shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-200 ${rail ? 'w-[56px]' : 'w-[236px]'} ${drawer ? 'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[272px] max-md:pt-[env(safe-area-inset-top)] max-md:shadow-2xl' : 'max-md:hidden'}`}>
        <div className={`flex h-14 shrink-0 items-center ${rail ? 'justify-center' : 'justify-between px-4'}`}>
          <button onClick={() => s.go({ name: 'dashboard' })} className="flex items-center gap-2.5"><Logo small={rail} /></button>
          {!rail && <button className="btn-icon" data-tip="Réduire" onClick={() => (drawer ? setDrawer(false) : setCollapsed(true))}>{drawer ? <X size={16} /> : <PanelLeftClose size={16} />}</button>}
        </div>
        <div className={`space-y-2 pb-3 ${rail ? 'px-2' : 'px-3'}`}>
          <button onClick={() => s.go({ name: 'new' })} data-tip={rail ? 'Nouveau projet' : undefined} data-tip-side="right" className={`btn-accent w-full ${rail ? '!px-0' : ''}`}><Plus size={16} />{!rail && 'Nouveau projet'}</button>
          <button onClick={() => setPalette(true)} data-tip={rail ? 'Rechercher (Ctrl K)' : undefined} data-tip-side="right" className={`flex h-8 w-full items-center gap-2 rounded-md border border-line bg-panel2 text-[12.5px] text-subtle hover:border-line2 ${rail ? 'justify-center' : 'px-2.5'}`}>
            <Search size={14} />{!rail && <><span className="flex-1 text-left">Rechercher…</span><span className="kbd">Ctrl K</span></>}
          </button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 pt-1">
          {NAV.map((g) => (
            <div key={g.group}>
              {!rail && <div className="eyebrow px-2.5 pb-1.5">{g.group}</div>}
              <div className="space-y-px">
                {g.items.map((n) => {
                  const on = same(s.view, n.v)
                  return (
                    <button key={n.label} data-tip={rail ? n.label : undefined} data-tip-side="right" onClick={() => s.go(n.v)}
                      className={`relative flex h-8 w-full items-center gap-2.5 rounded-md text-[13px] transition-colors ${rail ? 'justify-center' : 'px-2.5'} ${on ? 'bg-panel3 font-medium text-ink' : 'text-muted hover:bg-panel2 hover:text-ink'}`}>
                      {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent" />}
                      <n.icon size={16} className={`shrink-0 ${on ? 'text-accent' : ''}`} />
                      {!rail && <><span className="flex-1 text-left">{n.label}</span>{n.count && n.count(kinds) > 0 && <span className="text-[11px] tabular-nums text-subtle">{n.count(kinds)}</span>}</>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className={`space-y-1 border-t border-line py-2 ${rail ? 'px-2' : 'px-2'}`}>
          {!rail && (
            <button onClick={() => s.go({ name: 'settings' })} className="mx-0.5 mb-2 flex w-[calc(100%-4px)] items-center gap-2.5 rounded-lg border border-line bg-panel2 p-2.5 text-left hover:border-line2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-md ${aiReady() ? 'bg-ok/15 text-ok' : 'bg-accent-soft text-accent'}`}><Sparkles size={14} /></span>
              <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{aiReady() ? 'IA Claude active' : 'Activer l’IA'}</span><span className="block truncate text-[11px] text-subtle">{aiReady() ? s.settings.model : 'Ajoutez votre clé API'}</span></span>
            </button>
          )}
          <SideBtn rail={rail} icon={Bot} label="Assistant IA" kbd="Ctrl J" on={s.assistantOpen} onClick={() => s.setAssistant(!s.assistantOpen)} />
          <SideBtn rail={rail} icon={s.settings.theme === 'dark' ? Sun : Moon} label={s.settings.theme === 'dark' ? 'Mode clair' : 'Mode sombre'} onClick={() => s.setSettings({ theme: s.settings.theme === 'dark' ? 'light' : 'dark' })} />
          {!inst.installed && <SideBtn rail={rail} icon={Download} label="Installer l’application" onClick={() => setInstall(true)} />}
          <SideBtn rail={rail} icon={Cog} label="Paramètres" on={s.view.name === 'settings'} onClick={() => s.go({ name: 'settings' })} />
          {collapsed && !inProject && <SideBtn rail icon={PanelLeftOpen} label="Déplier" onClick={() => setCollapsed(false)} />}
          {!rail && (
            <div className="mt-1 flex items-center gap-2.5 border-t border-line px-1.5 pt-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#8a6a33] text-[11px] font-bold text-accent-ink">{(s.settings.userName || 'M').slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-medium">{s.settings.userName || 'Moi'}</span><span className="block text-[11px] text-subtle">Espace personnel</span></span>
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 pt-[env(safe-area-inset-top)] box-content md:hidden">
          <button className="btn-icon !h-9 !w-9" aria-label="Menu" onClick={() => setDrawer(true)}><MenuIcon size={19} /></button>
          <button onClick={() => s.go({ name: 'dashboard' })}><Logo /></button>
          <div className="flex-1" />
          <button className="btn-icon !h-9 !w-9" aria-label="Rechercher" onClick={() => setPalette(true)}><Search size={17} /></button>
          <button className={`btn-icon !h-9 !w-9 ${s.assistantOpen ? 'on' : ''}`} aria-label="Assistant IA" onClick={() => s.setAssistant(!s.assistantOpen)}><Sparkles size={17} /></button>
          <button className="btn-accent !h-9 !w-9 !px-0" aria-label="Nouveau projet" onClick={() => s.go({ name: 'new' })}><Plus size={17} /></button>
        </div>
        {inProject ? <ProjectView /> : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {s.view.name === 'dashboard' && <Dashboard />}
            {s.view.name === 'new' && <NewProject />}
            {s.view.name === 'list' && <ProjectList filter={s.view.filter} />}
            {s.view.name === 'templates' && <Templates />}
            {s.view.name === 'library' && <Library />}
            {s.view.name === 'history' && <History />}
            {s.view.name === 'settings' && <Settings />}
          </div>
        )}
      </main>
      <Assistant />
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {install && <InstallDialog onClose={() => setInstall(false)} />}
      {s.toast && <Toast text={s.toast} onClose={() => useStore.setState({ toast: null })} />}
    </div>
  )
}

function Logo({ small }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#e9c98a] via-accent to-[#8d6a2f] shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_2px_6px_rgba(0,0,0,.25)]">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#1a150c" strokeWidth="2.2" strokeLinecap="round"><path d="M6 5h11M6 12h8M6 19h11M6 5v14" /><circle cx="18.5" cy="12" r="1.6" fill="#1a150c" stroke="none" /></svg>
      </span>
      {!small && <span className="leading-none"><span className="block text-[14px] font-bold tracking-[0.04em]">EDICREA</span><span className="block text-[9.5px] font-semibold tracking-[0.28em] text-accent">STUDIO · AI</span></span>}
    </span>
  )
}

function SideBtn({ rail, icon: Icon, label, onClick, on, kbd }: { rail: boolean; icon: typeof Bot; label: string; onClick: () => void; on?: boolean; kbd?: string }) {
  return (
    <button data-tip={rail ? label : undefined} data-tip-side="right" onClick={onClick} className={`flex h-8 w-full items-center gap-2.5 rounded-md text-[13px] transition-colors ${rail ? 'justify-center' : 'px-2.5'} ${on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-panel2 hover:text-ink'}`}>
      <Icon size={16} className="shrink-0" />{!rail && <><span className="flex-1 text-left">{label}</span>{kbd && <span className="kbd">{kbd}</span>}</>}
    </button>
  )
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  const warn = /erreur|⚠|invalide|impossible|nécessite|configurez/i.test(text)
  const Icon = warn ? CircleAlert : /✓|enregistr|générée|import|appliqu|restaur/i.test(text) ? Check : Info
  return (
    <div className="anim-pop fixed bottom-[max(20px,env(safe-area-inset-bottom))] left-4 right-4 z-[60] flex md:left-auto md:right-5 md:max-w-md items-start gap-3 rounded-lg border border-line bg-panel py-3 pl-3 pr-2 text-[13px]" style={{ boxShadow: 'var(--shadow-lg)' }}>
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${warn ? 'bg-warn/15 text-warn' : 'bg-ok/15 text-ok'}`}><Icon size={12} strokeWidth={3} /></span>
      <span className="flex-1 leading-snug">{text}</span>
      <button className="btn-icon !h-6 !w-6" onClick={onClose}><X size={13} /></button>
    </div>
  )
}

function ProjectView() {
  const { project, update, undo, redo, past, future, saving, go, snapshot, restoreVersion, settings, setAssistant, assistantOpen } = useStore()
  const [panel, setPanel] = useState<'versions' | 'comments' | null>(null)
  const [cmp, setCmp] = useState<string | null>(null)
  const [text, setText] = useState('')
  const p = project!
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('.canvas-container')) return
      if (p.kind !== 'book') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [p.kind, undo, redo])

  const version = p.versions.find((v) => v.id === cmp)
  const vBlocks: Block[] = version ? JSON.parse(version.data).book?.blocks || [] : []
  const KI = KIND_ICON[p.kind]
  const openComments = p.comments.filter((c) => !c.resolved).length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel px-2 md:gap-2 md:px-3">
        <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted hover:bg-panel3 hover:text-ink" onClick={() => go({ name: 'list', filter: p.kind === 'book' ? 'book' : p.kind === 'poster' ? 'poster' : 'design' })}>
          <KI size={14} /><span className="max-sm:hidden">{KIND_LABEL[p.kind]}</span>
        </button>
        <ChevronRight size={14} className="text-subtle max-sm:hidden" />
        <input className="h-8 min-w-0 max-w-sm flex-1 rounded-md bg-transparent px-2 text-[14px] font-semibold outline-none hover:bg-panel2 focus:bg-panel2 focus:ring-1 focus:ring-line2" value={p.name} onChange={(e) => update((pp) => { pp.name = e.target.value }, { undoable: false })} />
        {p.client && <span className="chip max-lg:hidden">{p.client}</span>}
        <span className={`chip !h-[22px] max-sm:!px-1.5 ${saving ? '' : '!text-ok'}`}>{saving ? <><Loader2 size={11} className="animate-spin" /><span className="max-sm:hidden"> Enregistrement</span></> : <><Check size={11} strokeWidth={3} /><span className="max-sm:hidden"> Enregistré</span></>}</span>
        <div className="flex-1" />
        {p.kind === 'book' && <>
          <button className="btn-icon" data-tip="Annuler (Ctrl Z)" disabled={!past.length} onClick={undo}><Undo2 size={16} /></button>
          <button className="btn-icon" data-tip="Rétablir (Ctrl Y)" disabled={!future.length} onClick={redo}><Redo2 size={16} /></button>
          <span className="divider-v" />
        </>}
        <button className={`btn-ghost ${panel === 'versions' ? '!bg-panel3' : ''}`} onClick={() => setPanel(panel === 'versions' ? null : 'versions')}><GitBranch size={15} /><span className="max-md:hidden">Versions</span> <span className="text-[11px] tabular-nums text-subtle">{p.versions.length}</span></button>
        <button className={`btn-ghost ${panel === 'comments' ? '!bg-panel3' : ''}`} onClick={() => setPanel(panel === 'comments' ? null : 'comments')}><MessageSquare size={15} /><span className="max-md:hidden">Commentaires</span> {openComments > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-ink">{openComments}</span>}</button>
        <span className="divider-v max-md:hidden" />
        <button className={`btn max-md:hidden ${assistantOpen ? '!border-accent/50 !bg-accent-soft !text-accent' : ''}`} onClick={() => setAssistant(!assistantOpen)}><Sparkles size={14} /> Assistant</button>
        <span className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br max-md:hidden from-accent to-[#8a6a33] text-[11px] font-bold text-accent-ink" data-tip={settings.userName}>{(settings.userName || 'M').slice(0, 1).toUpperCase()}</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {p.kind === 'book' && <BookWorkflow />}
          {p.kind === 'poster' && <PosterStudio />}
          {p.kind === 'design' && p.design && <GraphicEditor key={p.id} doc={p.design} name={p.name} kind="design" onSave={(json, thumb, doc) => update((pp) => { pp.design = { ...doc, json }; if (thumb) pp.thumb = thumb }, { undoable: false })} />}
        </div>
        {panel && (
          <div className="anim-fade flex w-80 shrink-0 flex-col border-l border-line bg-panel max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:pt-[env(safe-area-inset-top)]">
            <div className="panel-title justify-between">{panel === 'versions' ? <span className="flex items-center gap-2"><GitBranch size={14} /> Historique des versions</span> : <span className="flex items-center gap-2"><MessageSquare size={14} /> Commentaires</span>}<button className="btn-icon" onClick={() => setPanel(null)}><X size={14} /></button></div>
            {panel === 'versions' ? (
              <>
                <form className="flex gap-1.5 border-b border-line p-3" onSubmit={(e) => { e.preventDefault(); snapshot(text || 'Version du ' + new Date().toLocaleString('fr-FR')); setText('') }}>
                  <input className="input" placeholder="Nommer cette version…" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn-accent">Créer</button>
                </form>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  <div className="relative ml-3 border-l border-line pl-4">
                    {p.versions.map((v, i) => (
                      <div key={v.id} className={`relative mb-2 rounded-lg p-2.5 ${cmp === v.id ? 'bg-accent-soft' : 'hover:bg-panel2'}`}>
                        <span className={`absolute -left-[21px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-panel ${i === 0 ? 'bg-accent' : 'bg-line2'}`} />
                        <div className="text-[13px] font-medium">{v.label}</div>
                        <div className="text-[11px] text-subtle">{new Date(v.at).toLocaleString('fr-FR')}</div>
                        <div className="mt-2 flex gap-1">
                          <button className="btn !h-7 !px-2 text-[12px]" onClick={() => { if (confirm('Restaurer cette version ? L’état actuel sera enregistré comme version.')) restoreVersion(v.id) }}>Restaurer</button>
                          {p.kind === 'book' && <button className="btn !h-7 !px-2 text-[12px]" onClick={() => setCmp(cmp === v.id ? null : v.id)}>{cmp === v.id ? 'Masquer' : 'Comparer'}</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {!p.versions.length && <p className="p-3 text-[12.5px] text-muted">Aucune version. Des points de restauration sont aussi créés automatiquement avant les opérations importantes.</p>}
                  {version && p.book && (
                    <div className="space-y-2 p-2 text-[12px]" style={{ fontFamily: 'EdSerif, Georgia, serif' }}>
                      <div className="eyebrow font-sans">Différences avec « {version.label} »</div>
                      {p.book.blocks.map((b) => { const o = vBlocks.find((x) => x.id === b.id); if (o?.text === b.text) return null; return <div key={b.id} className="rounded-md border border-line bg-panel2 p-2">{o ? diffWords(o.text, b.text).map((d, i) => d.t === 'eq' ? <span key={i}>{d.s.length > 80 ? '…' + d.s.slice(-40) : d.s}</span> : d.t === 'ins' ? <ins key={i} className="diff">{d.s}</ins> : <del key={i} className="diff">{d.s}</del>) : <ins className="diff">{b.text.slice(0, 200)}</ins>}</div> })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <form className="border-b border-line p-3" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; update((pp) => { pp.comments.unshift({ id: uid(), author: settings.userName, text, at: Date.now(), resolved: false }) }, { undoable: false }); setText('') }}>
                  <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ajouter un commentaire pour l’équipe…" />
                  <div className="mt-2 flex justify-end"><button className="btn-accent">Publier</button></div>
                </form>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {p.comments.map((c) => (
                    <div key={c.id} className={`flex gap-2.5 border-b border-line p-3 ${c.resolved ? 'opacity-50' : ''}`}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel3 text-[10px] font-bold">{c.author.slice(0, 1).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2"><b className="text-[12.5px]">{c.author}</b><span className="text-[11px] text-subtle">{new Date(c.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
                        <p className="mt-0.5 text-[13px]">{c.text}</p>
                        <button className="mt-1 text-[11.5px] font-medium text-accent hover:underline" onClick={() => update((pp) => { const x = pp.comments.find((y) => y.id === c.id); if (x) x.resolved = !x.resolved }, { undoable: false })}>{c.resolved ? 'Rouvrir' : 'Marquer comme résolu'}</button>
                      </div>
                    </div>
                  ))}
                  {p.book?.blocks.filter((b) => b.comment).map((b) => <div key={b.id} className="border-b border-line p-3"><div className="eyebrow">Annotation</div><div className="mt-1 truncate text-[11.5px] text-muted">« {b.text.slice(0, 50)}… »</div><p className="mt-1 text-[13px]">{b.comment}</p></div>)}
                  {!p.comments.length && !p.book?.blocks.some((b) => b.comment) && <p className="p-4 text-center text-[12.5px] text-muted">Aucun commentaire.</p>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
