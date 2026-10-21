import { useState, useRef, useEffect } from 'react'
import { Crop, Loader2, Scissors, RefreshCw, Check } from 'lucide-react'
import { toast } from 'sonner'

import { getPdfMetaData, loadPdfDocument } from '../../utils/pdfHelpers'
import { cropPages, CropMargins } from '../../utils/pageCrop'
import { addActivity } from '../../utils/recentActivity'
import { t } from '../../i18n/ja'
import PrivacyBadge from './shared/PrivacyBadge'
import SuccessState from './shared/SuccessState'

type CropPdfData = {
  file: File
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
      <div className="w-full h-36 bg-gray-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center animate-pulse">
        <Loader2 className="animate-spin text-gray-400" size={20} />
      </div>
    )
  }

  return (
    <img src={url} alt={`Page ${pageNum}`} className="w-full h-auto max-h-48 object-contain rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm" />
  )
}

export default function CropTool() {
  const [pdfData, setPdfData] = useState<CropPdfData | null>(null)
  const [margins, setMargins] = useState<CropMargins>({ top: 20, bottom: 20, left: 20, right: 20 })
  const [applyMode, setApplyMode] = useState<'all' | 'selected'>('all')
  const [selectedPages, setSelectedPages] = useState<number[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [customFileName, setCustomFileName] = useState('トリミング済み')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error(t.errors.notPdf)
      return
    }
    setIsProcessing(true)
    try {
      const meta = await getPdfMetaData(file)
      if (meta.isLocked) {
        toast.error(t.errors.locked)
        return
      }
      const pdfDoc = await loadPdfDocument(file)
      setPdfData({ file, pageCount: meta.pageCount, pdfDoc })
      setSelectedPages(Array.from({ length: meta.pageCount }, (_, i) => i))
      setCustomFileName(`${file.name.replace('.pdf', '')}-トリミング済み`)
    } catch (err) {
      toast.error(t.errors.broken)
    } finally {
      setIsProcessing(false)
    }
  }

  const togglePageSelection = (idx: number) => {
    if (selectedPages.includes(idx)) {
      setSelectedPages(selectedPages.filter(p => p !== idx))
    } else {
      setSelectedPages([...selectedPages, idx].sort((a, b) => a - b))
    }
  }

  const handleExecuteCrop = async () => {
    if (!pdfData) return
    const targetPages = applyMode === 'all' 
      ? Array.from({ length: pdfData.pageCount }, (_, i) => i) 
      : selectedPages

    if (targetPages.length === 0) {
      toast.error('トリミング対象のページを1つ以上選択してください。')
      return
    }

    setIsProcessing(true)
    try {
      const arrayBuffer = await pdfData.file.arrayBuffer()
      const resultBytes = await cropPages(new Uint8Array(arrayBuffer), targetPages, margins)
      const blob = new Blob([resultBytes as any], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setDownloadUrl(url)
      addActivity({ name: `${customFileName}.pdf`, tool: 'Crop PDF', size: blob.size, resultUrl: url })
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
          message="余白のトリミングが完了しました！"
          downloadUrl={downloadUrl}
          fileName={`${customFileName}.pdf`}
          onStartOver={() => {
            setDownloadUrl(null)
            setPdfData(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black dark:text-white mb-2">{t.tools.crop.title}</h1>
        <p className="text-gray-500 dark:text-zinc-400 text-sm">{t.tools.crop.desc}</p>
      </div>

      {!pdfData ? (
        <div className="max-w-xl mx-auto">
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-[320px] bg-white dark:bg-zinc-900 border-3 border-dashed border-gray-200 dark:border-zinc-800 rounded-[2.5rem] p-12 flex flex-col items-center justify-center hover:border-rose-500 transition-all shadow-xl group"
          >
            <div className="w-20 h-20 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Crop size={40} />
            </div>
            <span className="font-bold text-lg dark:text-white mb-2">{t.common.selectPdf}</span>
            <span className="text-xs text-gray-400 font-medium">{t.common.dropHere}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左側: 余白コントロールパラメータ */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-gray-100 dark:border-zinc-800 shadow-xl space-y-6">
              <h2 className="text-sm font-black text-rose-500 uppercase tracking-widest flex items-center gap-2">
                <Scissors size={18} /> 余白カット幅の指定
              </h2>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                    <span>{t.tools.crop.ui.marginTop}</span>
                    <span>{margins.top} pt</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    value={margins.top}
                    onChange={(e) => setMargins({ ...margins, top: Number(e.target.value) })}
                    className="w-full accent-rose-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                    <span>{t.tools.crop.ui.marginBottom}</span>
                    <span>{margins.bottom} pt</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    value={margins.bottom}
                    onChange={(e) => setMargins({ ...margins, bottom: Number(e.target.value) })}
                    className="w-full accent-rose-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                    <span>{t.tools.crop.ui.marginLeft}</span>
                    <span>{margins.left} pt</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    value={margins.left}
                    onChange={(e) => setMargins({ ...margins, left: Number(e.target.value) })}
                    className="w-full accent-rose-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                    <span>{t.tools.crop.ui.marginRight}</span>
                    <span>{margins.right} pt</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={150}
                    value={margins.right}
                    onChange={(e) => setMargins({ ...margins, right: Number(e.target.value) })}
                    className="w-full accent-rose-500"
                  />
                </div>

                <button
                  onClick={() => setMargins({ top: 0, bottom: 0, left: 0, right: 0 })}
                  className="text-xs text-gray-400 hover:text-rose-500 font-bold flex items-center gap-1 transition-colors"
                >
                  <RefreshCw size={12} /> 余白数値をリセット
                </button>
              </div>

              {/* 対象ページ選択モード */}
              <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 space-y-3">
                <label className="block text-xs font-bold text-gray-400">適用範囲</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setApplyMode('all')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${applyMode === 'all' ? 'bg-rose-500 text-white shadow-md' : 'bg-gray-100 dark:bg-zinc-800 text-gray-400'}`}
                  >
                    {t.tools.crop.ui.allPages}
                  </button>
                  <button
                    onClick={() => setApplyMode('selected')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${applyMode === 'selected' ? 'bg-rose-500 text-white shadow-md' : 'bg-gray-100 dark:bg-zinc-800 text-gray-400'}`}
                  >
                    {t.tools.crop.ui.selectedPages}
                  </button>
                </div>
              </div>
            </div>

            {/* 保存指定エリア */}
            <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-gray-100 dark:border-zinc-800 shadow-xl space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2">{t.common.fileName}</label>
                <input
                  type="text"
                  value={customFileName}
                  onChange={(e) => setCustomFileName(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 font-bold text-sm dark:text-white outline-none focus:border-rose-500"
                />
              </div>

              <button
                onClick={handleExecuteCrop}
                disabled={isProcessing}
                className="w-full py-4 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-black rounded-2xl shadow-lg shadow-rose-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-base"
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <Crop size={20} />}
                トリミングを実行して保存
              </button>
            </div>
          </div>

          {/* 右側: プレビュー ＆ ページ選択一覧 */}
          <div className="lg:col-span-8 bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-gray-100 dark:border-zinc-800 shadow-xl">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100 dark:border-zinc-800">
              <span className="font-bold truncate text-sm dark:text-white">{pdfData.file.name}</span>
              <span className="text-xs font-bold text-gray-400">{pdfData.pageCount} ページ</span>
            </div>

            <p className="text-xs font-bold text-gray-400 mb-4">
              {applyMode === 'all' ? 'すべてのページに設定したトリミング枠が適用されます。' : 'トリミングしたいページをクリックして選択してください:'}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto pr-2 scrollbar-hide">
              {Array.from({ length: pdfData.pageCount }).map((_, i) => {
                const isSelected = applyMode === 'all' || selectedPages.includes(i)
                return (
                  <button
                    key={i}
                    disabled={applyMode === 'all'}
                    onClick={() => togglePageSelection(i)}
                    className={`relative flex flex-col items-center p-3 rounded-2xl border-2 transition-all ${isSelected ? 'border-rose-500 bg-rose-50/20 dark:bg-rose-900/10' : 'border-gray-100 dark:border-zinc-800 opacity-40'}`}
                  >
                    <div className="w-full mb-2 relative overflow-hidden rounded-lg">
                      <LazyThumbnail pdfDoc={pdfData.pdfDoc} pageNum={i + 1} />
                      {/* 赤点線でのトリミング枠視覚ガイド表示 */}
                      {isSelected && (margins.top > 0 || margins.bottom > 0 || margins.left > 0 || margins.right > 0) && (
                        <div
                          className="absolute border-2 border-dashed border-rose-500 pointer-events-none"
                          style={{
                            top: `${Math.min(30, margins.top / 4)}%`,
                            bottom: `${Math.min(30, margins.bottom / 4)}%`,
                            left: `${Math.min(30, margins.left / 4)}%`,
                            right: `${Math.min(30, margins.right / 4)}%`,
                          }}
                        />
                      )}
                    </div>
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">ページ {i + 1}</span>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-xs font-black shadow-md">
                        <Check size={12} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <PrivacyBadge />
    </div>
  )
}
