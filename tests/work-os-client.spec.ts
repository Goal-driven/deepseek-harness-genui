import { describe, expect, it } from 'vitest'
import { moveTask, objectiveProgress, workOsCopy } from '../src/client/work-os.tsx'
import type { Objective, WorkTask } from '../src/work-os/store.ts'

const tasks: WorkTask[] = [
  { id: 'task-one', title: 'One', column: 'backlog', priority: 'low', order: 0 },
  { id: 'task-two', title: 'Two', column: 'backlog', priority: 'medium', order: 1 },
  { id: 'task-three', title: 'Three', column: 'doing', priority: 'high', order: 0 },
]

describe('Work OS client model', () => {
  it('moves a card and normalizes both Kanban columns', () => {
    expect(moveTask(tasks, 'task-two', 'doing', 0)).toEqual([
      expect.objectContaining({ id: 'task-one', column: 'backlog', order: 0 }),
      expect.objectContaining({ id: 'task-two', column: 'doing', order: 0 }),
      expect.objectContaining({ id: 'task-three', column: 'doing', order: 1 }),
    ])
  })

  it('calculates capped objective progress across key results', () => {
    const objective: Objective = {
      id: 'objective-growth', title: 'Growth', owner: 'Team', period: 'Q4', status: 'on-track',
      keyResults: [
        { id: 'kr-one', title: 'One', current: 40, target: 80, unit: '%' },
        { id: 'kr-two', title: 'Two', current: 150, target: 100, unit: '%' },
      ],
    }
    expect(objectiveProgress(objective)).toBe(75)
  })

  it('uses Swedish as the complete default UI language', () => {
    expect(workOsCopy('sv')).toMatchObject({ title: 'Work OS', okrs: 'OKR:er', kanban: 'Kanban', addTask: 'Ny uppgift' })
  })
})
