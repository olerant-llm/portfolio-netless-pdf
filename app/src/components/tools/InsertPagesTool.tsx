import { useState, useRef, useEffect } from 'react'
import { Plus, ArrowRight, Loader2, FilePlus, Check } from 'lucide-react'
import { toast } from 'sonner'

import { getPdfMetaData, loadPdfDocument } from '../../utils/pdfHelpers'
import { insertPages } from '../../utils/pageInsert'
import { addActivity } from '../../utils/recentActivity'
import { t } from '../../i18n/ja'
import PrivacyBadge from './shared/PrivacyBadge'
import SuccessState from './shared/SuccessState'

type SidePdf = {
  file: File
  bytes: Uint8Array
  pageCount: number
  pdfDoc: any
}

function LazyThumbnail({ pdfDoc, pageNum }: { pdfDoc: any, pageNum: number }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: 0.3 })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) return
        canvas.height = viewport.height
        canvas.width = viewport.width
        await page.render({ canvasContext: context, viewport }).promise
        if (active) setUrl(canvas.toDataURL())
      } catch (err) {
        console.error(err)
      }
    }
    render()
    return () => { active = false }
  }, [pdfDoc, pageNum])

  if (!url) {
    return (
      <div className="w-full h-32 bg-gray-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center animate-pulse">
        <Loader2 className="animate-spin text-gray-400" size={20} />
      </div>
    )
  }

  return (
    <img src={url} alt={`Page ${pageNum}`} className="w-full h-auto max-h-40 object-contain rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm" />
  )
}

