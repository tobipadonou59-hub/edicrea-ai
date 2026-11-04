import { Check } from 'lucide-react'
import { useStore } from '../../lib/store'
import ImportStep from './ImportStep'
import CorrectStep from './CorrectStep'
import ComposeStep from './ComposeStep'
import LayoutStep from './LayoutStep'
import CoverStep from './CoverStep'
import FinalizeStep from './FinalizeStep'
import { STEPS } from './steps'

export default function BookWorkflow() {
  const project = useStore((s) => s.project)!
  const update = useStore((s) => s.update)
  const step = project.step
  const book = project.book!
  const go = (i: number) => update((p) => { p.step = i }, { undoable: false })
  const has = book.blocks.length > 0
  const done = [has, has && book.suggestions.length > 0 && !book.suggestions.some((s) => s.status === 'pending'), book.blocks.some((b) => b.type === 'h1'), step > 3, !!book.cover.design, false]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex shrink-0 items-center gap-0 overflow-x-auto border-b border-line bg-panel px-3">
        {STEPS.map((s, i) => {
          const active = step === i
          const disabled = !has && i > 0 && i !== 4
          const ok = done[i] && !active
          return (
            <div key={s.label} className="flex min-w-0 flex-1 items-center">
              <button onClick={() => go(i)} disabled={disabled}
                className={`group relative flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? '' : 'hover:bg-panel2'}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold tabular-nums transition ${active ? 'border-accent bg-accent text-accent-ink shadow-[0_0_0_4px_var(--accent-soft)]' : ok ? 'border-ok/40 bg-ok/15 text-ok' : 'border-line2 text-muted'}`}>
                  {ok ? <Check size={14} strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-[13px] font-semibold ${active ? 'text-ink' : 'text-muted group-hover:text-ink'}`}>{s.label}</span>
                  <span className="block truncate text-[11px] text-subtle">{s.desc}</span>
                </span>
                {active && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" />}
              </button>
              {i < STEPS.length - 1 && <span className={`h-px w-6 shrink-0 ${done[i] ? 'bg-ok/50' : 'bg-line2'}`} />}
            </div>
          )
        })}
      </nav>
      <div className="min-h-0 flex-1 overflow-hidden">
        {step === 0 && <ImportStep next={() => go(1)} />}
        {step === 1 && <CorrectStep next={() => go(2)} />}
        {step === 2 && <ComposeStep next={() => go(3)} />}
        {step === 3 && <LayoutStep next={() => go(4)} />}
        {step === 4 && <CoverStep next={() => go(5)} />}
        {step === 5 && <FinalizeStep />}
      </div>
    </div>
  )
}
