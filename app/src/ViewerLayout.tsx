import { useEffect, useState, type ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'

import { type Theme } from './types'
import { PaperKnifeLogo } from './components/Logo'
import { t } from './i18n/ja'

interface Props {
  children: ReactNode
  theme: Exclude<Theme, 'system'>
  toggleTheme: () => void
  onFileDrop: (files: FileList) => void
}

const isFileDrag = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files')

/** Windows版の共通画面だけを包む、製品用の最小レイアウト。 */
export default function ViewerLayout({ children, theme, toggleTheme, onFileDrop }: Props) {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const dragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      setIsDragging(true)
    }
    const dragLeave = (event: DragEvent) => {
      if (
        event.clientX <= 0 || event.clientY <= 0
        || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight
      ) setIsDragging(false)
    }
    const drop = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      setIsDragging(false)
      if (event.dataTransfer?.files.length) onFileDrop(event.dataTransfer.files)
    }

    window.addEventListener('dragover', dragOver)
    window.addEventListener('dragleave', dragLeave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', dragOver)
      window.removeEventListener('dragleave', dragLeave)
      window.removeEventListener('drop', drop)
    }
  }, [onFileDrop])

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA] text-gray-900 dark:bg-black dark:text-white">
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-[800] flex items-center justify-center bg-rose-500/90 p-8 text-center text-2xl font-black text-white backdrop-blur-sm">
          {t.viewer.dropOverlay}
        </div>
      )}

      <header className="sticky top-0 z-[80] border-b border-gray-100 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80">
            <PaperKnifeLogo size={28} iconColor="#F43F5E" />
            <span className="text-xl font-black tracking-tight">{t.app.name}</span>
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? t.app.useDarkTheme : t.app.useLightTheme}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-rose-500 dark:hover:bg-zinc-900"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>
      </header>

      <main className="min-w-0 flex-1">{children}</main>

      <footer className="mt-12 border-t border-gray-100 bg-white dark:border-white/5 dark:bg-black">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-gray-400 sm:flex-row">
          <span className="flex items-center gap-2 font-bold text-gray-600 dark:text-zinc-300">
            <PaperKnifeLogo size={18} iconColor="#F43F5E" partColor="currentColor" />
            {t.app.name}
          </span>
          <span>{t.privacy.badge}</span>
        </div>
      </footer>
    </div>
  )
}
