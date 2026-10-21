import { useEffect, useRef } from 'react'

/**
 * 処理中かどうかを、外側の設定の小窓へ知らせる。
 * 小窓は処理中に閉じられないようにしている。部品が消えるときは「処理中ではない」に戻す。
 */
export function useReportBusy(busy: boolean, onBusyChange?: (busy: boolean) => void) {
  const callbackRef = useRef(onBusyChange)
  callbackRef.current = onBusyChange
  useEffect(() => {
    callbackRef.current?.(busy)
  }, [busy])
  useEffect(() => () => callbackRef.current?.(false), [])
}
