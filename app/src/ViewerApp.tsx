import { useCallback, useEffect, useRef, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Toaster, toast } from 'sonner'

import { type Theme } from './types'
import { DocumentProvider, useDocument } from './document/documentSession'
import DocumentViewer from './components/viewer/DocumentViewer'
import UnsavedGuard from './components/viewer/UnsavedGuard'
import { openPdfFile } from './components/viewer/openPdf'
import ScrollToTop from './components/ScrollToTop'
import ViewerLayout from './ViewerLayout'
import { t } from './i18n/ja'
import { ACTIVE_ROUTES } from './appRoutes'

function ViewerShell({ theme, toggleTheme }: {
  theme: Exclude<Theme, 'system'>
  toggleTheme: () => void
}) {
  const { doc, openDocument } = useDocument()
  const navigate = useNavigate()
  const [showWindowCloseGuard, setShowWindowCloseGuard] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const isDirtyRef = useRef(false)

  useEffect(() => { isDirtyRef.current = doc?.isDirty ?? false }, [doc?.isDirty])

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return
    const unlisten = getCurrentWindow().onCloseRequested((event) => {
      if (isDirtyRef.current) {
        event.preventDefault()
        setShowWindowCloseGuard(true)
      }
    })
    return () => { unlisten.then((stop) => stop()) }
  }, [])

  const openInViewer = useCallback((file: File) => {
    navigate('/')
    void openPdfFile(file, openDocument)
  }, [navigate, openDocument])

  const handleFileDrop = useCallback((files: FileList) => {
    const file = files[0]
    if (!file) return
    if (doc?.isDirty) {
      setPendingFile(file)
      return
    }
    openInViewer(file)
  }, [doc?.isDirty, openInViewer])

  return (
    <ViewerLayout theme={theme} toggleTheme={toggleTheme} onFileDrop={handleFileDrop}>
      <Toaster
        position="bottom-center"
        expand
        richColors
        duration={2500}
        toastOptions={{ className: 'dark:bg-zinc-900 dark:text-white dark:border-white/10' }}
      />

      <Routes>
        <Route path={ACTIVE_ROUTES[0]} element={<DocumentViewer />} />
        <Route path={ACTIVE_ROUTES[1]} element={<DocumentViewer />} />
        <Route path={ACTIVE_ROUTES[2]} element={<Navigate to="/" replace />} />
      </Routes>

      {showWindowCloseGuard ? (
        <UnsavedGuard
          onDiscard={() => {
            getCurrentWindow().destroy().catch((error) => {
              console.error(error)
              toast.error(t.errors.closeFailed)
            })
          }}
          onCancel={() => setShowWindowCloseGuard(false)}
        />
      ) : pendingFile ? (
        <UnsavedGuard
          body={t.viewer.unsavedOpenBody}
          discardLabel={t.viewer.unsavedOpenDiscard}
          onDiscard={() => {
            const file = pendingFile
            setPendingFile(null)
            openInViewer(file)
          }}
          onCancel={() => setPendingFile(null)}
        />
      ) : null}
    </ViewerLayout>
  )
}

export default function ViewerApp() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme | null
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const resolvedTheme = theme === 'system' ? systemTheme : theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
    localStorage.setItem('theme', theme)
  }, [resolvedTheme, theme])

  const toggleTheme = () => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')

  return (
    <HashRouter>
      <ScrollToTop />
      <DocumentProvider>
        <ViewerShell theme={resolvedTheme} toggleTheme={toggleTheme} />
      </DocumentProvider>
    </HashRouter>
  )
}
