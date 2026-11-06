import { create } from 'zustand'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import type { Asset, HistoryEntry, Project, ProjectKind, Settings, Template } from './types'
import { newBookData, newPosterData, uid } from './defaults'

export type View =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'list'; filter: 'book' | 'poster' | 'cover' | 'design' | 'all' }
  | { name: 'templates' }
  | { name: 'library' }
  | { name: 'history' }
  | { name: 'settings' }
  | { name: 'help' }
  | { name: 'project'; id: string }

export interface ProjectMeta { id: string; kind: ProjectKind; name: string; client: string; updatedAt: number; createdAt: number; thumb?: string; step: number }

interface State {
  ready: boolean
  view: View
  settings: Settings
  index: ProjectMeta[]
  project: Project | null
  past: string[]
  future: string[]
  templates: Template[]
  assets: Asset[]
  history: HistoryEntry[]
  assistantOpen: boolean
  toast: string | null
  saving: boolean
  init: () => Promise<void>
  go: (v: View) => void
  setSettings: (p: Partial<Settings>) => void
  createProject: (kind: ProjectKind, name: string, client?: string) => Promise<string>
  openProject: (id: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  duplicateProject: (id: string) => Promise<void>
  importProject: (p: Project) => Promise<void>
  update: (fn: (p: Project) => void, opts?: { undoable?: boolean; label?: string }) => void
  undo: () => void
  redo: () => void
  snapshot: (label: string) => void
  restoreVersion: (vid: string) => void
  saveNow: () => Promise<void>
  addTemplate: (t: Omit<Template, 'id' | 'createdAt'>) => void
  removeTemplate: (id: string) => void
  updateTemplate: (id: string, patch: Partial<Template>) => void
  addAsset: (a: Omit<Asset, 'id' | 'createdAt'>) => void
  removeAsset: (id: string) => void
  log: (text: string, projectId?: string) => void
  notify: (t: string) => void
  setAssistant: (o: boolean) => void
}

const defaultSettings: Settings = { theme: 'dark', apiKey: '', apiBase: '', model: 'claude-opus-5-5', userName: 'Moi', effort: 'medium', imageProvider: 'gemini', geminiKey: '', geminiModel: 'gemini-2.5-flash-image', openaiKey: '', openaiModel: 'gpt-image-2', imageQuality: 'high' }

function loadSettings(): Settings {
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem('edicrea.settings') || '{}') } } catch { return defaultSettings }
}

const meta = (p: Project): ProjectMeta => ({ id: p.id, kind: p.kind, name: p.name, client: p.client, updatedAt: p.updatedAt, createdAt: p.createdAt, thumb: p.thumb, step: p.step })

let saveTimer: ReturnType<typeof setTimeout> | undefined

const projectData = (p: Project) => JSON.stringify({ book: p.book, poster: p.poster, design: p.design, name: p.name, step: p.step })

