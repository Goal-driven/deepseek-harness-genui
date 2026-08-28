import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Objective, ObjectiveStatus, WorkOsState, WorkTask, TaskColumn, TaskPriority } from '../work-os/store.ts'

type Copy = ReturnType<typeof workOsCopy>

export interface VoiceTelemetrySnapshot {
  model: string
  responses: number
  cacheHitPercent: number
  firstAudioLatencyMs?: number
  totalCostUsd: number
  lastResponseCostUsd: number
}

declare global {
  interface Window {
    __VALUEHUB_VOICE_TELEMETRY__?: VoiceTelemetrySnapshot
  }
}

const columns: TaskColumn[] = ['backlog', 'doing', 'review', 'done']

export function objectiveProgress(objective: Objective): number {
  if (objective.keyResults.length === 0) return 0
  const total = objective.keyResults.reduce((sum, result) => sum + Math.min(1, Math.max(0, result.current / result.target)), 0)
  return Math.round((total / objective.keyResults.length) * 100)
}

export function moveTask(tasks: WorkTask[], taskId: string, column: TaskColumn, position: number): WorkTask[] {
  const moving = tasks.find(task => task.id === taskId)
  if (moving === undefined) return tasks
  const grouped = new Map<TaskColumn, WorkTask[]>(columns.map(item => [item, []]))
  for (const task of tasks) {
    if (task.id !== taskId) grouped.get(task.column)?.push({ ...task })
  }
  for (const group of grouped.values()) group.sort((a, b) => a.order - b.order)
  const target = grouped.get(column) ?? []
  target.splice(Math.max(0, Math.min(position, target.length)), 0, { ...moving, column })
  const normalized = new Map<string, WorkTask>()
  for (const group of grouped.values()) group.forEach((task, order) => normalized.set(task.id, { ...task, order }))
  return columns.flatMap(item => (grouped.get(item) ?? []).map(task => normalized.get(task.id) ?? task))
}

export function workOsCopy(locale: string) {
  if (locale === 'sv') return {
    title: 'Work OS', subtitle: 'Gemensamma mål och genomförande', okrs: 'OKR:er', kanban: 'Kanban', close: 'Stäng Canvas',
    addObjective: 'Nytt mål', addTask: 'Ny uppgift', save: 'Spara', cancel: 'Avbryt', owner: 'Ägare', period: 'Period',
    objective: 'Mål', keyResults: 'Nyckelresultat', addKeyResult: 'Nytt nyckelresultat', target: 'Mål', current: 'Utfall', unit: 'Enhet',
    assignee: 'Ansvarig', priority: 'Prioritet', unlinked: 'Ej kopplad', loading: 'Läser arbetsytan…', retry: 'Försök igen',
    conflict: 'Någon annan hann spara. Senaste data har lästs in; gör ändringen igen.', emptyObjectives: 'Skapa det första gemensamma målet.',
    emptyColumn: 'Släpp ett kort här', voice: 'Rösttelemetri', cache: 'Cacheträff', latency: 'Svarslatens', cost: 'Kostnad',
    noVoice: 'Starta ett röstsamtal för att se cache, latens och kostnad.', responses: 'svar', delete: 'Ta bort',
    columns: { backlog: 'Att göra', doing: 'Pågår', review: 'Granskning', done: 'Klart' } as Record<TaskColumn, string>,
    priorities: { low: 'Låg', medium: 'Normal', high: 'Hög' } as Record<TaskPriority, string>,
    statuses: { 'on-track': 'På plan', 'at-risk': 'Risk', 'off-track': 'Avviker', done: 'Klart' } as Record<ObjectiveStatus, string>,
  }
  return {
    title: 'Work OS', subtitle: 'Shared outcomes and delivery', okrs: 'OKRs', kanban: 'Kanban', close: 'Close Canvas',
    addObjective: 'New objective', addTask: 'New task', save: 'Save', cancel: 'Cancel', owner: 'Owner', period: 'Period',
    objective: 'Objective', keyResults: 'Key results', addKeyResult: 'New key result', target: 'Target', current: 'Current', unit: 'Unit',
    assignee: 'Assignee', priority: 'Priority', unlinked: 'Not linked', loading: 'Loading workspace…', retry: 'Try again',
    conflict: 'Someone else saved first. The latest data is loaded; repeat your change.', emptyObjectives: 'Create the first shared objective.',
    emptyColumn: 'Drop a card here', voice: 'Voice telemetry', cache: 'Cache hit', latency: 'Response latency', cost: 'Cost',
    noVoice: 'Start a voice conversation to see cache, latency, and cost.', responses: 'responses', delete: 'Delete',
    columns: { backlog: 'To do', doing: 'In progress', review: 'Review', done: 'Done' } as Record<TaskColumn, string>,
    priorities: { low: 'Low', medium: 'Normal', high: 'High' } as Record<TaskPriority, string>,
    statuses: { 'on-track': 'On track', 'at-risk': 'At risk', 'off-track': 'Off track', done: 'Done' } as Record<ObjectiveStatus, string>,
  }
}

