/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { CSSProperties, useState } from 'react'
import { Hash } from 'lucide-react'
import { toast } from 'sonner'

import { useDocument } from '../../../document/documentSession'
import { t } from '../../../i18n/ja'
import {
  formatPageNumber,
  pageNumberOperation,
  PageNumberOptions,
  PageNumberPosition,
} from '../../../operations/pageNumberOp'
import { toUserMessage } from '../../../utils/userMessage'
import RangeField from './RangeField'

const DEFAULT_PAGE_NUMBER: PageNumberOptions = {
  format: t.viewer.pageNumberDefaultFormat,
  startNumber: 1,
  position: 'bottom-center',
  color: '#6B7280',
  fontSize: 12,
}

const PAGE_NUMBER_POSITIONS: Array<{ id: PageNumberPosition, label: string }> = [
  { id: 'top-left', label: t.viewer.positionTopLeft },
  { id: 'top-center', label: t.viewer.positionTopCenter },
  { id: 'top-right', label: t.viewer.positionTopRight },
  { id: 'bottom-left', label: t.viewer.positionBottomLeft },
  { id: 'bottom-center', label: t.viewer.positionBottomCenter },
  { id: 'bottom-right', label: t.viewer.positionBottomRight },
]

/** 全ページへ通し番号を入れる設定。適用に成功したら onApplied を呼ぶ */
export default function PageNumberSettings({ onApplied }: { onApplied: () => void }) {
  const { applyOperation, isBusy } = useDocument()
  const [options, setOptions] = useState<PageNumberOptions>(DEFAULT_PAGE_NUMBER)

  const setOption = <K extends keyof PageNumberOptions>(key: K, value: PageNumberOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  const handleApply = async () => {
    try {
      const applied = await applyOperation((input) => pageNumberOperation(input, options))
      if (applied) {
        toast.success(t.viewer.pageNumberAppliedToast)
        onApplied()
      }
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
    }
  }

  const previewStyle: CSSProperties = {
    position: 'absolute',
    color: options.color,
    fontSize: `${Math.max(10, Math.min(22, options.fontSize))}px`,
  }
  if (options.position.startsWith('top')) previewStyle.top = '12px'
  else previewStyle.bottom = '12px'
  if (options.position.endsWith('left')) previewStyle.left = '12px'
  else if (options.position.endsWith('right')) previewStyle.right = '12px'
  else {
    previewStyle.left = '50%'
    previewStyle.transform = 'translateX(-50%)'
  }

  const firstLabel = formatPageNumber(
    options.format,
    options.startNumber,
    options.startNumber,
  )
  const valid = options.format.trim() && options.format.includes('{n}')
    && Number.isInteger(options.startNumber)
    && options.startNumber >= 1
    && options.startNumber <= 999_999

  return (
    <div className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-black text-gray-700 dark:text-zinc-200">
          <Hash size={16} className="text-rose-500" />
          {t.tools.pageNumber.title}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">
          {t.viewer.pageNumberHint}
        </p>
      </div>

      <div
        aria-hidden="true"
        className="relative min-h-24 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 p-3 font-bold dark:border-zinc-800 dark:bg-black"
      >
        <span style={previewStyle}>{firstLabel || t.viewer.pageNumberPreviewEmpty}</span>
      </div>

      <div>
        <label htmlFor="page-number-format" className="block text-xs font-bold text-gray-500 dark:text-zinc-300">
          {t.viewer.pageNumberFormatLabel}
        </label>
        <input
          id="page-number-format"
          type="text"
          maxLength={100}
          value={options.format}
          disabled={isBusy}
          onChange={(event) => setOption('format', event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-transparent bg-gray-100 px-3 py-2.5 text-sm font-bold outline-none focus:border-rose-500 dark:bg-black dark:text-white"
        />
        <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
          {t.viewer.pageNumberFormatHint}
        </p>
      </div>

      <div>
        <label htmlFor="page-number-start" className="block text-xs font-bold text-gray-500 dark:text-zinc-300">
          {t.viewer.pageNumberStartLabel}
        </label>
        <input
          id="page-number-start"
          type="number"
          min={1}
          max={999999}
          step={1}
          value={options.startNumber}
          disabled={isBusy}
          onChange={(event) => setOption('startNumber', Number(event.target.value))}
          className="mt-1.5 w-full rounded-xl border border-transparent bg-gray-100 px-3 py-2.5 text-sm font-bold outline-none focus:border-rose-500 dark:bg-black dark:text-white"
        />
      </div>

      <fieldset>
        <legend className="text-xs font-bold text-gray-500 dark:text-zinc-300">
          {t.viewer.pageNumberPositionLabel}
        </legend>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {PAGE_NUMBER_POSITIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={options.position === id}
              onClick={() => setOption('position', id)}
              disabled={isBusy}
              className={`rounded-xl px-1 py-2.5 text-xs font-bold transition-all disabled:opacity-40 ${
                options.position === id
                  ? 'bg-rose-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-400 hover:text-rose-500 dark:bg-zinc-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="page-number-color" className="text-xs font-bold text-gray-500 dark:text-zinc-300">
          {t.viewer.pageNumberColorLabel}
        </label>
        <input
          id="page-number-color"
          type="color"
          value={options.color}
          disabled={isBusy}
          onChange={(event) => setOption('color', event.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border-0 bg-transparent disabled:cursor-not-allowed"
        />
      </div>

      <RangeField
        id="page-number-size"
        label={t.viewer.pageNumberSizeLabel}
        value={options.fontSize}
        suffix="pt"
        min={8}
        max={72}
        step={1}
        disabled={isBusy}
        onChange={(value) => setOption('fontSize', value)}
      />

      <button
        type="button"
        onClick={handleApply}
        disabled={isBusy || !valid}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3.5 text-sm font-black text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Hash size={16} />
        {t.viewer.apply}
      </button>
    </div>
  )
}
