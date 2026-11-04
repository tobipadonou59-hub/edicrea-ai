import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, LayoutDashboard, Plus, BookOpen, Image as ImageIcon, PenTool, BookMarked, LayoutTemplate, FolderOpen, History, Settings, Bot, Moon, FileText, CornerDownLeft, type LucideIcon } from 'lucide-react'
import { useStore } from '../lib/store'
import { STEPS } from './book/steps'

interface Cmd { id: string; label: string; group: string; icon: LucideIcon; hint?: string; run: () => void }

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const s = useStore()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const cmds = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: 'new-book', label: 'Nouveau livre', group: 'Créer', icon: BookOpen, run: () => void s.createProject('book', 'Nouveau livre') },
      { id: 'new-poster', label: 'Nouvelle affiche', group: 'Créer', icon: ImageIcon, run: () => void s.createProject('poster', 'Nouvelle affiche') },
      { id: 'new-design', label: 'Nouvelle création graphique', group: 'Créer', icon: PenTool, run: () => void s.createProject('design', 'Nouvelle création') },
      { id: 'new', label: 'Nouveau projet…', group: 'Créer', icon: Plus, run: () => s.go({ name: 'new' }) },
      { id: 'dash', label: 'Tableau de bord', group: 'Aller à', icon: LayoutDashboard, run: () => s.go({ name: 'dashboard' }) },
      { id: 'books', label: 'Mes livres', group: 'Aller à', icon: BookOpen, run: () => s.go({ name: 'list', filter: 'book' }) },
      { id: 'posters', label: 'Mes affiches', group: 'Aller à', icon: ImageIcon, run: () => s.go({ name: 'list', filter: 'poster' }) },
      { id: 'covers', label: 'Mes couvertures', group: 'Aller à', icon: BookMarked, run: () => s.go({ name: 'list', filter: 'cover' }) },
      { id: 'designs', label: 'Mes créations', group: 'Aller à', icon: PenTool, run: () => s.go({ name: 'list', filter: 'design' }) },
      { id: 'tpl', label: 'Mes modèles', group: 'Aller à', icon: LayoutTemplate, run: () => s.go({ name: 'templates' }) },
      { id: 'lib', label: 'Bibliothèque de ressources', group: 'Aller à', icon: FolderOpen, run: () => s.go({ name: 'library' }) },
      { id: 'hist', label: 'Historique', group: 'Aller à', icon: History, run: () => s.go({ name: 'history' }) },
      { id: 'set', label: 'Paramètres', group: 'Aller à', icon: Settings, run: () => s.go({ name: 'settings' }) },
      { id: 'ai', label: s.assistantOpen ? 'Fermer l’assistant IA' : 'Ouvrir l’assistant IA', group: 'Actions', icon: Bot, hint: 'Ctrl J', run: () => s.setAssistant(!s.assistantOpen) },
      { id: 'theme', label: s.settings.theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre', group: 'Actions', icon: Moon, run: () => s.setSettings({ theme: s.settings.theme === 'dark' ? 'light' : 'dark' }) },
    ]
    if (s.project?.kind === 'book') STEPS.forEach((st, k) => list.push({ id: 'step' + k, label: `Étape ${k + 1} — ${st.label}`, group: 'Livre en cours', icon: st.icon, run: () => s.update((p) => { p.step = k }, { undoable: false }) }))
    s.index.slice(0, 12).forEach((m) => list.push({ id: 'p' + m.id, label: m.name, group: 'Projets récents', icon: m.kind === 'book' ? BookOpen : m.kind === 'poster' ? ImageIcon : FileText, run: () => void s.openProject(m.id) }))
    return list
  }, [s])

  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtered = cmds.filter((c) => norm(c.label + ' ' + c.group).includes(norm(q)))
  const groups = [...new Set(filtered.map((c) => c.group))]
  const run = (c?: Cmd) => { if (!c) return; onClose(); c.run() }

  return (
    <div className="anim-fade fixed inset-0 z-[70] flex items-start justify-center bg-black/50 pt-[14vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="text-muted" />
          <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} placeholder="Rechercher une commande, un projet…" className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-subtle"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(filtered.length - 1, i + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)) }
              else if (e.key === 'Enter') run(filtered[i])
            }} />
          <span className="kbd">Échap</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {groups.map((g) => (
            <div key={g}>
              <div className="eyebrow px-2.5 pb-1 pt-2.5">{g}</div>
              {filtered.filter((c) => c.group === g).map((c) => {
                const idx = filtered.indexOf(c)
                return (
                  <button key={c.id} onMouseEnter={() => setI(idx)} onClick={() => run(c)} className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px] ${idx === i ? 'bg-panel3' : ''}`}>
                    <c.icon size={15} className="text-muted" /><span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="kbd">{c.hint}</span>}
                    {idx === i && <CornerDownLeft size={13} className="text-subtle" />}
                  </button>
                )
              })}
            </div>
          ))}
          {!filtered.length && <p className="px-3 py-8 text-center text-muted">Aucun résultat.</p>}
        </div>
      </div>
    </div>
  )
}