export const useStore = create<State>((set, get) => ({
  ready: false,
  view: { name: 'dashboard' },
  settings: loadSettings(),
  index: [],
  project: null,
  past: [],
  future: [],
  templates: [],
  assets: [],
  history: [],
  assistantOpen: false,
  toast: null,
  saving: false,

  async init() {
    const [index, templates, assets, history] = await Promise.all([
      idbGet<ProjectMeta[]>('projects:index'), idbGet<Template[]>('templates'), idbGet<Asset[]>('assets'), idbGet<HistoryEntry[]>('history'),
    ])
    set({ ready: true, index: index || [], templates: templates || [], assets: assets || [], history: history || [] })
    const last = localStorage.getItem('edicrea.lastView')
    if (last) { try { const v = JSON.parse(last) as View; if (v.name === 'project') await get().openProject(v.id); else set({ view: v }) } catch { /* ignore */ } }
  },

  go(v) {
    if (get().project && v.name !== 'project') void get().saveNow()
    set({ view: v })
    try { localStorage.setItem('edicrea.lastView', JSON.stringify(v)) } catch { /* ignore */ }
  },

  setSettings(p) {
    const s = { ...get().settings, ...p }
    localStorage.setItem('edicrea.settings', JSON.stringify(s))
    set({ settings: s })
  },

  async createProject(kind, name, client = '') {
    const now = Date.now()
    const p: Project = { id: uid(), kind, name, client, createdAt: now, updatedAt: now, step: 0, versions: [], comments: [] }
    if (kind === 'book') p.book = newBookData()
    if (kind === 'poster') p.poster = newPosterData()
    if (kind === 'design') p.design = { width: 1080, height: 1080, unitsPerMm: 0, bleedMm: 0, json: null }
    await idbSet('project:' + p.id, p)
    const index = [meta(p), ...get().index]
    await idbSet('projects:index', index)
    set({ index })
    get().log(`Projet créé : ${name}`, p.id)
    await get().openProject(p.id)
    return p.id
  },

  async openProject(id) {
    const p = await idbGet<Project>('project:' + id)
    if (!p) { set({ view: { name: 'dashboard' } }); return }
    set({ project: p, past: [], future: [], view: { name: 'project', id } })
    localStorage.setItem('edicrea.lastView', JSON.stringify({ name: 'project', id }))
  },

  async deleteProject(id) {
    await idbDel('project:' + id)
    const index = get().index.filter((m) => m.id !== id)
    await idbSet('projects:index', index)
    set({ index, project: get().project?.id === id ? null : get().project })
  },

  async duplicateProject(id) {
    const p = await idbGet<Project>('project:' + id)
    if (!p) return
    const c: Project = { ...structuredClone(p), id: uid(), name: p.name + ' (copie)', createdAt: Date.now(), updatedAt: Date.now() }
    await idbSet('project:' + c.id, c)
    const index = [meta(c), ...get().index]
    await idbSet('projects:index', index)
    set({ index })
  },

  async importProject(p) {
    const c = { ...p, id: uid(), updatedAt: Date.now() }
    await idbSet('project:' + c.id, c)
    const index = [meta(c), ...get().index]
    await idbSet('projects:index', index)
    set({ index })
    get().log(`Projet importé : ${c.name}`, c.id)
  },

  update(fn, opts) {
    const cur = get().project
    if (!cur) return
    const before = opts?.undoable === false ? null : projectData(cur)
    const next = structuredClone(cur)
    fn(next)
    next.updatedAt = Date.now()
    const past = before ? [...get().past, before].slice(-60) : get().past
    set({ project: next, past, future: before ? [] : get().future, saving: true })
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void get().saveNow(), 800) // sauvegarde automatique
  },

  undo() {
    const { past, project } = get()
    if (!project || !past.length) return
    const prev = JSON.parse(past[past.length - 1])
    const futureEntry = projectData(project)
    set({ project: { ...project, ...prev, updatedAt: Date.now() }, past: past.slice(0, -1), future: [futureEntry, ...get().future] })
    void get().saveNow()
  },

  redo() {
    const { future, project } = get()
    if (!project || !future.length) return
    const nxt = JSON.parse(future[0])
    set({ project: { ...project, ...nxt, updatedAt: Date.now() }, future: future.slice(1), past: [...get().past, projectData(project)] })
    void get().saveNow()
  },

  snapshot(label) {
    get().update((p) => {
      p.versions = [{ id: uid(), label, at: Date.now(), data: JSON.stringify({ book: p.book, poster: p.poster, design: p.design }) }, ...p.versions].slice(0, 40)
    }, { undoable: false })
    get().log(`Version enregistrée : ${label}`, get().project?.id)
  },

  restoreVersion(vid) {
    const p = get().project
    const v = p?.versions.find((x) => x.id === vid)
    if (!v) return
    get().snapshot('Avant restauration de « ' + v.label + ' »')
    const data = JSON.parse(v.data)
    get().update((pp) => { pp.book = data.book; pp.poster = data.poster; pp.design = data.design })
    get().notify('Version restaurée')
  },

  async saveNow() {
    const p = get().project
    if (!p) return
    await idbSet('project:' + p.id, p)
    const index = get().index.map((m) => (m.id === p.id ? meta(p) : m)).sort((a, b) => b.updatedAt - a.updatedAt)
    await idbSet('projects:index', index)
    set({ index, saving: false })
  },

  addTemplate(t) {
    const templates = [{ ...t, id: uid(), createdAt: Date.now() }, ...get().templates]
    void idbSet('templates', templates)
    set({ templates })
    get().notify(t.kind === 'layout' ? 'Gabarit enregistré dans « Mes gabarits ».' : 'Modèle enregistré dans « Mes modèles »')
  },
  updateTemplate(id, patch) {
    const templates = get().templates.map((t) => (t.id === id ? { ...t, ...patch } : t))
    void idbSet('templates', templates)
    set({ templates })
  },
  removeTemplate(id) {
    const templates = get().templates.filter((t) => t.id !== id)
    void idbSet('templates', templates)
    set({ templates })
  },
  addAsset(a) {
    const assets = [{ ...a, id: uid(), createdAt: Date.now() }, ...get().assets]
    void idbSet('assets', assets)
    set({ assets })
  },
  removeAsset(id) {
    const assets = get().assets.filter((t) => t.id !== id)
    void idbSet('assets', assets)
    set({ assets })
  },
  log(text, projectId) {
    const history = [{ id: uid(), at: Date.now(), text, projectId }, ...get().history].slice(0, 500)
    void idbSet('history', history)
    set({ history })
  },
  notify(t) {
    set({ toast: t })
    setTimeout(() => { if (get().toast === t) set({ toast: null }) }, 3200)
  },
  setAssistant(o) { set({ assistantOpen: o }) },
}))