async function readState(): Promise<WorkOsState> {
  const response = await fetch('/genui/manage/work-os', { headers: { accept: 'application/json' } })
  const value = await response.json() as WorkOsState & { error?: string }
  if (!response.ok) throw new Error(value.error ?? `Work OS request failed: ${response.status}`)
  return value
}

async function replaceState(state: WorkOsState): Promise<WorkOsState> {
  const response = await fetch('/genui/manage/work-os', {
    method: 'PUT',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      expectedRevision: state.revision,
      locale: state.locale,
      objectives: state.objectives,
      tasks: state.tasks,
    }),
  })
  const value = await response.json() as WorkOsState & { error?: string }
  if (response.status === 409) throw new Error('state_changed')
  if (!response.ok) throw new Error(value.error ?? `Work OS save failed: ${response.status}`)
  return value
}

function slug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function VoiceMetrics({ copy }: { copy: Copy }) {
  const [metrics, setMetrics] = useState<VoiceTelemetrySnapshot | undefined>(() => window.__VALUEHUB_VOICE_TELEMETRY__)
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<VoiceTelemetrySnapshot>).detail
      if (detail !== undefined) setMetrics(detail)
    }
    window.addEventListener('valuehub:voice-telemetry', receive)
    return () => window.removeEventListener('valuehub:voice-telemetry', receive)
  }, [])
  return <section className="vh-voice" aria-label={copy.voice}>
    <div><span className="vh-kicker">{copy.voice}</span><strong>{metrics?.model ?? 'GPT-Realtime 2.1 Mini'}</strong></div>
    {metrics === undefined ? <p>{copy.noVoice}</p> : <div className="vh-metrics">
      <Metric label={copy.cache} value={`${metrics.cacheHitPercent.toFixed(1)}%`} />
      <Metric label={copy.latency} value={metrics.firstAudioLatencyMs === undefined ? '—' : `${Math.round(metrics.firstAudioLatencyMs)} ms`} />
      <Metric label={copy.cost} value={`$${metrics.totalCostUsd.toFixed(4)}`} />
      <Metric label={copy.responses} value={String(metrics.responses)} />
    </div>}
  </section>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function ObjectiveForm({ copy, onSave, onCancel }: { copy: Copy; onSave(value: Objective): void; onCancel(): void }) {
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState('')
  const [period, setPeriod] = useState('Q4')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !owner.trim() || !period.trim()) return
    onSave({ id: slug('objective'), title: title.trim(), owner: owner.trim(), period: period.trim(), status: 'on-track', keyResults: [] })
  }
  return <form className="vh-form" onSubmit={submit}>
    <label><span>{copy.objective}</span><input autoFocus value={title} maxLength={180} onChange={event => setTitle(event.currentTarget.value)} required /></label>
    <label><span>{copy.owner}</span><input value={owner} maxLength={100} onChange={event => setOwner(event.currentTarget.value)} required /></label>
    <label><span>{copy.period}</span><input value={period} maxLength={40} onChange={event => setPeriod(event.currentTarget.value)} required /></label>
    <div><button type="button" onClick={onCancel}>{copy.cancel}</button><button data-primary="true" type="submit">{copy.save}</button></div>
  </form>
}

function KeyResultForm({ copy, onSave, onCancel }: { copy: Copy; onSave(value: Objective['keyResults'][number]): void; onCancel(): void }) {
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState(100)
  const [unit, setUnit] = useState('%')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || target <= 0 || !unit.trim()) return
    onSave({ id: slug('kr'), title: title.trim(), current: 0, target, unit: unit.trim() })
  }
  return <form className="vh-form vh-form--kr" onSubmit={submit}>
    <label><span>{copy.keyResults}</span><input autoFocus value={title} maxLength={160} onChange={event => setTitle(event.currentTarget.value)} required /></label>
    <label><span>{copy.target}</span><input type="number" min="0.01" step="any" value={target} onChange={event => setTarget(event.currentTarget.valueAsNumber)} required /></label>
    <label><span>{copy.unit}</span><input value={unit} maxLength={20} onChange={event => setUnit(event.currentTarget.value)} required /></label>
    <div><button type="button" onClick={onCancel}>{copy.cancel}</button><button data-primary="true" type="submit">{copy.save}</button></div>
  </form>
}

