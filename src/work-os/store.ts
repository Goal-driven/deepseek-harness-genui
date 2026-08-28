import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

export type WorkOsLocale = 'sv-SE' | 'en'
export type ObjectiveStatus = 'on-track' | 'at-risk' | 'off-track' | 'done'
export type TaskColumn = 'backlog' | 'doing' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface KeyResult {
  id: string
  title: string
  current: number
  target: number
  unit: string
}

export interface Objective {
  id: string
  title: string
  owner: string
  period: string
  status: ObjectiveStatus
  keyResults: KeyResult[]
}

export interface WorkTask {
  id: string
  title: string
  column: TaskColumn
  objectiveId?: string
  keyResultId?: string
  assignee?: string
  priority: TaskPriority
  dueDate?: string
  order: number
}

export interface WorkOsState {
  schemaVersion: 1
  revision: number
  locale: WorkOsLocale
  updatedAt: string
  objectives: Objective[]
  tasks: WorkTask[]
}

export interface ReplaceWorkOsState {
  expectedRevision: number
  locale: WorkOsLocale
  objectives: Objective[]
  tasks: WorkTask[]
}

const ID = /^[a-z0-9][a-z0-9-]{2,63}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const OBJECTIVE_STATUSES = new Set<ObjectiveStatus>(['on-track', 'at-risk', 'off-track', 'done'])
const TASK_COLUMNS = new Set<TaskColumn>(['backlog', 'doing', 'review', 'done'])
const TASK_PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high'])

export class WorkOsConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(`work OS revision conflict; current revision is ${currentRevision}`)
  }
}

export class WorkOsStore {
  readonly root: string
  private current: WorkOsState = emptyState()
  private pending: Promise<void> = Promise.resolve()

  constructor(root: string) {
    this.root = resolve(root)
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    try {
      const parsed: unknown = JSON.parse(await readFile(this.statePath(), 'utf8'))
      this.current = validatePersistedState(parsed)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.current = emptyState()
    }
  }

  async read(): Promise<WorkOsState> {
    await this.pending
    return structuredClone(this.current)
  }

  async replace(input: ReplaceWorkOsState): Promise<WorkOsState> {
    let saved: WorkOsState | undefined
    const operation = this.pending.then(async () => {
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
        throw new Error('expectedRevision must be a non-negative integer')
      }
      if (input.expectedRevision !== this.current.revision) throw new WorkOsConflictError(this.current.revision)
      const next = validateState({
        schemaVersion: 1,
        revision: this.current.revision + 1,
        locale: input.locale,
        updatedAt: new Date().toISOString(),
        objectives: input.objectives,
        tasks: input.tasks,
      })
      await this.persist(next)
      this.current = next
      saved = structuredClone(next)
    })
    this.pending = operation.catch(() => undefined)
    await operation
    if (saved === undefined) throw new Error('work OS state was not saved')
    return saved
  }

  private async persist(state: WorkOsState): Promise<void> {
    const path = this.statePath()
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, path)
    } finally {
      await rm(temporary, { force: true })
    }
  }

  private statePath(): string {
    return resolve(this.root, 'state.json')
  }
}

function emptyState(): WorkOsState {
  return {
    schemaVersion: 1,
    revision: 0,
    locale: 'sv-SE',
    updatedAt: new Date(0).toISOString(),
    objectives: [],
    tasks: [],
  }
}

function validatePersistedState(value: unknown): WorkOsState {
  if (!isRecord(value)) throw new Error('work OS state must be an object')
  if (value.schemaVersion !== 1) throw new Error('unsupported work OS schemaVersion')
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw new Error('invalid work OS revision')
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('invalid work OS updatedAt')
  return validateState(value as unknown as WorkOsState)
}

