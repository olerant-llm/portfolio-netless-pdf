import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DocumentState, useDocument } from '../../../document/documentSession'
import { rotatePages, deletePages } from '../../../operations/pageOps'
import { exportSelectedPages, PagesExportMode } from '../../../exports/pagesExport'
import { downloadFile } from '../../../utils/pdfHelpers'
import { toUserMessage } from '../../../utils/userMessage'
import { t } from '../../../i18n/ja'
import { orderedTargets } from './pageTargets'
import { createSingleFlight } from './singleFlight'

/**
 * 回転・削除・取り出し。ツールバー・右クリック・Delete キーの3つの入口が同じ処理を使う。
 * 削除は「元に戻す」で戻せるので、確認は出さない。
 * 対象は選択中のページ。右クリックのように別の対象を使うときは、最後の引数で渡す。
 */
export function usePageActions(doc: DocumentState | null, selected: Set<string>) {
  const { applyOperation } = useDocument()
  // 取り出しは編集中のPDFを変えないので「処理中」にならない。二重実行はここで防ぐ
  const extractFlight = useRef(createSingleFlight())
  const [isExtracting, setIsExtracting] = useState(false)

  const targets = useCallback(
    (override?: Set<string>) => (doc ? orderedTargets(doc.pageIds, override ?? selected) : []),
    [doc, selected],
  )

  const guarded = useCallback(async (task: () => Promise<unknown>) => {
    try {
      await task()
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
    }
  }, [])

  const rotate = useCallback((delta: 90 | -90, override?: Set<string>) => guarded(async () => {
    const ids = targets(override)
    if (ids.length > 0) await applyOperation((input) => rotatePages(input, ids, delta))
  }), [applyOperation, guarded, targets])

  const remove = useCallback((override?: Set<string>) => guarded(async () => {
    const ids = targets(override)
    if (ids.length > 0) await applyOperation((input) => deletePages(input, ids))
  }), [applyOperation, guarded, targets])

  const extract = useCallback((mode: PagesExportMode, override?: Set<string>) => {
    const ids = targets(override)
    if (!doc || ids.length === 0) return Promise.resolve()
    return extractFlight.current.run(async () => {
      setIsExtracting(true)
      try {
        await guarded(async () => {
          const result = await exportSelectedPages(
            { bytes: doc.bytes, pageIds: doc.pageIds }, ids, mode, doc.name,
          )
          const saved = await downloadFile(result.bytes, result.fileName, result.mimeType)
          toast[saved ? 'success' : 'info'](
            saved ? t.viewer.exportPagesSaved(result.pageCount) : t.viewer.saveCanceled,
          )
        })
      } finally {
        setIsExtracting(false)
      }
    })
  }, [doc, guarded, targets])

  return { rotate, remove, extract, isExtracting }
}
