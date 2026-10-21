import { useEffect, useRef } from 'react'
import { RotateCcw, RotateCw, Trash2, FileOutput, ZoomIn } from 'lucide-react'
import { t } from '../../../i18n/ja'
import { menuItemClass } from './ui'
import { nextMenuIndex } from './menuKeys'

interface PageContextMenuProps {
  x: number
  y: number
  onRotate: (delta: 90 | -90) => void
  onDelete: () => void
  onExtract: () => void
  onZoom: () => void
  onClose: () => void
}

const MENU_WIDTH = 240
const MENU_HEIGHT = 260

/** ページの右クリックメニュー。選んだら閉じる。外側クリック・スクロール・Esc でも閉じる */
export default function PageContextMenu({
  x, y, onRotate, onDelete, onExtract, onZoom, onClose,
}: PageContextMenuProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  // 画面が描き直されても、開いたときの1回だけ準備する（フォーカスが1項目目へ戻らないように）
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const items = [
    { label: t.viewer.toolRotateLeft, Icon: RotateCcw, run: () => onRotate(-90) },
    { label: t.viewer.toolRotateRight, Icon: RotateCw, run: () => onRotate(90) },
    { label: t.viewer.toolDelete, Icon: Trash2, run: onDelete },
    { label: t.viewer.toolExtract, Icon: FileOutput, run: onExtract },
    { label: t.viewer.contextZoom, Icon: ZoomIn, run: onZoom },
  ]

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    itemRefs.current[0]?.focus()
    const close = () => onCloseRef.current()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('scroll', close, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', onKey, true)
      // 閉じたら、開く前にいた場所へ戻す
      if (previous?.isConnected && previous !== document.body) previous.focus()
    }
  }, [])

  // 画面の端で開いたときも、メニューが窓からはみ出さないようにする
  const left = typeof window === 'undefined' ? x : Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH))
  const top = typeof window === 'undefined' ? y : Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT))

  return (
    <div
      role="menu"
      style={{ left, top }}
      className="fixed z-[450] min-w-[200px] p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/10 shadow-xl"
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map(({ label, Icon, run }, index) => (
        <button
          key={label}
          ref={(element) => { itemRefs.current[index] = element }}
          type="button"
          role="menuitem"
          className={menuItemClass}
          onKeyDown={(event) => {
            const next = nextMenuIndex(index, event.key, items.length)
            if (next === index) return
            event.preventDefault()
            itemRefs.current[next]?.focus()
          }}
          onClick={() => {
            onClose()
            run()
          }}
        >
          <Icon size={16} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}