export default function InsertPagesTool() {
  const [left, setLeft] = useState<SidePdf | null>(null)
  const [right, setRight] = useState<SidePdf | null>(null)
  const [selectedSourcePages, setSelectedSourcePages] = useState<number[]>([])
  const [insertIndex, setInsertIndex] = useState<number>(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [customFileName, setCustomFileName] = useState('差し込み済み')

  const leftInputRef = useRef<HTMLInputElement>(null)
  const rightInputRef = useRef<HTMLInputElement>(null)

  const openPdf = async (file: File): Promise<SidePdf | null> => {
    if (file.type !== 'application/pdf') {
      toast.error(t.errors.notPdf)
      return null
    }
    try {
      const meta = await getPdfMetaData(file)
      if (meta.isLocked) {
        toast.error(t.errors.locked)
        return null
      }
      const buffer = await file.arrayBuffer()
      const pdfDoc = await loadPdfDocument(file)
      return { file, bytes: new Uint8Array(buffer), pageCount: meta.pageCount, pdfDoc }
    } catch (err: any) {
      toast.error(t.errors.broken)
      return null
    }
  }

  const handleLeftFile = async (file: File) => {
    setIsProcessing(true)
    const pdf = await openPdf(file)
    if (pdf) {
      setLeft(pdf)
      setInsertIndex(pdf.pageCount) // 初期位置は末尾
      setCustomFileName(`${file.name.replace('.pdf', '')}-差し込み済み`)
    }
    setIsProcessing(false)
  }

  const handleRightFile = async (file: File) => {
    setIsProcessing(true)
    const pdf = await openPdf(file)
    if (pdf) {
      setRight(pdf)
      setSelectedSourcePages([0]) // 初期値は1ページ目を選択
    }
    setIsProcessing(false)
  }

  const toggleSourcePage = (idx: number) => {
    if (selectedSourcePages.includes(idx)) {
      setSelectedSourcePages(selectedSourcePages.filter(p => p !== idx))
    } else {
      setSelectedSourcePages([...selectedSourcePages, idx].sort((a, b) => a - b))
    }
  }

  const handleExecuteInsert = async () => {
    if (!left || !right) return
    if (selectedSourcePages.length === 0) {
      toast.error('差し込むページを1つ以上選択してください。')
      return
    }

    setIsProcessing(true)
    try {
      const resultBytes = await insertPages(left.bytes, right.bytes, selectedSourcePages, insertIndex)
      const blob = new Blob([resultBytes as any], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setDownloadUrl(url)
      addActivity({ name: `${customFileName}.pdf`, tool: 'Page Insert', size: blob.size, resultUrl: url })
    } catch (err: any) {
      toast.error(`エラーが発生しました: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  if (downloadUrl) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <SuccessState
          message="ページの差し込みが完了しました！"
          downloadUrl={downloadUrl}
          fileName={`${customFileName}.pdf`}
          onStartOver={() => {
            setDownloadUrl(null)
            setLeft(null)
            setRight(null)
            setSelectedSourcePages([])
          }}
        />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black dark:text-white mb-2">{t.tools.insert.title}</h1>
        <p className="text-gray-500 dark:text-zinc-400 text-sm">{t.tools.insert.desc}</p>
      </div>

      {/* 左右2面分割レイアウト */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* 左側: 差し込まれる側（主PDF） */}
        <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-6 border border-gray-100 dark:border-zinc-800 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-rose-500 uppercase tracking-widest">{t.tools.insert.ui.leftLabel}</h2>
            {left && (
              <button onClick={() => leftInputRef.current?.click()} className="text-xs font-bold text-gray-400 hover:text-rose-500 transition-colors">
                変更
              </button>
            )}
          </div>

          <input ref={leftInputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleLeftFile(e.target.files[0])} />

          {!left ? (
            <button
              onClick={() => leftInputRef.current?.click()}
              className="flex-1 min-h-[300px] border-3 border-dashed border-gray-200 dark:border-zinc-800 rounded-3xl flex flex-col items-center justify-center p-8 hover:border-rose-500 transition-colors group"
            >
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <FilePlus size={32} />
              </div>
              <span className="font-bold text-gray-700 dark:text-gray-200 mb-1">{t.tools.insert.ui.selectLeft}</span>
              <span className="text-xs text-gray-400">ベースとなるメインのPDF</span>
            </button>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="mb-4 pb-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="font-bold truncate text-sm dark:text-white max-w-[200px]">{left.file.name}</span>
                <span className="text-xs font-bold text-gray-400">{left.pageCount} ページ</span>
              </div>

              {/* 差し込み位置選択プレビュー */}
              <p className="text-xs font-bold text-gray-400 mb-3">差し込み位置を選択してください（現在の指定: {insertIndex === 0 ? '先頭' : `${insertIndex} ページ目の後ろ`}）:</p>
              
              <div className="flex-1 overflow-y-auto max-h-[450px] space-y-3 pr-2 scrollbar-hide">
                <button
                  onClick={() => setInsertIndex(0)}
                  className={`w-full py-2.5 px-4 rounded-xl border-2 font-bold text-xs flex items-center justify-between transition-all ${insertIndex === 0 ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-500' : 'border-dashed border-gray-200 dark:border-zinc-800 text-gray-400 hover:border-rose-300'}`}
                >
                  <span>📍 【先頭】に差し込む</span>
                  {insertIndex === 0 && <Check size={16} />}
                </button>

                {Array.from({ length: left.pageCount }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl flex items-center gap-4 border border-gray-100 dark:border-zinc-800">
                      <div className="w-16 shrink-0">
                        <LazyThumbnail pdfDoc={left.pdfDoc} pageNum={i + 1} />
                      </div>
                      <span className="font-black text-xs text-gray-500">ページ {i + 1}</span>
                    </div>

                    <button
                      onClick={() => setInsertIndex(i + 1)}
                      className={`w-full py-2.5 px-4 rounded-xl border-2 font-bold text-xs flex items-center justify-between transition-all ${insertIndex === i + 1 ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-500' : 'border-dashed border-gray-200 dark:border-zinc-800 text-gray-400 hover:border-rose-300'}`}
                    >
                      <span>📍 ページ {i + 1} の直後に差し込む</span>
                      {insertIndex === i + 1 && <Check size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右側: 取り込み元（副PDF） */}
        <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-6 border border-gray-100 dark:border-zinc-800 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-blue-500 uppercase tracking-widest">{t.tools.insert.ui.rightLabel}</h2>
            {right && (
              <button onClick={() => rightInputRef.current?.click()} className="text-xs font-bold text-gray-400 hover:text-blue-500 transition-colors">
                変更
              </button>
            )}
          </div>

          <input ref={rightInputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleRightFile(e.target.files[0])} />

          {!right ? (
            <button
              onClick={() => rightInputRef.current?.click()}
              className="flex-1 min-h-[300px] border-3 border-dashed border-gray-200 dark:border-zinc-800 rounded-3xl flex flex-col items-center justify-center p-8 hover:border-blue-500 transition-colors group"
            >
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Plus size={32} />
              </div>
              <span className="font-bold text-gray-700 dark:text-gray-200 mb-1">{t.tools.insert.ui.selectRight}</span>
              <span className="text-xs text-gray-400">差し込みたいページを持つPDF</span>
            </button>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="mb-4 pb-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="font-bold truncate text-sm dark:text-white max-w-[200px]">{right.file.name}</span>
                <span className="text-xs font-bold text-blue-500">{selectedSourcePages.length} ページ選択中</span>
              </div>

              <p className="text-xs font-bold text-gray-400 mb-3">差し込むページをクリックして選択（複数可）:</p>

              <div className="flex-1 overflow-y-auto max-h-[450px] grid grid-cols-2 gap-4 p-2 scrollbar-hide">
                {Array.from({ length: right.pageCount }).map((_, i) => {
                  const isSelected = selectedSourcePages.includes(i)
                  return (
                    <button
                      key={i}
                      onClick={() => toggleSourcePage(i)}
                      className={`relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all ${isSelected ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 ring-2 ring-blue-500/20' : 'border-gray-100 dark:border-zinc-800 hover:border-gray-300'}`}
                    >
                      <div className="w-full mb-2">
                        <LazyThumbnail pdfDoc={right.pdfDoc} pageNum={i + 1} />
                      </div>
                      <span className="text-xs font-bold text-gray-600 dark:text-gray-300">ページ {i + 1}</span>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-black shadow-md">
                          ✓
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* アクションエリア */}
      {left && right && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-gray-100 dark:border-zinc-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 animate-in fade-in duration-300">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 mb-2">保存するファイル名</label>
            <input
              type="text"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              className="w-full max-w-md bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 font-bold text-sm dark:text-white outline-none focus:border-rose-500"
            />
          </div>

          <button
            onClick={handleExecuteInsert}
            disabled={isProcessing || selectedSourcePages.length === 0}
            className="w-full md:w-auto px-8 py-4 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-black rounded-2xl shadow-lg shadow-rose-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-3 text-lg"
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <ArrowRight size={22} />}
            ページの差し込みを実行
          </button>
        </div>
      )}

      <PrivacyBadge />
    </div>
  )
}
