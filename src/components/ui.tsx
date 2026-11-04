import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X, ChevronDown, type LucideIcon } from 'lucide-react'

export function Modal({ title, subtitle, onClose, children, wide, footer, icon: Icon }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode; icon?: LucideIcon }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`anim-pop flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-panel ${wide ? 'max-w-5xl' : 'max-w-lg'}`} style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          {Icon && <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon size={16} /></span>}
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>
        <div className="overflow-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-panel2 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, className = '', hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-subtle">{hint}</span>}</label>
}

export function Num({ value, onChange, step = 1, min, max, className = '', prefix, suffix }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; className?: string; prefix?: string; suffix?: string }) {
  const [v, setV] = useState(String(value))
  useEffect(() => { setV(String(Math.round(value * 100) / 100)) }, [value])
  const input = <input type="number" className={`input tabular-nums ${prefix ? '!pl-6' : ''} ${suffix ? '!pr-8' : ''} ${className}`} value={v} step={step} min={min} max={max} onChange={(e) => { setV(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n) }} />
  if (!prefix && !suffix) return input
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-subtle">{prefix}</span>}
      {input}
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-subtle">{suffix}</span>}
    </div>
  )
}

export function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'
  return (
    <div className="flex h-8 items-center gap-0 overflow-hidden rounded-md border border-line bg-panel2 focus-within:border-accent">
      <label className="relative h-full w-9 shrink-0 cursor-pointer border-r border-line" style={{ background: hex }}>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <input className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono text-[12px] uppercase outline-none" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function Slider({ label, value, min, max, step = 0.01, onChange, fmt }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-[11px]"><span className="text-muted">{label}</span><span className="tabular-nums text-ink">{fmt ? fmt(value) : Math.round(value * 100) / 100}</span></span>
      <input type="range" className="w-full cursor-pointer" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ background: `linear-gradient(to right, var(--accent) ${pct}%, var(--line2) ${pct}%)`, borderRadius: 4, appearance: 'none', height: 4 }} />
    </label>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-[13px]">
      <span><span className="block">{label}</span>{hint && <span className="block text-[11px] text-subtle">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line2'}`}>
        <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
      </button>
    </label>
  )
}

export function Seg<T extends string>({ value, options, onChange, className = '' }: { value: T; options: { v: T; label: ReactNode; tip?: string }[]; onChange: (v: T) => void; className?: string }) {
  return <div className={`seg ${className}`}>{options.map((o) => <button key={o.v} type="button" data-tip={o.tip} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>)}</div>
}

/** Section repliable de panneau (style inspecteur). */
export function Section({ title, children, defaultOpen = true, action, icon: Icon }: { title: string; children: ReactNode; defaultOpen?: boolean; action?: ReactNode; icon?: LucideIcon }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-line">
      <div className="flex h-9 items-center gap-1.5 px-3">
        <button className="flex flex-1 items-center gap-1.5 text-left" onClick={() => setOpen(!open)}>
          <ChevronDown size={13} className={`text-subtle transition-transform ${open ? '' : '-rotate-90'}`} />
          {Icon && <Icon size={13} className="text-muted" />}
          <span className="text-[11.5px] font-semibold tracking-wide">{title}</span>
        </button>
        {action}
      </div>
      {open && <div className="space-y-2.5 px-3 pb-3">{children}</div>}
    </section>
  )
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { v: T; label: string; icon?: LucideIcon; badge?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex h-10 shrink-0 items-stretch gap-1 border-b border-line px-2">
      {tabs.map((t) => (
        <button key={t.v} onClick={() => onChange(t.v)} className={`relative flex items-center gap-1.5 px-2.5 text-[12.5px] font-medium transition-colors ${value === t.v ? 'text-ink' : 'text-muted hover:text-ink'}`}>
          {t.icon && <t.icon size={14} />}{t.label}
          {t.badge !== undefined && <span className="rounded-full bg-panel3 px-1.5 text-[10px] tabular-nums text-muted">{t.badge}</span>}
          {value === t.v && <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  )
}

export function Menu({ label, children, align = 'left', className = 'btn' }: { label: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button className={`${className} ${open ? '!bg-panel3' : ''}`} onClick={() => setOpen(!open)}>{label}</button>
      {open && <div className={`anim-pop absolute z-40 mt-1.5 min-w-56 rounded-lg border border-line bg-panel p-1 ${align === 'right' ? 'right-0' : 'left-0'}`} style={{ boxShadow: 'var(--shadow-lg)' }}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

export function MenuItem({ onClick, children, disabled, icon: Icon, shortcut, danger }: { onClick: () => void; children: ReactNode; disabled?: boolean; icon?: LucideIcon; shortcut?: string; danger?: boolean }) {
  return (
    <button disabled={disabled} className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-panel3 disabled:opacity-40 ${danger ? 'text-danger' : ''}`} onClick={onClick}>
      {Icon && <Icon size={14} className="shrink-0 text-muted" />}<span className="flex-1">{children}</span>{shortcut && <span className="kbd">{shortcut}</span>}
    </button>
  )
}
export const MenuSep = () => <div className="my-1 h-px bg-line" />
export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="eyebrow px-2.5 pb-1 pt-2">{children}</div>

export function Spinner({ label }: { label?: string }) {
  return <span className="inline-flex items-center gap-2 text-[12.5px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />{label}</span>
}

export function FileButton({ accept, onFiles, children, multiple, className = 'btn', tip }: { accept: string; onFiles: (f: File[]) => void; children: ReactNode; multiple?: boolean; className?: string; tip?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" data-tip={tip} className={className} onClick={() => ref.current?.click()}>{children}</button>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) onFiles(f) }} />
    </>
  )
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line2 px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-panel3 text-muted"><Icon size={22} /></span>
      <div className="font-semibold">{title}</div>
      {text && <p className="mt-1 max-w-sm text-[12.5px] text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Rendu Markdown minimal (titres, listes, gras, italique). */
export function Markdown({ text }: { text: string }) {
  const html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/^### (.*)$/gm, '<h4 class="mt-3 font-semibold">$1</h4>')
    .replace(/^## (.*)$/gm, '<h3 class="mt-4 text-[14px] font-semibold">$1</h3>')
    .replace(/^# (.*)$/gm, '<h2 class="mt-4 text-base font-bold">$1</h2>')
    .replace(/^\s*[-*] (.*)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\s*\d+\. (.*)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<![*\w])_(.+?)_(?![*\w])|(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, (_m, a, b) => `<em>${a || b}</em>`)
    .replace(/\n{2,}/g, '<br/><br/>')
  return <div className="text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
}
