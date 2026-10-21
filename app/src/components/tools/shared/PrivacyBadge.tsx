import { ShieldCheck } from 'lucide-react'
import { t } from '../../../i18n/ja'

export default function PrivacyBadge() {
  return (
    <div className="mt-12 pt-6 border-t border-gray-100 dark:border-zinc-900 flex flex-col items-center gap-4">
      <div className="flex items-center gap-3 px-5 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-full border border-emerald-200 dark:border-emerald-800">
        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{t.privacy.badge}</span>
      </div>
    </div>
  )
}