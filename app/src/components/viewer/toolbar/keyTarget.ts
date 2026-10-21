/** 文字を打つ場所なら true。そこでの Delete や Ctrl+Z はページ操作にしない */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null
  return Boolean(element?.closest?.('input, textarea, select, [contenteditable="true"]'))
}
