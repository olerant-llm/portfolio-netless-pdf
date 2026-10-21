import { describe, expect, it } from 'vitest'
import { t } from '../src/i18n/ja'

describe('ツールバーの文言', () => {
  it('ボタン名がすべて日本語で用意されている', () => {
    const labels = [
      t.viewer.toolOpen, t.viewer.toolSave, t.viewer.toolAddPdf, t.viewer.toolRotateLeft,
      t.viewer.toolRotateRight, t.viewer.toolDelete, t.viewer.toolExtract, t.viewer.toolCrop,
      t.viewer.toolSignature, t.viewer.toolFinish, t.viewer.toolExport,
    ]
    for (const label of labels) expect(label).toMatch(/[ぁ-んァ-ン一-龥]/)
  })

  it('選択数の表示に数を入れる', () => {
    expect(t.viewer.statusSelected(3)).toBe('3ページを選択中')
  })
})
