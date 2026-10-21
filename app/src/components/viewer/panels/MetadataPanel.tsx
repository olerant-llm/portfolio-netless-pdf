/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useEffect, useState } from 'react'
import { Edit3, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { useDocument } from '../../../document/documentSession'
import { t } from '../../../i18n/ja'
import {
  inspectMetadata,
  MetadataValues,
  removePersonalMetadataOperation,
  updateMetadataOperation,
} from '../../../operations/metadataOp'
import { toUserMessage } from '../../../utils/userMessage'

const EMPTY_METADATA: MetadataValues = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
}

const FIELDS: Array<{ key: keyof MetadataValues, label: string }> = [
  { key: 'title', label: t.viewer.metadataTitleLabel },
  { key: 'author', label: t.viewer.metadataAuthorLabel },
  { key: 'subject', label: t.viewer.metadataSubjectLabel },
  { key: 'keywords', label: t.viewer.metadataKeywordsLabel },
  { key: 'creator', label: t.viewer.metadataCreatorLabel },
  { key: 'producer', label: t.viewer.metadataProducerLabel },
]

/** onApplied は、変更の反映か個人情報の消去に成功したときだけ呼ぶ */
export default function MetadataPanel({ onApplied }: { onApplied?: () => void } = {}) {
  const { doc, applyOperation, isBusy } = useDocument()
  const [values, setValues] = useState<MetadataValues>(EMPTY_METADATA)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!doc) return
    let active = true
    setLoading(true)
    inspectMetadata(doc.bytes).then((metadata) => {
      if (!active) return
      const { creationDate: _created, modificationDate: _modified, ...fields } = metadata
      setValues(fields)
    }).catch((err) => {
      console.error(err)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [doc])

  const update = async () => {
    try {
      const applied = await applyOperation((input) => updateMetadataOperation(input, values))
      if (applied) {
        toast.success(t.viewer.metadataUpdatedToast)
        onApplied?.()
      }
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
    }
  }

  const removePersonal = async () => {
    try {
      const applied = await applyOperation(removePersonalMetadataOperation)
      if (applied) {
        toast.success(t.viewer.metadataRemovedToast)
        onApplied?.()
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
          <Edit3 size={16} className="text-rose-500" />
          {t.viewer.metadataHeading}
        </h3>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
          {t.viewer.metadataHint}
        </p>
      </div>

      <div className="space-y-3">
        {FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label
              htmlFor={`metadata-${key}`}
              className="block text-[11px] font-bold text-gray-500 dark:text-zinc-300"
            >
              {label}
            </label>
            <input
              id={`metadata-${key}`}
              type="text"
              maxLength={500}
              value={values[key]}
              disabled={isBusy || loading}
              onChange={(event) => setValues((current) => ({
                ...current,
                [key]: event.target.value,
              }))}
              className="mt-1.5 w-full rounded-xl border border-transparent bg-gray-100 px-3 py-2.5 text-sm font-bold outline-none focus:border-rose-500 disabled:opacity-50 dark:bg-black dark:text-white"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={update}
        disabled={isBusy || loading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-3.5 text-sm font-black text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Edit3 size={16} />
        {t.viewer.metadataApply}
      </button>

      <div className="border-t border-gray-100 pt-5 dark:border-zinc-800">
        <p className="text-[11px] leading-relaxed text-gray-400">
          {t.viewer.metadataRemoveHint}
        </p>
        <button
          type="button"
          onClick={removePersonal}
          disabled={isBusy || loading}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ShieldCheck size={16} />
          {t.viewer.metadataRemove}
        </button>
      </div>
    </div>
  )
}
