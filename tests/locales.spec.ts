import { describe, expect, it } from 'vitest'
import { en, sv, zh } from '../src/client/locales.ts'

describe('GenUI locales', () => {
  it('ships a complete Swedish dictionary for GenUI and Canvas', () => {
    expect(Object.keys(sv).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(sv).sort()).toEqual(Object.keys(zh).sort())
    expect(sv['locale.code']).toBe('sv')
    expect(sv['action.openCanvas']).toContain('Canvas')
    expect(sv['feedback.saved']).toBe('Sparat')
  })
})
