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
import { Type } from 'lucide-react'
import { toast } from 'sonner'

import { useDocument } from '../../../document/documentSession'
import { t } from '../../../i18n/ja'
import { watermarkOperation, WatermarkOptions } from '../../../operations/watermarkOp'
import { toUserMessage } from '../../../utils/userMessage'
import RangeField from './RangeField'

const DEFAULT_WATERMARK: WatermarkOptions = {
  text: t.viewer.watermarkDefaultText,
  color: '#F43F5E',
  opacity: 0.3,
  fontSize: 50,
  rotation: -45,
}

/** 全ページの中央へ文字の透かしを重ねる設定。適用に成功したら onApplied を呼ぶ */
export default function WatermarkSettings({ onApplied }: { onApplied: () => void }) {
  const { applyOperation, isBusy } = useDocument()
  const [options, setOptions] = useState<WatermarkOptions>(DEFAULT_WATERMARK)

  const setOption = <K extends keyof WatermarkOptions>(key: K, value: WatermarkOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  const handleApply = async () => {
    try {
      const applied = await applyOperation((input) => watermarkOperation(input, options))
      if (applied) {
        toast.success(t.viewer.watermarkAppliedToast)
        onApplied()
      }
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-black text-gray-700 dark:text-zinc-200">
          <Type size={16} className="text-rose-500" />
          {t.tools.watermark.title}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">
          {t.viewer.watermarkHint}
        </p>
      </div>

      <div
        aria-hidden="true"
        className="min-h-24 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-zinc-800 dark:bg-black"
      >
        <div className="flex min-h-16 items-center justify-center overflow-hidden">
          <span
            className="max-w-full break-all text-center font-black leading-none"
            style={{
              color: options.color,
              opacity: options.opacity,
              fontSize: `${Math.max(12, Math.min(32, options.fontSize / 2))}px`,
              transform: `rotate(${options.rotation}deg)`,
            }}
          >
            {options.text || t.viewer.watermarkPreviewEmpty}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="watermark-text" className="block text-xs font-bold text-gray-500 dark:text-zinc-300">
          {t.viewer.watermarkTextLabel}
        </label>
        <input
          id="watermark-text"
          type="text"
          maxLength={100}
          value={options.text}
          disabled={isBusy}
          onChange={(event) => setOption('text', event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-transparent bg-gray-100 px-3 py-2.5 text-sm font-bold outline-none focus:border-rose-500 dark:bg-black dark:text-white"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="watermark-color" className="text-xs font-bold text-gray-500 dark:text-zinc-300">
          {t.viewer.watermarkColorLabel}
        </label>
        <input
          id="watermark-color"
          type="color"
          value={options.color}
          disabled={isBusy}
          onChange={(event) => setOption('color', event.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border-0 bg-transparent disabled:cursor-not-allowed"
        />
      </div>

      <div className="space-y-4">
        <RangeField
          id="watermark-opacity"
          label={t.viewer.watermarkOpacityLabel}
          value={Math.round(options.opacity * 100)}
          suffix="%"
          min={10}
          max={100}
          step={10}
          disabled={isBusy}
          onChange={(value) => setOption('opacity', value / 100)}
        />
        <RangeField
          id="watermark-size"
          label={t.viewer.watermarkSizeLabel}
          value={options.fontSize}
          suffix="pt"
          min={10}
          max={200}
          step={1}
          disabled={isBusy}
          onChange={(value) => setOption('fontSize', value)}
        />
        <RangeField
          id="watermark-rotation"
          label={t.viewer.watermarkRotationLabel}
          value={options.rotation}
          suffix="°"
          min={-180}
          max={180}
          step={5}
          disabled={isBusy}
          onChange={(value) => setOption('rotation', value)}
        />
      </div>

      <button
        type="button"
        onClick={handleApply}
        disabled={isBusy || !options.text.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3.5 text-sm font-black text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Type size={16} />
        {t.viewer.apply}
      </button>
    </div>
  )
}
