/** Windowsで使えない記号を避け、書き出し用の短いファイル名にする。 */
export function safeExportBaseName(name: string): string {
  const safe = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 120)
    .replace(/[. ]+$/g, '')
  return safe || 'paperknife'
}