function TaskForm({ copy, objectives, onSave, onCancel }: { copy: Copy; objectives: Objective[]; onSave(value: WorkTask): void; onCancel(): void }) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [objectiveId, setObjectiveId] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    onSave({
      id: slug('task'), title: title.trim(), column: 'backlog', priority, order: 0,
      ...(assignee.trim() ? { assignee: assignee.trim() } : {}),
      ...(objectiveId ? { objectiveId } : {}),
    })
  }
  return <form className="vh-form" onSubmit={submit}>
    <label><span>{copy.addTask}</span><input autoFocus value={title} maxLength={180} onChange={event => setTitle(event.currentTarget.value)} required /></label>
    <label><span>{copy.assignee}</span><input value={assignee} maxLength={100} onChange={event => setAssignee(event.currentTarget.value)} /></label>
    <label><span>{copy.priority}</span><select value={priority} onChange={event => setPriority(event.currentTarget.value as TaskPriority)}>{(['low', 'medium', 'high'] as const).map(item => <option key={item} value={item}>{copy.priorities[item]}</option>)}</select></label>
    <label><span>{copy.objective}</span><select value={objectiveId} onChange={event => setObjectiveId(event.currentTarget.value)}><option value="">{copy.unlinked}</option>{objectives.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <div><button type="button" onClick={onCancel}>{copy.cancel}</button><button data-primary="true" type="submit">{copy.save}</button></div>
  </form>
}

