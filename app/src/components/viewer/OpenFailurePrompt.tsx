import { useState } from 'react'
import { FileWarning, KeyRound, Loader2, Wrench } from 'lucide-react'
import { toast } from 'sonner'

import { useDocument, type OpenFailureState } from '../../document/documentSession'
import { repairPdfBytes } from '../../operations/repairPdf'
import { OperationError } from '../../operations/types'
import { removePdfProtection } from '../../security/pdfProtection'
import { t } from '../../i18n/ja'
import { toUserMessage } from '../../utils/userMessage'

export default function OpenFailurePrompt({ failure }: { failure: OpenFailureState }) {
  const { openDocument, dismissOpenFailure, isBusy } = useDocument()
  const [password, setPassword] = useState('')
  const [isWorking, setIsWorking] = useState(false)

  const repair = async () => {
    setIsWorking(true)
    try {
      const repaired = await repairPdfBytes(failure.bytes)
      await openDocument(repaired, `${failure.name}-修復`, {
        isDirty: true,
        failureSource: failure,
      })
      toast.success(t.viewer.repairSucceeded)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof OperationError ? error.message : t.viewer.repairFailed)
    } finally {
      setIsWorking(false)
    }
  }

  const unlock = async () => {
    if (!password && failure.reason !== 'editing-protected') return
    setIsWorking(true)
    try {
      const unlocked = await removePdfProtection(failure.bytes, password)
      await openDocument(unlocked, failure.name, {
        isDirty: true,
        failureSource: failure,
      })
      setPassword('')
    } catch (error) {
      console.error(error)
      toast.error(toUserMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  const processing = isWorking || isBusy
  const passwordProtected = failure.reason === 'password-protected'
  const editingRestricted = failure.reason === 'editing-restricted'
  const editingProtected = failure.reason === 'editing-protected'
  const canUnlock = passwordProtected || editingRestricted || editingProtected
  const needsPassword = passwordProtected || editingRestricted
  const title = editingRestricted
    ? t.viewer.editingRestrictedTitle
    : editingProtected
      ? t.viewer.editingProtectedTitle
      : passwordProtected ? t.viewer.passwordTitle : t.viewer.openFailedTitle
  const explanation = editingRestricted
    ? t.viewer.editingRestrictedExplanation
    : editingProtected
      ? t.viewer.editingProtectedExplanation
      : passwordProtected ? t.viewer.passwordExplanation : t.viewer.repairExplanation

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <section className="w-full max-w-lg rounded-[2rem] bg-white p-7 shadow-2xl dark:bg-zinc-900 sm:p-9">
        <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${
          canUnlock
            ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20'
            : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20'
        }`}>
          {canUnlock ? <KeyRound size={26} /> : <FileWarning size={26} />}
        </div>

        <p className="mb-1 truncate text-xs font-bold text-gray-400">{failure.name}.pdf</p>
        <h1 className="text-xl font-black text-gray-800 dark:text-white">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-zinc-400">
          {explanation}
        </p>
        {canUnlock ? (
          <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            {t.viewer.protectionRemovalSignatureWarning}
          </p>
        ) : null}

        {needsPassword ? (
          <label className="mt-6 block text-xs font-bold text-gray-600 dark:text-zinc-300">
            {editingRestricted ? t.viewer.ownerPasswordLabel : t.viewer.passwordLabel}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void unlock() }}
              disabled={processing}
              autoComplete="current-password"
              autoFocus
              className="mt-2 w-full rounded-2xl bg-gray-50 px-4 py-3 text-base font-bold outline-none ring-rose-400 focus:ring-2 disabled:opacity-50 dark:bg-black dark:text-white"
            />
          </label>
        ) : null}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={dismissOpenFailure}
            disabled={processing}
            className="rounded-2xl px-5 py-3 text-sm font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-black"
          >
            {t.viewer.chooseAnotherPdf}
          </button>
          <button
            type="button"
            onClick={canUnlock ? unlock : repair}
            disabled={processing || (needsPassword && !password)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-3 text-sm font-black text-white hover:bg-rose-600 disabled:opacity-40"
          >
            {processing
              ? <Loader2 size={18} className="animate-spin" />
              : canUnlock ? <KeyRound size={18} /> : <Wrench size={18} />}
            {processing
              ? canUnlock ? t.viewer.unlocking : t.viewer.repairing
              : canUnlock ? t.viewer.unlockAndOpen : t.viewer.tryRepair}
          </button>
        </div>
      </section>
    </div>
  )
}