function validateState(value: WorkOsState): WorkOsState {
  if (value.locale !== 'sv-SE' && value.locale !== 'en') throw new Error('locale must be sv-SE or en')
  if (!Array.isArray(value.objectives) || value.objectives.length > 200) throw new Error('objectives must contain at most 200 items')
  if (!Array.isArray(value.tasks) || value.tasks.length > 2_000) throw new Error('tasks must contain at most 2000 items')

  const objectiveIds = new Set<string>()
  const keyResultIds = new Map<string, string>()
  const objectives = value.objectives.map((objective, objectiveIndex) => {
    const item = record(objective, `objective ${objectiveIndex + 1}`)
    const id = identifier(item.id, 'objective id')
    if (objectiveIds.has(id)) throw new Error(`duplicate objective id: ${id}`)
    objectiveIds.add(id)
    if (!OBJECTIVE_STATUSES.has(item.status as ObjectiveStatus)) throw new Error(`invalid objective status: ${String(item.status)}`)
    if (!Array.isArray(item.keyResults) || item.keyResults.length > 50) throw new Error('keyResults must contain at most 50 items')
    const keyResults = item.keyResults.map((keyResult, keyResultIndex) => {
      const result = record(keyResult, `key result ${keyResultIndex + 1}`)
      const resultId = identifier(result.id, 'key result id')
      if (keyResultIds.has(resultId)) throw new Error(`duplicate key result id: ${resultId}`)
      keyResultIds.set(resultId, id)
      const current = finiteNumber(result.current, 'key result current')
      const target = finiteNumber(result.target, 'key result target')
      if (target <= 0) throw new Error('key result target must be greater than zero')
      return {
        id: resultId,
        title: text(result.title, 'key result title', 160),
        current,
        target,
        unit: text(result.unit, 'key result unit', 20),
      }
    })
    return {
      id,
      title: text(item.title, 'objective title', 180),
      owner: text(item.owner, 'objective owner', 100),
      period: text(item.period, 'objective period', 40),
      status: item.status as ObjectiveStatus,
      keyResults,
    }
  })

  const taskIds = new Set<string>()
  const tasks = value.tasks.map((task, taskIndex) => {
    const item = record(task, `task ${taskIndex + 1}`)
    const id = identifier(item.id, 'task id')
    if (taskIds.has(id)) throw new Error(`duplicate task id: ${id}`)
    taskIds.add(id)
    if (!TASK_COLUMNS.has(item.column as TaskColumn)) throw new Error(`invalid task column: ${String(item.column)}`)
    if (!TASK_PRIORITIES.has(item.priority as TaskPriority)) throw new Error(`invalid task priority: ${String(item.priority)}`)
    if (!Number.isSafeInteger(item.order) || Number(item.order) < 0) throw new Error('task order must be a non-negative integer')
    const objectiveId = optionalIdentifier(item.objectiveId, 'task objectiveId')
    const keyResultId = optionalIdentifier(item.keyResultId, 'task keyResultId')
    if (objectiveId !== undefined && !objectiveIds.has(objectiveId)) throw new Error(`task references unknown objective: ${objectiveId}`)
    if (keyResultId !== undefined) {
      const owner = keyResultIds.get(keyResultId)
      if (owner === undefined) throw new Error(`task references unknown key result: ${keyResultId}`)
      if (objectiveId !== owner) throw new Error(`task key result does not belong to objective: ${keyResultId}`)
    }
    const assignee = optionalText(item.assignee, 'task assignee', 100)
    const dueDate = optionalText(item.dueDate, 'task dueDate', 10)
    if (dueDate !== undefined && !DATE.test(dueDate)) throw new Error('task dueDate must use YYYY-MM-DD')
    return {
      id,
      title: text(item.title, 'task title', 180),
      column: item.column as TaskColumn,
      ...(objectiveId === undefined ? {} : { objectiveId }),
      ...(keyResultId === undefined ? {} : { keyResultId }),
      ...(assignee === undefined ? {} : { assignee }),
      priority: item.priority as TaskPriority,
      ...(dueDate === undefined ? {} : { dueDate }),
      order: Number(item.order),
    }
  })

  return {
    schemaVersion: 1,
    revision: value.revision,
    locale: value.locale,
    updatedAt: value.updatedAt,
    objectives,
    tasks,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`${label} must be a safe 3-64 character id`)
  return value
}

function optionalIdentifier(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return identifier(value, label)
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw new Error(`${label} must be 1-${max} characters`)
  return value.trim()
}

function optionalText(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return text(value, label, max)
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
  return value
}
