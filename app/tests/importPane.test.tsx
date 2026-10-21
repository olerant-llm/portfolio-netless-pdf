import { DndContext } from '@dnd-kit/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import ImportPane from '../src/components/viewer/ImportPane'
import { DocumentProvider } from '../src/document/documentSession'
import { t } from '../src/i18n/ja'

vi.mock('../src/utils/pdfHelpers', () => ({
  loadPdfFromBytes: vi.fn(),
  releasePdf: vi.fn(),
}))

describe('ImportPane（取り込み元のページ一覧）', () => {
  it('選択済みの取り込み元を開き直す入口を重ねて表示しない', () => {
    const html = renderToStaticMarkup(
      <DocumentProvider>
        <DndContext>
          <ImportPane
            source={{ name: '追加資料.pdf', bytes: new Uint8Array([2]) }}
            onClose={() => undefined}
            picked={new Set()}
            onPickedChange={() => undefined}
            onInsert={vi.fn(async () => undefined)}
            dragEndedAtRef={{ current: 0 }}
          />
        </DndContext>
      </DocumentProvider>,
    )

    expect(html).toContain('追加資料.pdf')
    expect(html).not.toContain('別のPDFから')
    expect(html).not.toContain('画像から')
  })

  it('選択解除の意味が一目で分かる表記にする', () => {
    expect(t.viewer.importClearSelection).toBe('すべて解除')
    expect(t.viewer.importInsert(3)).toBe('末尾にまとめて追加（3ページ）')
  })

  it('ドラッグで好きな位置へ入れる手順を、選択数に応じた次の一手とともに示す', () => {
    expect(t.viewer.importStepDrag).toContain('ドラッグ')
    expect(t.viewer.importNextPick).toContain('選んで')
    expect(t.viewer.importNextDrag(3)).toBe('選んだ3ページを、左の入れたい位置へドラッグしてください。')
  })
})
