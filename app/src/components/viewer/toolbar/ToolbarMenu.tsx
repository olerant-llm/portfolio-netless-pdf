import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { bigButtonClass, menuItemClass } from './ui'
import { nextMenuIndex } from './menuKeys'

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  title?: string
  onSelect: () => void
}

interface ToolbarMenuProps {
  label: string
  icon: ReactNode
  items: MenuItem[]
  disabled?: boolean
  title?: string
}

/** ▼付きの大ボタン。押すと下に項目の一覧を出す。外側クリックと Esc で閉じる */
export default function ToolbarMenu({ label, icon, items, disabled, title }: ToolbarMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    itemRefs.current.find((item) => item && !item.disabled)?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus() // 閉じたら、押した▼ボタンへ戻す
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  // 処理中などで押せなくなったら、開いていた一覧も畳む
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const moveFocus = (event: React.KeyboardEvent, index: number) => {
    const next = nextMenuIndex(index, event.key, items.length)
    if (next === index) return
    event.preventDefault()
    itemRefs.current[next]?.focus()
  }

  return (
    <div ref={rootRef} className="relative shrink-0 flex">
      <button
        ref={triggerRef}
        type="button"
        className={bigButtonClass}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        <span className="flex items-center gap-0.5">{label}<ChevronDown size={12} aria-hidden="true" /></span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full mt-1 z-[90] min-w-[220px] p-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/10 shadow-xl"
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => { itemRefs.current[index] = element }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.title}
              className={menuItemClass}
              onKeyDown={(event) => moveFocus(event, index)}
              onClick={() => {
                setOpen(false)
                // 小窓が開く前に▼ボタンへ戻しておく。小窓を閉じたとき、ここへ戻れるように
                triggerRef.current?.focus()
                item.onSelect()
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
