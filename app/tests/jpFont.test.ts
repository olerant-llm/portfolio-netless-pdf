import { describe, it, expect } from 'vitest'
import { needsJapaneseFont } from '../src/utils/jpFont'

describe('needsJapaneseFont', () => {
  it('英数字だけなら日本語の書体は不要', () => {
    expect(needsJapaneseFont('CONFIDENTIAL 2026')).toBe(false)
  })

  it('日本語が混ざれば日本語の書体が必要', () => {
    expect(needsJapaneseFont('社外秘')).toBe(true)
    expect(needsJapaneseFont('Draft 案')).toBe(true)
  })

  it('全角記号も日本語の書体が必要', () => {
    expect(needsJapaneseFont('※重要')).toBe(true)
  })

  it('空文字は不要', () => {
    expect(needsJapaneseFont('')).toBe(false)
  })
})
