import { useState } from 'react'
import { useReportBusy } from '../toolbar/useReportBusy'
import { KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { type DocumentState, useDocument } from '../../../document/documentSession'
import { protectPdfBytes } from '../../../security/pdfProtection'
import { t } from '../../../i18n/ja'
import { downloadFile } from '../../../utils/pdfHelpers'
import { toUserMessage } from '../../../utils/userMessage'

interface PasswordSaveSettingsProps {
  doc: DocumentState
  /** 保存に成功したときだけ呼ぶ */
  onSaved: () => void
  /** 処理中かどうかを外側の小窓へ知らせる */
  onBusyChange?: (busy: boolean) => void
}

/** 保存するファイルだけをパスワードで保護する。編集中のPDFは通常のまま */
export default function PasswordSaveSettings({ doc, onSaved, onBusyChange }: PasswordSaveSettingsProps) {
  const { isBusy, markSaved } = useDocument()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  useReportBusy(isSaving, onBusyChange)

  const saveWithPassword = async () => {
    if (!password || password !== confirmation) return
    setIsSaving(true)
    try {
      // 保護したデータは保存にだけ使う。doc.bytes は通常のままなので編集を続けられる。
      const protectedBytes = await protectPdfBytes(doc.bytes, password)
      const saved = await downloadFile(protectedBytes, `${doc.name}-パスワード付き.pdf`, 'application/pdf')
      if (saved) {
        markSaved()
        toast.success(t.viewer.savedToast)
        setPassword('')
        setConfirmation('')
        onSaved()
      } else {
        toast.info(t.viewer.saveCanceled)
      }
    } catch (error) {
      console.error(error)
      toast.error(toUserMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const processing = isBusy || isSaving
  const mismatch = confirmation.length > 0 && password !== confirmation

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-gray-400">{t.viewer.passwordSaveHint}</p>

      <label className="mt-4 block text-xs font-bold text-gray-500 dark:text-zinc-300">
        {t.viewer.newPasswordLabel}
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={processing}
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-400 dark:bg-black dark:text-white"
        />
      </label>
      <label className="mt-3 block text-xs font-bold text-gray-500 dark:text-zinc-300">
        {t.viewer.confirmPasswordLabel}
        <input
          type="password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={processing}
          autoComplete="new-password"
          aria-invalid={mismatch}
          className="mt-1.5 w-full rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-400 dark:bg-black dark:text-white"
        />
      </label>
      <p aria-live="polite" className="min-h-4 text-xs font-bold text-rose-600">
        {mismatch ? t.viewer.passwordMismatch : ''}
      </p>

      <button
        type="button"
        onClick={saveWithPassword}
        disabled={processing || !password || password !== confirmation}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3.5 text-sm font-black text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 disabled:opacity-40"
      >
        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
        {t.viewer.passwordSaveButton}
      </button>
    </div>
  )
}
