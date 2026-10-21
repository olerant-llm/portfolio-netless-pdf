/** ▼メニューのキー操作で、次に移る項目の番号を返す */
export function nextMenuIndex(current: number, key: string, length: number): number {
  if (length === 0) return current
  if (key === 'ArrowDown') return (current + 1) % length
  if (key === 'ArrowUp') return (current - 1 + length) % length
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  return current
}
