import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkOsConflictError, WorkOsStore } from '../src/work-os/store.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function store(): Promise<WorkOsStore> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-genui-work-os-'))
  roots.push(root)
  const workOs = new WorkOsStore(root)
  await workOs.init()
  return workOs
}

describe('WorkOsStore', () => {
  it('starts with a versioned Swedish workspace', async () => {
    const workOs = await store()

    await expect(workOs.read()).resolves.toMatchObject({
      schemaVersion: 1,
      revision: 0,
      locale: 'sv-SE',
      objectives: [],
      tasks: [],
    })
  })

  it('atomically persists shared OKR and Kanban state', async () => {
    const workOs = await store()
    const saved = await workOs.replace({
      expectedRevision: 0,
      locale: 'sv-SE',
      objectives: [{
        id: 'objective-growth',
        title: 'Vaxa hallbart',
        owner: 'Team Growth',
        period: 'Q4',
        status: 'on-track',
        keyResults: [{ id: 'kr-activation', title: 'Oka aktivering', current: 42, target: 60, unit: '%' }],
      }],
      tasks: [{
        id: 'task-onboarding',
        title: 'Forenkla onboarding',
        column: 'doing',
        objectiveId: 'objective-growth',
        keyResultId: 'kr-activation',
        assignee: 'Nino',
        priority: 'high',
        order: 0,
      }],
    })

    expect(saved.revision).toBe(1)
    expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const reloaded = new WorkOsStore(workOs.root)
    await reloaded.init()
    await expect(reloaded.read()).resolves.toEqual(saved)
  })

  it('rejects stale revisions without overwriting newer work', async () => {
    const workOs = await store()
    await workOs.replace({ expectedRevision: 0, locale: 'sv-SE', objectives: [], tasks: [] })

    await expect(workOs.replace({
      expectedRevision: 0,
      locale: 'sv-SE',
      objectives: [],
      tasks: [],
    })).rejects.toBeInstanceOf(WorkOsConflictError)
    expect((await workOs.read()).revision).toBe(1)
  })

  it('rejects malformed ids, duplicate cards, and broken OKR links', async () => {
    const workOs = await store()
    const base = { expectedRevision: 0, locale: 'sv-SE' as const, objectives: [], tasks: [] }

    await expect(workOs.replace({
      ...base,
      tasks: [{ id: '../escape', title: 'No', column: 'backlog', priority: 'low', order: 0 }],
    })).rejects.toThrow('task id')

    await expect(workOs.replace({
      ...base,
      tasks: [
        { id: 'task-one', title: 'One', column: 'backlog', priority: 'low', order: 0 },
        { id: 'task-one', title: 'Two', column: 'done', priority: 'high', order: 0 },
      ],
    })).rejects.toThrow('duplicate task id')

    await expect(workOs.replace({
      ...base,
      tasks: [{
        id: 'task-linked',
        title: 'Linked',
        column: 'review',
        objectiveId: 'missing-objective',
        priority: 'medium',
        order: 0,
      }],
    })).rejects.toThrow('unknown objective')
  })
})
