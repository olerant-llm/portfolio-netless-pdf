/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useState } from 'react'
import { Crop, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { DocumentState, useDocument } from '../../../document/documentSession'
import { cropOperation, CropMargins } from '../../../operations/cropOp'
import { t } from '../../../i18n/ja'
import { toUserMessage } from '../../../utils/userMessage'

interface CropSettingsProps {
  doc: DocumentState
  selected: Set<string>
  /** 適用に成功したときだけ呼ぶ */
  onApplied: () => void
}

const MARGIN_KEYS = ['top', 'bottom', 'left', 'right'] as const

const MARGIN_LABELS: Record<(typeof MARGIN_KEYS)[number], string> = {
  top: t.tools.crop.ui.marginTop,
  bottom: t.tools.crop.ui.marginBottom,
  left: t.tools.crop.ui.marginLeft,
  right: t.tools.crop.ui.marginRight,
}

const NO_MARGINS: CropMargins = { top: 0, bottom: 0, left: 0, right: 0 }

/** 四辺の余白を切り落とす設定。 */
export default function CropSettings({ doc, selected, onApplied }: CropSettingsProps) {
  const { applyOperation, isBusy } = useDocument()
  const [margins, setMargins] = useState<CropMargins>({ top: 20, bottom: 20, left: 20, right: 20 })
  const [manualRange, setManualRange] = useState<'selected' | 'all' | null>(null)
  const range = manualRange ?? (selected.size > 0 ? 'selected' : 'all')

  const targets = () => doc.pageIds.filter((id) => selected.has(id))

  const run = async (task: () => Promise<void>) => {
    try {
      await task()
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
    }
  }

  const handleCrop = () => run(async () => {
    if (range === 'selected' && selected.size === 0) {
      toast.error(t.viewer.noSelection)
      return
    }
    const applied = await applyOperation((input) =>
      cropOperation(input, range === 'all' ? [] : targets(), margins)
    )
    if (applied) {
      toast.success(t.viewer.croppedToast)
      onApplied()
    }
  })

  const choiceClass = (active: boolean) =>
    `py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
      active
        ? 'bg-rose-500 text-white shadow-md'
        : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 hover:text-rose-500'
    }`

  return (
    <div className="space-y-5">
          <p className="text-xs text-gray-400 leading-relaxed">{t.viewer.cropHint}</p>

          <div className="space-y-3">
            {MARGIN_KEYS.map((key) => (
              <div key={key}>
                <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                  <span>{MARGIN_LABELS[key]}</span>
                  <span>{margins[key]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={margins[key]}
                  disabled={isBusy}
                  onChange={(event) => setMargins({ ...margins, [key]: Number(event.target.value) })}
                  className="w-full accent-rose-500"
                />
              </div>
            ))}

            <button
              type="button"
              onClick={() => setMargins(NO_MARGINS)}
              disabled={isBusy}
              className="text-xs text-gray-400 hover:text-rose-500 font-bold flex items-center gap-1 transition-colors disabled:opacity-30"
            >
              <RefreshCw size={12} />
              {t.viewer.cropReset}
            </button>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 space-y-2">
            <label className="block text-xs font-bold text-gray-400">
              {t.viewer.applyRangeLabel}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={range === 'selected'}
                onClick={() => setManualRange('selected')}
                disabled={isBusy}
                className={choiceClass(range === 'selected')}
              >
                {t.viewer.applyToSelected}
              </button>
              <button
                type="button"
                aria-pressed={range === 'all'}
                onClick={() => setManualRange('all')}
                disabled={isBusy}
                className={choiceClass(range === 'all')}
              >
                {t.viewer.applyToAll}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCrop}
            disabled={isBusy}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Crop size={16} />
            {t.viewer.apply}
          </button>
    </div>
  )
}