export function WorkOsLauncher({ t }: PropsLocale<'genui'>) {
  const locale = t('locale.code') === 'sv' ? 'sv' : 'en'
  const copy = workOsCopy(locale)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'okrs' | 'kanban'>('okrs')
  const [state, setState] = useState<WorkOsState>()
  const [error, setError] = useState('')
  const [creating, setCreating] = useState<'objective' | 'task'>()
  const [addingKr, setAddingKr] = useState<string>()
  const [dragged, setDragged] = useState<string>()

  const load = async () => {
    setError('')
    try { setState(await readState()) } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  useEffect(() => { if (open && state === undefined) void load() }, [open])
  useEffect(() => {
    if (!open) return
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [open])

  const commit = async (next: WorkOsState) => {
    setError('')
    try { setState(await replaceState(next)) } catch (reason) {
      if (reason instanceof Error && reason.message === 'state_changed') {
        try {
          setState(await readState())
          setError(copy.conflict)
        } catch (reloadError) {
          setError(reloadError instanceof Error ? reloadError.message : String(reloadError))
        }
      } else setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  const objectiveNames = useMemo(() => new Map(state?.objectives.map(item => [item.id, item.title]) ?? []), [state?.objectives])

  return <>
    <button type="button" className="vh-work-os-launcher" aria-label={copy.title} title={copy.title} aria-pressed={open} onClick={() => setOpen(value => !value)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7v6H4V5Zm9 0h7v4h-7V5ZM4 13h7v6H4v-6Zm9-2h7v8h-7v-8Z" /></svg>
    </button>
    {open ? <aside className="vh-work-os" role="dialog" aria-label={copy.title}>
      <style>{workOsCss}</style>
      <header>
        <div><span className="vh-kicker">ValueHub</span><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
        <button type="button" className="vh-icon" aria-label={copy.close} title={copy.close} onClick={() => setOpen(false)}>×</button>
      </header>
      <VoiceMetrics copy={copy} />
      <nav aria-label={copy.title}>
        <button type="button" aria-current={view === 'okrs' ? 'page' : undefined} onClick={() => setView('okrs')}>{copy.okrs}</button>
        <button type="button" aria-current={view === 'kanban' ? 'page' : undefined} onClick={() => setView('kanban')}>{copy.kanban}</button>
        <button type="button" className="vh-add" onClick={() => setCreating(view === 'okrs' ? 'objective' : 'task')}>+ {view === 'okrs' ? copy.addObjective : copy.addTask}</button>
      </nav>
      {error ? <div className="vh-error" role="alert">{error}<button type="button" onClick={() => void load()}>{copy.retry}</button></div> : null}
      {state === undefined ? <div className="vh-loading" role="status">{copy.loading}</div> : <main>
        {creating === 'objective' ? <ObjectiveForm copy={copy} onCancel={() => setCreating(undefined)} onSave={objective => {
          setCreating(undefined)
          void commit({ ...state, objectives: [...state.objectives, objective] })
        }} /> : null}
        {creating === 'task' ? <TaskForm copy={copy} objectives={state.objectives} onCancel={() => setCreating(undefined)} onSave={task => {
          setCreating(undefined)
          const backlog = state.tasks.filter(item => item.column === 'backlog')
          void commit({ ...state, tasks: [...state.tasks, { ...task, order: backlog.length }] })
        }} /> : null}
        {view === 'okrs' ? <section className="vh-objectives">
          {state.objectives.length === 0 ? <p className="vh-empty">{copy.emptyObjectives}</p> : state.objectives.map(objective => <article key={objective.id} className="vh-objective">
            <div className="vh-objective-head"><div><span>{objective.period} · {objective.owner}</span><h2>{objective.title}</h2></div><strong>{objectiveProgress(objective)}%</strong></div>
            <div className="vh-progress"><i style={{ width: `${objectiveProgress(objective)}%` }} /></div>
            <div className="vh-objective-meta"><select aria-label="Status" value={objective.status} onChange={event => void commit({ ...state, objectives: state.objectives.map(item => item.id === objective.id ? { ...item, status: event.currentTarget.value as ObjectiveStatus } : item) })}>{(['on-track', 'at-risk', 'off-track', 'done'] as const).map(item => <option key={item} value={item}>{copy.statuses[item]}</option>)}</select><button type="button" onClick={() => setAddingKr(objective.id)}>+ {copy.addKeyResult}</button></div>
            {addingKr === objective.id ? <KeyResultForm copy={copy} onCancel={() => setAddingKr(undefined)} onSave={result => {
              setAddingKr(undefined)
              void commit({ ...state, objectives: state.objectives.map(item => item.id === objective.id ? { ...item, keyResults: [...item.keyResults, result] } : item) })
            }} /> : null}
            <ul>{objective.keyResults.map(result => <li key={result.id}><div><strong>{result.title}</strong><span>{Math.round(Math.min(1, Math.max(0, result.current / result.target)) * 100)}%</span></div><label><span>{copy.current}</span><input type="number" defaultValue={result.current} onBlur={event => {
              const current = event.currentTarget.valueAsNumber
              if (!Number.isFinite(current) || current === result.current) return
              void commit({ ...state, objectives: state.objectives.map(item => item.id === objective.id ? { ...item, keyResults: item.keyResults.map(kr => kr.id === result.id ? { ...kr, current } : kr) } : item) })
            }} /></label><span>/ {result.target} {result.unit}</span></li>)}</ul>
          </article>)}
        </section> : <section className="vh-board">
          {columns.map(column => {
            const cards = state.tasks.filter(task => task.column === column).sort((a, b) => a.order - b.order)
            return <section key={column} className="vh-column" onDragOver={event => event.preventDefault()} onDrop={() => {
              if (dragged !== undefined) void commit({ ...state, tasks: moveTask(state.tasks, dragged, column, cards.length) })
              setDragged(undefined)
            }}>
              <h2>{copy.columns[column]}<span>{cards.length}</span></h2>
              <div>{cards.map(task => <article key={task.id} className="vh-task" draggable onDragStart={() => setDragged(task.id)} onDragEnd={() => setDragged(undefined)}>
                <div><span data-priority={task.priority}>{copy.priorities[task.priority]}</span><button type="button" aria-label={`${copy.delete}: ${task.title}`} onClick={() => void commit({ ...state, tasks: state.tasks.filter(item => item.id !== task.id) })}>×</button></div>
                <h3>{task.title}</h3>
                {task.objectiveId ? <p>{objectiveNames.get(task.objectiveId)}</p> : null}
                <footer><span>{task.assignee ?? '—'}</span><select aria-label={`${copy.columns[column]}: ${task.title}`} value={task.column} onChange={event => void commit({ ...state, tasks: moveTask(state.tasks, task.id, event.currentTarget.value as TaskColumn, Number.MAX_SAFE_INTEGER) })}>{columns.map(item => <option key={item} value={item}>{copy.columns[item]}</option>)}</select></footer>
              </article>)}{cards.length === 0 ? <p className="vh-drop">{copy.emptyColumn}</p> : null}</div>
            </section>
          })}
        </section>}
      </main>}
    </aside> : null}
  </>
}

const workOsCss = `
.vh-work-os-launcher{width:32px;height:32px;border:0;border-radius:999px;display:grid;place-items:center;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}.vh-work-os-launcher[aria-pressed=true]{background:#20211f;color:#fff}.vh-work-os-launcher svg{width:18px;fill:currentColor}.vh-work-os{position:fixed;z-index:95;inset:0 0 0 auto;width:min(1180px,82vw);height:100dvh;overflow:auto;background:#f5f4ef;color:#1f211e;border-left:1px solid #d8d6cf;box-shadow:-24px 0 80px #10120d26;font:14px/1.4 Inter,ui-sans-serif,system-ui,sans-serif}.vh-work-os *{box-sizing:border-box}.vh-work-os>header{position:sticky;z-index:4;top:0;display:flex;justify-content:space-between;gap:20px;padding:22px 28px 16px;background:#f5f4eff2;backdrop-filter:blur(16px);border-bottom:1px solid #dedcd4}.vh-work-os h1{margin:2px 0 0;font:700 30px/1 ui-serif,Georgia,serif;letter-spacing:-.03em}.vh-work-os header p{margin:7px 0 0;color:#6f716a}.vh-kicker{display:block;color:#a44e34;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.vh-icon{width:36px;height:36px;border:1px solid #d1cfc7;border-radius:50%;background:#fff;color:inherit;font-size:22px;cursor:pointer}.vh-voice{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:18px 28px 0;padding:15px 18px;border:1px solid #d7d4ca;border-radius:16px;background:#20211f;color:#f6f4eb}.vh-voice>div:first-child strong{display:block;margin-top:3px}.vh-voice>p{margin:0;color:#b9bbb4;font-size:12px}.vh-metrics{display:grid;grid-template-columns:repeat(4,minmax(80px,1fr));gap:6px}.vh-metrics>div{min-width:84px;padding:7px 10px;border-radius:10px;background:#ffffff0c}.vh-metrics span{display:block;color:#aeb0aa;font-size:10px}.vh-metrics strong{display:block;margin-top:2px;font-size:13px;font-variant-numeric:tabular-nums}.vh-work-os>nav{position:sticky;z-index:3;top:85px;display:flex;gap:5px;padding:14px 28px;background:#f5f4eff2;backdrop-filter:blur(16px)}.vh-work-os>nav button{min-height:36px;border:0;border-radius:10px;padding:0 13px;background:transparent;color:#666861;font-weight:700;cursor:pointer}.vh-work-os>nav button[aria-current=page]{background:#fff;color:#1f211e;box-shadow:0 1px 3px #00000012}.vh-work-os>nav .vh-add{margin-left:auto;background:#a44e34;color:#fff}.vh-work-os>main{padding:0 28px 36px}.vh-loading,.vh-empty{display:grid;min-height:180px;place-items:center;color:#73756e}.vh-error{display:flex;justify-content:space-between;gap:12px;margin:0 28px 12px;padding:10px 12px;border-radius:10px;background:#f9ded8;color:#8c2f22}.vh-error button{border:0;background:transparent;color:inherit;font-weight:800;cursor:pointer}.vh-form{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;margin-bottom:16px;padding:14px;border:1px solid #d8d6cf;border-radius:14px;background:#fff}.vh-form label{display:grid;gap:4px}.vh-form label>span{color:#72736d;font-size:10px;font-weight:750;text-transform:uppercase}.vh-form input,.vh-form select,.vh-objective select,.vh-task select{width:100%;min-height:36px;border:1px solid #d6d4cc;border-radius:8px;padding:0 9px;background:#fff;color:inherit}.vh-form>div{display:flex;align-items:flex-end;gap:6px}.vh-form button,.vh-objective-meta button{min-height:36px;border:1px solid #d6d4cc;border-radius:8px;padding:0 11px;background:#fff;color:inherit;font-weight:700;cursor:pointer}.vh-form button[data-primary=true]{border-color:#20211f;background:#20211f;color:#fff}.vh-form--kr{grid-template-columns:2fr .7fr .7fr auto;margin:12px 0}.vh-objectives{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.vh-objective{min-width:0;padding:18px;border:1px solid #d8d6cf;border-radius:16px;background:#fff}.vh-objective-head{display:flex;justify-content:space-between;gap:14px}.vh-objective-head span{color:#74766f;font-size:11px}.vh-objective h2{margin:4px 0 0;font:650 19px/1.25 ui-serif,Georgia,serif}.vh-objective-head>strong{font-size:22px;font-variant-numeric:tabular-nums}.vh-progress{height:7px;margin:14px 0;border-radius:999px;background:#eeece5;overflow:hidden}.vh-progress i{display:block;height:100%;border-radius:inherit;background:#c15c3e}.vh-objective-meta{display:flex;justify-content:space-between;gap:8px}.vh-objective-meta select{width:auto;min-height:32px}.vh-objective-meta button{min-height:32px}.vh-objective ul{display:grid;gap:8px;margin:14px 0 0;padding:0;list-style:none}.vh-objective li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;padding:10px;border-radius:10px;background:#f7f6f2}.vh-objective li>div{min-width:0}.vh-objective li>div strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.vh-objective li>div span{color:#8a6658;font-size:10px}.vh-objective li label{display:flex;align-items:center;gap:5px}.vh-objective li label span{font-size:10px}.vh-objective li input{width:68px;min-height:30px;border:1px solid #d6d4cc;border-radius:7px;padding:0 7px}.vh-objective li>span{color:#70716b;font-size:11px}.vh-board{display:grid;grid-template-columns:repeat(4,minmax(230px,1fr));gap:10px;align-items:start;overflow-x:auto}.vh-column{min-height:400px;padding:11px;border:1px solid #d8d6cf;border-radius:15px;background:#ebeae4}.vh-column>h2{display:flex;justify-content:space-between;margin:0 2px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.vh-column>h2 span{display:grid;width:21px;height:21px;place-items:center;border-radius:50%;background:#fff;font-size:10px}.vh-column>div{display:grid;gap:8px}.vh-task{padding:12px;border:1px solid #d7d4ca;border-radius:12px;background:#fff;box-shadow:0 2px 5px #0000000a;cursor:grab}.vh-task:active{cursor:grabbing}.vh-task>div{display:flex;justify-content:space-between}.vh-task>div span{border-radius:999px;padding:3px 7px;background:#ece9df;color:#55564f;font-size:9px;font-weight:800;text-transform:uppercase}.vh-task>div span[data-priority=high]{background:#f5d9d2;color:#8b3424}.vh-task>div button{border:0;background:transparent;color:#8a8b85;cursor:pointer}.vh-task h3{margin:9px 0 5px;font-size:13px;line-height:1.35}.vh-task p{margin:0;color:#a44e34;font-size:10px;font-weight:700}.vh-task footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;color:#74756f;font-size:10px}.vh-task select{width:auto;min-height:28px;padding:0 5px;font-size:10px}.vh-drop{display:grid;min-height:90px;place-items:center;border:1px dashed #c7c5bc;border-radius:10px;color:#8c8e87;font-size:11px}.vh-work-os button:focus-visible,.vh-work-os input:focus-visible,.vh-work-os select:focus-visible,.vh-work-os-launcher:focus-visible{outline:2px solid #a44e34;outline-offset:2px}@media(max-width:920px){.vh-work-os{width:100vw}.vh-objectives{grid-template-columns:1fr}.vh-work-os>nav{top:85px}.vh-form,.vh-form--kr{grid-template-columns:1fr 1fr}.vh-form>div{align-items:center}.vh-metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.vh-work-os>header{padding:17px 16px 13px}.vh-work-os h1{font-size:25px}.vh-work-os>nav{top:75px;padding:10px 16px}.vh-work-os>main{padding:0 16px 28px}.vh-voice{display:grid;margin:12px 16px 0}.vh-error{margin:0 16px 10px}.vh-form,.vh-form--kr{grid-template-columns:1fr}.vh-board{grid-template-columns:repeat(4,82vw)}.vh-objective li{grid-template-columns:1fr auto}.vh-objective li>span{display:none}}
@media(prefers-color-scheme:dark){.vh-work-os{background:#171815;color:#f0f0eb;border-color:#34352f}.vh-work-os>header,.vh-work-os>nav{background:#171815ed;border-color:#34352f}.vh-work-os>nav button[aria-current=page],.vh-icon,.vh-form,.vh-objective,.vh-task{background:#242521;color:#f0f0eb;border-color:#3b3c36}.vh-column{background:#1e1f1b;border-color:#383933}.vh-form input,.vh-form select,.vh-objective select,.vh-task select,.vh-objective li input{background:#1b1c18;color:#f0f0eb;border-color:#44453e}.vh-objective li{background:#1c1d19}.vh-progress{background:#373832}.vh-column>h2 span{background:#30312c}.vh-drop{border-color:#464740}}
@media(prefers-reduced-motion:reduce){.vh-work-os{scroll-behavior:auto}}
`
