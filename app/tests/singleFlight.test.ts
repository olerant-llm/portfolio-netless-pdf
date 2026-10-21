import { describe, expect, it } from 'vitest'
import { createSingleFlight } from '../src/components/viewer/toolbar/singleFlight'

describe('createSingleFlight', () => {
  it('実行中にもう一度呼んでも、2本目は走らせない', async () => {
    const flight = createSingleFlight()
    let calls = 0
    let release = () => {}
    const task = () => new Promise<void>((resolve) => { calls++; release = resolve })
    const first = flight.run(task)
    const second = flight.run(task)
    expect(flight.running()).toBe(true)
    release()
    await first
    await second
    expect(calls).toBe(1)
    expect(flight.running()).toBe(false)
  })

  it('失敗した後も、次の呼び出しは走らせる', async () => {
    const flight = createSingleFlight()
    await flight.run(() => Promise.reject(new Error('x'))).catch(() => {})
    let ran = false
    await flight.run(async () => { ran = true })
    expect(ran).toBe(true)
  })
})
