import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { PDF } from '@libpdf/core'
import JSZip from 'jszip'
import { PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'

const APP_PORT = 4174
const RUN_LARGE_AUDIT = process.argv.includes('--large')
const RUN_TAURI_AUDIT = process.argv.includes('--tauri')
const RUN_SAVE_AUDIT = process.argv.includes('--save-audit')
const RUN_OFFLINE_AUDIT = process.argv.includes('--offline-audit')
const RUN_HISTORY_LIMIT_AUDIT = process.argv.includes('--history-limit')
const DEBUG_PORT = RUN_TAURI_AUDIT ? 9335 : 9334
const APP_URL = RUN_TAURI_AUDIT ? 'http://tauri.localhost/' : `http://127.0.0.1:${APP_PORT}/`
const MEBIBYTE = 1024 * 1024
const appRoot = normalize(fileURLToPath(new URL('../dist/', import.meta.url)))
const encryptedFixture = fileURLToPath(
  new URL('../tests/fixtures/encryption/PasswordSample-256bit.pdf', import.meta.url),
)
const encryptedFixtureBase64 = (await readFile(encryptedFixture)).toString('base64')
const screenshotPath = join(tmpdir(), 'netless-pdf-stage7-editor.png')
const importPaneScreenshotPath = join(tmpdir(), 'netless-pdf-stage7-import-pane.png')
const importDragScreenshotPath = join(tmpdir(), 'netless-pdf-stage7-import-drag.png')
const edgeProfile = join(tmpdir(), `netless-pdf-stage7-edge-${process.pid}`)
const invalidPdfPath = join(tmpdir(), `netless-pdf-stage7-invalid-${process.pid}.pdf`)
const repairablePdfPath = join(tmpdir(), `netless-pdf-stage7-repairable-${process.pid}.pdf`)
const exportFixturePdfPath = join(tmpdir(), `netless-pdf-stage7-export-${process.pid}.pdf`)
const importFixturePdfPath = join(tmpdir(), `netless-pdf-stage7-import-${process.pid}.pdf`)
const rotationFixturePdfPath = join(tmpdir(), `netless-pdf-stage7-rotation-${process.pid}.pdf`)
const signedPdfPath = join(tmpdir(), `netless-pdf-stage7-signed-${process.pid}.pdf`)
const editingRestrictedPdfPath = join(tmpdir(), `netless-pdf-stage7-editing-restricted-${process.pid}.pdf`)
const editingProtectedPdfPath = join(tmpdir(), `netless-pdf-stage7-editing-protected-${process.pid}.pdf`)
const largePdfPath = join(tmpdir(), `netless-pdf-stage7-large-${process.pid}.pdf`)
// 約140MBになるため、実行ごとに増えないよう同じ名前で上書きする
const historyLimitPdfPath = join(tmpdir(), 'netless-pdf-stage7-history-limit.pdf')
const saveAuditDirectory = join(tmpdir(), `netless-pdf-stage7-saves-${process.pid}`)
const firstSavedPdfPath = join(saveAuditDirectory, 'repaired-first-save.pdf')
const resavedPdfPath = join(saveAuditDirectory, 'repaired-after-rotate.pdf')
const selectedPagePdfPath = join(saveAuditDirectory, 'selected-page.pdf')
const separatePagesZipPath = join(saveAuditDirectory, 'separate-pages.zip')
const pngPagesZipPath = join(saveAuditDirectory, 'page-images-png.zip')
const jpegPagesZipPath = join(saveAuditDirectory, 'page-images-jpeg.zip')
const embeddedImagesZipPath = join(saveAuditDirectory, 'embedded-images.zip')
const extractedTextPath = join(saveAuditDirectory, 'extracted-text.txt')
const passwordSavedPdfPath = join(saveAuditDirectory, 'password-protected.pdf')
const largeSavedPdfPath = join(saveAuditDirectory, 'large-200-pages.pdf')
const transparentPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const exportImageBytes = await readFile(new URL('../src-tauri/icons/32x32.png', import.meta.url))
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const tauriPath = fileURLToPath(new URL('../src-tauri/target/release/netless-pdf.exe', import.meta.url))
const execFileAsync = promisify(execFile)
await writeFile(invalidPdfPath, new Uint8Array([1, 2, 3, 4]))

async function createRepairablePdf() {
  const pdf = await PDFDocument.create()
  pdf.addPage([595, 842])
  pdf.addPage([842, 595])
  const bytes = await pdf.save({ useObjectStreams: false })
  const text = new TextDecoder('latin1').decode(bytes)
  // 通常の表示部品は拒否するが、修復処理は管理情報を組み直せる壊れ方に固定する。
  const marker = text.indexOf('trailer')
  if (marker < 0) throw new Error('修復成功確認用PDFの管理情報が見つかりません。')
  const broken = bytes.slice()
  broken.set(new TextEncoder().encode('xxxxxxx'), marker)
  await writeFile(repairablePdfPath, broken)
}

await createRepairablePdf()

async function createEditingRestrictedPdf() {
  const source = await PDFDocument.create()
  source.addPage([595, 842])
  const pdf = await PDF.load(await source.save({ useObjectStreams: false }))
  pdf.setProtection({
    algorithm: 'AES-256',
    userPassword: '',
    ownerPassword: 'owner-restricted',
    permissions: {
      modify: false,
      annotate: false,
      fillForms: false,
      assemble: false,
    },
  })
  await writeFile(editingRestrictedPdfPath, await pdf.save())
}

await createEditingRestrictedPdf()

async function createEditingProtectedPdf() {
  const source = await PDFDocument.create()
  source.addPage([595, 842])
  const pdf = await PDF.load(await source.save({ useObjectStreams: false }))
  pdf.setProtection({
    algorithm: 'AES-256',
    userPassword: '',
    ownerPassword: 'owner-protected',
  })
  await writeFile(editingProtectedPdfPath, await pdf.save())
}

await createEditingProtectedPdf()

async function createExportFixturePdf() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let pageNumber = 1; pageNumber <= 2; pageNumber += 1) {
    // 各ページへ別部品として入れ、特殊な共有画像ではなく通常画像の書き出しを検査する。
    const image = await pdf.embedPng(exportImageBytes)
    const page = pdf.addPage([595, 842])
    page.drawText(`EXPORT PAGE ${pageNumber}`, { x: 48, y: 780, size: 18, font })
    page.drawImage(image, { x: 48, y: 700, width: 32, height: 32 })
  }
  await writeFile(exportFixturePdfPath, await pdf.save({ useObjectStreams: false }))
}

await createExportFixturePdf()

async function createImportFixturePdf() {
  const pdf = await PDFDocument.create()
  for (const color of [rgb(1, 0, 0), rgb(0, 1, 0)]) {
    const page = pdf.addPage([300, 400])
    page.drawRectangle({ x: 0, y: 0, width: 300, height: 400, color })
  }
  await writeFile(importFixturePdfPath, await pdf.save({ useObjectStreams: false }))
}

await createImportFixturePdf()

async function createRotationFixturePdf() {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([300, 400])
  page.drawRectangle({ x: 0, y: 200, width: 150, height: 200, color: rgb(1, 0, 0) })
  page.drawRectangle({ x: 150, y: 200, width: 150, height: 200, color: rgb(0, 1, 0) })
  page.drawRectangle({ x: 0, y: 0, width: 150, height: 200, color: rgb(0, 0, 1) })
  page.drawRectangle({ x: 150, y: 0, width: 150, height: 200, color: rgb(1, 1, 0) })
  await writeFile(rotationFixturePdfPath, await pdf.save({ useObjectStreams: false }))
}

await createRotationFixturePdf()

async function createSignedPdf() {
  const pdf = await PDFDocument.create()
  pdf.addPage([595, 842])
  const signature = pdf.context.obj({
    Type: PDFName.of('Sig'),
    Filter: PDFName.of('Adobe.PPKLite'),
    SubFilter: PDFName.of('adbe.pkcs7.detached'),
    ByteRange: [0, 100, 200, 300],
    Contents: PDFHexString.of('00112233'),
  })
  const field = pdf.context.register(pdf.context.obj({
    FT: PDFName.of('Sig'),
    T: PDFString.of('stage7-signature'),
    V: pdf.context.register(signature),
  }))
  const acroForm = pdf.context.register(pdf.context.obj({
    Fields: [field],
    SigFlags: 3,
  }))
  pdf.catalog.set(PDFName.of('AcroForm'), acroForm)
  await writeFile(signedPdfPath, await pdf.save({ useObjectStreams: false }))
}

await createSignedPdf()

function makeDeterministicPayload(size) {
  const bytes = new Uint8Array(size)
  let state = 0x12345678
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    bytes[index] = state & 0xff
  }
  return bytes
}

async function createLargePdf() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const image = await pdf.embedPng(Buffer.from(transparentPngBase64, 'base64'))
  for (let index = 0; index < 200; index += 1) {
    const page = pdf.addPage(index % 2 === 0 ? [595, 842] : [842, 595])
    page.drawText(`PERFORMANCE PAGE ${index + 1}`, {
      x: 36,
      y: page.getHeight() - 54,
      size: 14,
      font,
    })
    page.drawImage(image, { x: 36, y: 36, width: 40, height: 40 })
  }
  await pdf.attach(makeDeterministicPayload(19 * MEBIBYTE), 'load-data.bin', {
    mimeType: 'application/octet-stream',
    description: 'Stage 7 browser performance load',
  })
  const bytes = await pdf.save({ useObjectStreams: false })
  await writeFile(largePdfPath, bytes)
  return bytes.byteLength
}

/** 1ページで約140MBのPDF。3回操作すると「元に戻す」履歴の上限400MBを超える */
async function createHistoryLimitPdf() {
  const pdf = await PDFDocument.create()
  pdf.addPage([595, 842])
  await pdf.attach(makeDeterministicPayload(140 * MEBIBYTE), 'history-load.bin', {
    mimeType: 'application/octet-stream',
    description: 'History limit audit load',
  })
  await writeFile(historyLimitPdfPath, await pdf.save({ useObjectStreams: false }))
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitUntil(check, message, timeout = 15_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (await check()) return
    await delay(100)
  }
  throw new Error(message)
}

async function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', `http://127.0.0.1:${APP_PORT}`).pathname)
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
      const target = normalize(join(appRoot, relativePath))
      if (!target.startsWith(appRoot)) {
        response.writeHead(403).end('Forbidden')
        return
      }
      const info = await stat(target)
      if (!info.isFile()) throw new Error('Not a file')
      const body = await readFile(target)
      response.writeHead(200, {
        'Content-Type': mimeTypes[extname(target)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      response.end(body)
    } catch {
      response.writeHead(404).end('Not found')
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(APP_PORT, '127.0.0.1', resolve)
  })
  return server
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.nextId = 1
    this.pending = new Map()
    this.events = []
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
        return
      }
      this.events.push(message)
    })
    const rejectPending = () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('検品中に画面との接続が切れました。'))
      }
      this.pending.clear()
    }
    this.socket.addEventListener('close', rejectPending)
    this.socket.addEventListener('error', rejectPending)
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.socket.close()
  }
}

async function findPageTarget() {
  let target
  await waitUntil(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      const targets = await response.json()
      target = targets.find((item) => item.type === 'page')
      return Boolean(target?.webSocketDebuggerUrl)
    } catch {
      return false
    }
  }, 'Edgeの検品画面へ接続できませんでした。')
  return target
}

async function bodyText(client) {
  const result = await client.send('Runtime.evaluate', {
    expression: 'document.body?.innerText ?? ""',
    returnByValue: true,
  })
  return result.result.value
}

async function waitForFile(path, message, timeout = 15_000) {
  await waitUntil(async () => {
    try {
      return (await stat(path)).isFile()
    } catch {
      return false
    }
  }, message, timeout)
}

async function clickButtonByText(client, label, role = undefined) {
  const result = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const label = ${JSON.stringify(label)}
      const role = ${JSON.stringify(role)}
      const button = [...document.querySelectorAll('button')].find((item) =>
        item.innerText.trim() === label && (!role || item.getAttribute('role') === role)
      )
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`,
    returnByValue: true,
  })
  if (!result.result.value) throw new Error(`「${label}」を押せませんでした。`)
  await delay(100)
}

async function clickTestId(client, testId) {
  const result = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const item = document.querySelector('[data-testid=${JSON.stringify(testId)}]')
      if (!item || item.disabled) return false
      item.click()
      return true
    })()`,
    returnByValue: true,
  })
  if (!result.result.value) throw new Error(`検査用の操作「${testId}」を押せませんでした。`)
  await delay(100)
}

async function dragFirstImportPageBeforeFirstDocumentPage(client) {
  const rects = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const source = document.querySelector('[data-testid="import-page"]')?.getBoundingClientRect()
      const target = document.querySelector('[data-testid="page-card"]')?.getBoundingClientRect()
      if (!source || !target) return null
      return {
        from: { x: source.left + source.width / 2, y: source.top + source.height / 2 },
        to: { x: target.left + target.width * 0.2, y: target.top + target.height / 2 },
      }
    })()`,
    returnByValue: true,
  })
  const points = rects.result.value
  if (!points) throw new Error('取り込み元または編集中PDFのページ位置を取得できませんでした。')

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: points.from.x,
    y: points.from.y,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: points.from.x,
    y: points.from.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  })
  await delay(50)
  for (let step = 1; step <= 12; step += 1) {
    const ratio = step / 12
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: points.from.x + (points.to.x - points.from.x) * ratio,
      y: points.from.y + (points.to.y - points.from.y) * ratio,
      button: 'left',
      buttons: 1,
    })
    await delay(50)
  }
  await delay(150)
  // 運んでいる間、左の一覧が落とし先として囲まれていることを確かめ、見た目も撮っておく
  const dropZone = await client.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-testid="import-drop-zone"]')?.dataset.active`,
    returnByValue: true,
  })
  const dragShot = await client.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(importDragScreenshotPath, Buffer.from(dragShot.data, 'base64'))
  if (dropZone.result.value !== 'true') {
    throw new Error('取り込み元のページを運んでいる間、左の一覧が落とし先として表示されませんでした。')
  }
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: points.to.x,
    y: points.to.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  })
}

/** Ctrl を押しながら英字キーを押す（例: 'z' で Ctrl+Z） */
async function pressCtrlKey(client, letter) {
  const upper = letter.toUpperCase()
  const event = {
    key: letter,
    code: `Key${upper}`,
    windowsVirtualKeyCode: upper.charCodeAt(0),
    nativeVirtualKeyCode: upper.charCodeAt(0),
    modifiers: 2,
  }
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
  await delay(100)
}

/** ▼メニューを開いて項目を押す */
async function chooseMenu(client, menuLabel, itemLabel) {
  await clickButtonByText(client, menuLabel)
  await waitUntil(async () => {
    const result = await client.send('Runtime.evaluate', {
      expression: `[...document.querySelectorAll('[role="menuitem"]')].some((item) => item.innerText.trim() === ${JSON.stringify(itemLabel)})`,
      returnByValue: true,
    })
    return result.result.value
  }, `「${menuLabel}」のメニューに「${itemLabel}」が出ませんでした。`)
  await clickButtonByText(client, itemLabel, 'menuitem')
}

/** 設定の小窓が開いていれば、×で閉じる */
async function closeToolDialog(client) {
  await client.send('Runtime.evaluate', {
    expression: `document.querySelector('[role="dialog"] button[aria-label="閉じる"]')?.click()`,
  })
  await waitUntil(async () => {
    const result = await client.send('Runtime.evaluate', {
      expression: `!document.querySelector('[role="dialog"]')`,
      returnByValue: true,
    })
    return result.result.value
  }, '設定の小窓を閉じられませんでした。')
}

const RASTER_MENU_LABELS = { grayscale: '白黒にする', compress: 'ファイルを軽くする' }

async function pressKey(client, key, shiftKey = false) {
  const code = key === 'Escape' || key === 'Delete' ? key : 'Tab'
  const virtualKeyCode = key === 'Escape' ? 27 : key === 'Delete' ? 46 : 9
  await client.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    modifiers: shiftKey ? 8 : 0,
  })
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    modifiers: shiftKey ? 8 : 0,
  })
}

async function auditLargeRasterOperation(client, mode, onProgress = async () => undefined) {
  const operationName = mode === 'grayscale' ? '白黒化' : '軽量化'
  await chooseMenu(client, '仕上げ', RASTER_MENU_LABELS[mode])
  await clickTestId(client, 'raster-run')
  await waitUntil(
    async () => (await bodyText(client)).includes(`${operationName}の前に確認してください`),
    `${operationName}の事前確認が表示されませんでした。`,
  )
  await clickButtonByText(client, '内容を理解して処理する')

  const startedAt = performance.now()
  const progressChanges = []
  let previousCompleted = -1
  let previousChangeAt = performance.now()
  let resultShown = false
  while (performance.now() - startedAt < 300_000) {
    const stateResult = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const progress = document.querySelector('[data-testid="raster-progress"]')
        return {
          completed: progress ? Number(progress.dataset.completedPages) : null,
          resultShown: Boolean(document.querySelector('[data-testid="raster-result"]')),
        }
      })()`,
      returnByValue: true,
    })
    const state = stateResult.result.value
    if (state.resultShown) {
      resultShown = true
      break
    }
    if (Number.isInteger(state.completed) && state.completed !== previousCompleted) {
      previousCompleted = state.completed
      previousChangeAt = performance.now()
      progressChanges.push({
        completedPages: state.completed,
        milliseconds: Math.round(previousChangeAt - startedAt),
      })
      await onProgress({ operationName, completedPages: state.completed, totalPages: 200 })
    } else if (performance.now() - previousChangeAt > 2_000) {
      throw new Error(`${operationName}の進み具合が2秒を超えて変わりませんでした（${previousCompleted}ページ目で停止、開始から${Math.round(performance.now() - startedAt)}ミリ秒、直前の変化: ${JSON.stringify(progressChanges.slice(-3))}）。`)
    }
    await delay(100)
  }
  if (!resultShown) throw new Error(`${operationName}が5分以内に完了しませんでした。`)

  const milliseconds = performance.now() - startedAt
  await clickButtonByText(client, '元のPDFを残す')
  await waitUntil(async () => {
    const result = await client.send('Runtime.evaluate', {
      expression: '!document.querySelector(\'[data-testid="raster-result"]\')',
      returnByValue: true,
    })
    return result.result.value
  }, `${operationName}の確認画面を閉じられませんでした。`)
  await closeToolDialog(client)

  return {
    milliseconds: Math.round(milliseconds),
    progressChangeCount: progressChanges.length,
    firstProgress: progressChanges.at(0) ?? null,
    lastProgress: progressChanges.at(-1) ?? null,
  }
}

async function processTreeWorkingSetBytes(rootProcessId) {
  const script = `
$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, WorkingSetSize)
$ids = @([uint32]${rootProcessId})
do {
  $children = @($all | Where-Object { ($ids -contains [uint32]$_.ParentProcessId) -and ($ids -notcontains [uint32]$_.ProcessId) })
  if ($children.Count -gt 0) { $ids += @($children | ForEach-Object { [uint32]$_.ProcessId }) }
} while ($children.Count -gt 0)
$sum = ($all | Where-Object { $ids -contains [uint32]$_.ProcessId } | Measure-Object -Property WorkingSetSize -Sum).Sum
[Console]::Out.Write([string][long]$sum)
`
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true,
  })
  const bytes = Number(stdout.trim())
  if (!Number.isFinite(bytes) || bytes <= 0) throw new Error('Windowsからアプリ全体の使用メモリを取得できませんでした。')
  return bytes
}

async function moveTauriWindow(rootProcessId) {
  const script = `
$member = @'
[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool GetWindowRect(System.IntPtr hWnd, out RECT rect);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool MoveWindow(System.IntPtr hWnd, int x, int y, int width, int height, bool repaint);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool ShowWindow(System.IntPtr hWnd, int command);
'@
Add-Type -Namespace NetlessPdfAudit -Name NativeWindow -MemberDefinition $member
$process = Get-Process -Id ${rootProcessId}
$handle = $process.MainWindowHandle
if ($handle -eq [System.IntPtr]::Zero) { throw 'Main window was not found.' }
$before = New-Object NetlessPdfAudit.NativeWindow+RECT
$after = New-Object NetlessPdfAudit.NativeWindow+RECT
$shown = [NetlessPdfAudit.NativeWindow]::ShowWindow($handle, 5)
Start-Sleep -Milliseconds 100
$gotBefore = [NetlessPdfAudit.NativeWindow]::GetWindowRect($handle, [ref]$before)
$width = $before.Right - $before.Left
$height = $before.Bottom - $before.Top
$targetLeft = if ($width -gt 0) { $before.Left + 24 } else { 80 }
$targetTop = if ($height -gt 0) { $before.Top + 24 } else { 80 }
if ($width -le 0) { $width = 1000 }
if ($height -le 0) { $height = 700 }
$moveCalled = [NetlessPdfAudit.NativeWindow]::MoveWindow($handle, $targetLeft, $targetTop, $width, $height, $true)
Start-Sleep -Milliseconds 100
$gotAfter = [NetlessPdfAudit.NativeWindow]::GetWindowRect($handle, [ref]$after)
@{
  handle = [long]$handle; shown = $shown; gotBefore = $gotBefore; moveCalled = $moveCalled; gotAfter = $gotAfter
  beforeLeft = $before.Left; beforeTop = $before.Top
  afterLeft = $after.Left; afterTop = $after.Top
  moved = ($moveCalled -and $gotAfter -and ($after.Left -eq $targetLeft) -and ($after.Top -eq $targetTop))
} | ConvertTo-Json -Compress
`
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true,
  })
  const result = JSON.parse(stdout.trim())
  if (!result.moved) {
    throw new Error(`白黒化の処理中にWindowsの窓を動かせませんでした: ${JSON.stringify(result)}`)
  }
  return result
}

async function requestTauriWindowClose(rootProcessId) {
  const script = `
$member = @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool PostMessage(System.IntPtr hWnd, uint message, System.IntPtr wParam, System.IntPtr lParam);
'@
Add-Type -Namespace NetlessPdfAudit -Name NativeClose -MemberDefinition $member
$process = Get-Process -Id ${rootProcessId}
$handle = $process.MainWindowHandle
if ($handle -eq [System.IntPtr]::Zero) { throw 'Main window was not found.' }
$sent = [NetlessPdfAudit.NativeClose]::PostMessage($handle, 0x0010, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
@{ handle = [long]$handle; sent = $sent } | ConvertTo-Json -Compress
`
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true,
  })
  const result = JSON.parse(stdout.trim())
  if (!result.sent) throw new Error('Windowsの窓を閉じる操作を送れませんでした。')
  return result
}

async function enterNativeSavePath(rootProcessId, path) {
  const encodedPath = Buffer.from(path, 'utf16le').toString('base64')
  const script = `
Start-Sleep -Milliseconds 200
$targetPath = [System.Text.Encoding]::Unicode.GetString(
  [System.Convert]::FromBase64String('${encodedPath}')
)
$member = @'
public delegate bool EnumWindowsProc(System.IntPtr hWnd, System.IntPtr lParam);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool EnumWindows(EnumWindowsProc callback, System.IntPtr lParam);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool EnumChildWindows(System.IntPtr parent, EnumWindowsProc callback, System.IntPtr lParam);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint processId);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern int GetWindowText(System.IntPtr hWnd, System.Text.StringBuilder text, int count);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern int GetClassName(System.IntPtr hWnd, System.Text.StringBuilder text, int count);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsWindowVisible(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool SetForegroundWindow(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern int GetDlgCtrlID(System.IntPtr hWnd);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern System.IntPtr GetDlgItem(System.IntPtr hWnd, int id);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern System.IntPtr SendMessage(System.IntPtr hWnd, uint message, System.IntPtr wParam, System.IntPtr lParam);
'@
Add-Type -Namespace NetlessPdfAudit -Name SaveWindow -MemberDefinition $member
$windows = New-Object System.Collections.Generic.List[object]
$callback = [NetlessPdfAudit.SaveWindow+EnumWindowsProc]{
  param($handle, $unused)
  [uint32]$processId = 0
  [void][NetlessPdfAudit.SaveWindow]::GetWindowThreadProcessId($handle, [ref]$processId)
  if (($processId -eq [uint32]${rootProcessId}) -and [NetlessPdfAudit.SaveWindow]::IsWindowVisible($handle)) {
    $title = New-Object System.Text.StringBuilder 512
    $class = New-Object System.Text.StringBuilder 256
    [void][NetlessPdfAudit.SaveWindow]::GetWindowText($handle, $title, $title.Capacity)
    [void][NetlessPdfAudit.SaveWindow]::GetClassName($handle, $class, $class.Capacity)
    $windows.Add([pscustomobject]@{ handle = [long]$handle; title = $title.ToString(); class = $class.ToString() })
  }
  return $true
}
$dialog = @()
for ($attempt = 0; ($attempt -lt 300) -and ($dialog.Count -eq 0); $attempt += 1) {
  $windows.Clear()
  [void][NetlessPdfAudit.SaveWindow]::EnumWindows($callback, [System.IntPtr]::Zero)
  $dialog = @($windows | Where-Object { $_.class -eq '#32770' } | Select-Object -First 1)
  if ($dialog.Count -eq 0) { Start-Sleep -Milliseconds 100 }
}
if ($dialog.Count -eq 0) { throw 'Save dialog window was not found.' }
$dialogHandle = [System.IntPtr]$dialog[0].handle
[void][NetlessPdfAudit.SaveWindow]::SetForegroundWindow($dialogHandle)
Start-Sleep -Milliseconds 250
$children = New-Object System.Collections.Generic.List[object]
$childCallback = [NetlessPdfAudit.SaveWindow+EnumWindowsProc]{
  param($handle, $unused)
  $title = New-Object System.Text.StringBuilder 512
  $class = New-Object System.Text.StringBuilder 256
  [void][NetlessPdfAudit.SaveWindow]::GetWindowText($handle, $title, $title.Capacity)
  [void][NetlessPdfAudit.SaveWindow]::GetClassName($handle, $class, $class.Capacity)
  $children.Add([pscustomobject]@{
    handle = [long]$handle
    title = $title.ToString()
    class = $class.ToString()
    id = [NetlessPdfAudit.SaveWindow]::GetDlgCtrlID($handle)
    visible = [NetlessPdfAudit.SaveWindow]::IsWindowVisible($handle)
  })
  return $true
}
[void][NetlessPdfAudit.SaveWindow]::EnumChildWindows($dialogHandle, $childCallback, [System.IntPtr]::Zero)
$edit = @($children | Where-Object { $_.id -eq 1148 } | Select-Object -First 1)
if ($edit.Count -eq 0) {
  $edit = @($children | Where-Object { $_.class -eq 'Edit' -and $_.visible } | Select-Object -First 1)
}
$okButton = [NetlessPdfAudit.SaveWindow]::GetDlgItem($dialogHandle, 1)
$usedDirectControls = ($edit.Count -gt 0) -and ($okButton -ne [System.IntPtr]::Zero)
if ($usedDirectControls) {
  $editHandle = [System.IntPtr]$edit[0].handle
  [void][NetlessPdfAudit.SaveWindow]::SendMessage(
    $editHandle, 0x00B1, [System.IntPtr]::Zero, [System.IntPtr](-1)
  )
  foreach ($character in $targetPath.ToCharArray()) {
    [void][NetlessPdfAudit.SaveWindow]::SendMessage(
      $editHandle, 0x0102, [System.IntPtr][int][char]$character, [System.IntPtr]::Zero
    )
  }
  Start-Sleep -Milliseconds 150
  [void][NetlessPdfAudit.SaveWindow]::SendMessage($dialogHandle, 0x0111, [System.IntPtr]1, $okButton)
} else {
  $shell = New-Object -ComObject WScript.Shell
  $shell.SendKeys('%n')
  Start-Sleep -Milliseconds 150
  $shell.SendKeys('^a')
  Start-Sleep -Milliseconds 100
  $shell.SendKeys($targetPath)
  Start-Sleep -Milliseconds 100
  $shell.SendKeys('{ENTER}')
}
@{
  sent = $true
  mode = if ($usedDirectControls) { 'direct-controls' } else { 'keyboard-fallback' }
  dialogClass = $dialog[0].class
  editId = if ($edit.Count -gt 0) { $edit[0].id } else { $null }
} | ConvertTo-Json -Compress -Depth 4
`
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true,
  })
  const result = JSON.parse(stdout.trim())
  if (!result.sent) throw new Error('Windowsの保存小窓へ保存先を入力できませんでした。')
  return result
}

async function saveByButtonLabel(client, rootProcessId, label, path, timeout = 30_000, role = undefined) {
  const startedAt = performance.now()
  await waitUntil(async () => {
    const result = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const label = ${JSON.stringify(label)}
        const role = ${JSON.stringify(role)}
        return [...document.querySelectorAll('button')]
          .some((item) => item.innerText.trim() === label && !item.disabled && (!role || item.getAttribute('role') === role))
      })()`,
      returnByValue: true,
    })
    return result.result.value
  }, `「${label}」を実行できる状態になりませんでした。`)
  await clickButtonByText(client, label, role)
  let dialog
  try {
    dialog = await enterNativeSavePath(rootProcessId, path)
  } catch (error) {
    const diagnostics = client.events.slice(-200).flatMap((event) => {
      if (event.method === 'Runtime.consoleAPICalled') {
        return [`console.${event.params.type}: ${event.params.args.map((arg) => arg.value ?? arg.description).join(' ')}`]
      }
      if (event.method === 'Runtime.exceptionThrown') {
        return [`exception: ${event.params.exceptionDetails.text} ${event.params.exceptionDetails.exception?.description ?? ''}`]
      }
      return []
    })
    throw new Error(
      `${error.message}\n現在の画面: ${(await bodyText(client)).slice(-800)}\n診断: ${diagnostics.slice(-10).join(' | ')}`,
    )
  }
  await waitForFile(path, `「${label}」で保存物が作られませんでした。`, timeout)
  await waitUntil(async () => {
    const result = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const label = ${JSON.stringify(label)}
        const buttons = [...document.querySelectorAll('button')]
        // 書き出し中の表示が残っていれば、まだ終わっていない
        if (buttons.some((item) => item.title === '書き出しています…')) return false
        // メニュー項目や、保存後に閉じる小窓のボタンは消える。消えていれば完了とみなす
        const matches = buttons.filter((item) => item.innerText.trim() === label)
        return matches.length === 0 || matches.some((item) => !item.disabled)
      })()`,
      returnByValue: true,
    })
    return result.result.value
  }, `「${label}」の保存完了を画面で確認できませんでした。`)
  const milliseconds = Math.round(performance.now() - startedAt)
  console.log(`保存確認: ${label} -> ${extname(path)} ${milliseconds}ms (${dialog.mode}, ${dialog.dialogClass}, 入力欄${dialog.editId})`)
  return { milliseconds, dialog }
}

function hasPngSignature(bytes) {
  return bytes.length >= 8
    && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
}

function hasJpegSignature(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

async function inspectZip(path, expectedExtension, expectedCount, checkEntry) {
  const bytes = await readFile(path)
  const zip = await JSZip.loadAsync(bytes)
  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  if (entries.length !== expectedCount) {
    throw new Error(`${extname(path)}内のファイル数が${expectedCount}個ではありません。`)
  }
  for (const entry of entries) {
    if (!entry.name.toLowerCase().endsWith(expectedExtension)) {
      throw new Error(`${extname(path)}内に想定外のファイルがあります: ${entry.name}`)
    }
    await checkEntry(new Uint8Array(await entry.async('uint8array')), entry.name)
  }
  return { bytes: bytes.byteLength, entries: entries.map((entry) => entry.name) }
}

function requireLabels(text, labels, location) {
  const missing = labels.filter((label) => !text.includes(label))
  if (missing.length > 0) {
    throw new Error(`${location}に必要な項目がありません: ${missing.join('、')}`)
  }
}

async function setPdfFile(client, filePath = encryptedFixture, selector = 'input[accept*=".pdf"]') {
  const evaluated = await client.send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})`,
  })
  const objectId = evaluated.result.objectId
  if (!objectId) throw new Error('PDF選択欄が見つかりませんでした。')
  await client.send('DOM.setFileInputFiles', {
    objectId,
    files: [filePath],
  })
}

async function imageCornerColors(client, selector) {
  const result = await client.send('Runtime.evaluate', {
    expression: `(async () => {
      const image = document.querySelector(${JSON.stringify(selector)})
      if (!image || !image.complete || image.naturalWidth === 0) return null
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0)
      const colorAt = (x, y) => {
        const [red, green, blue] = context.getImageData(
          Math.round(canvas.width * x), Math.round(canvas.height * y), 1, 1,
        ).data
        if (red > 180 && green < 100 && blue < 100) return 'red'
        if (red < 100 && green > 180 && blue < 100) return 'green'
        if (red < 100 && green < 100 && blue > 180) return 'blue'
        if (red > 180 && green > 180 && blue < 100) return 'yellow'
        return 'unknown'
      }
      return {
        width: canvas.width,
        height: canvas.height,
        colors: [colorAt(0.25, 0.25), colorAt(0.75, 0.25), colorAt(0.25, 0.75), colorAt(0.75, 0.75)],
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  return result.result.value
}

async function thumbnailCornerColors(client) {
  return imageCornerColors(client, '[data-testid="page-card"] img')
}

async function waitForThumbnailColors(client, expected, message) {
  let latest = null
  await waitUntil(async () => {
    latest = await thumbnailCornerColors(client)
    return latest?.colors?.join(',') === expected.join(',')
  }, message, 30_000)
  return latest
}

async function waitForPreviewColors(client, alt, expected, message) {
  let latest = null
  await waitUntil(async () => {
    latest = await imageCornerColors(client, `img[alt="${alt}"]`)
    return latest?.colors?.join(',') === expected.join(',')
  }, message, 30_000)
  return latest
}

async function auditRotatedRasterPreview(client, mode, expected, message) {
  const operationName = mode === 'grayscale' ? '白黒化' : '軽量化'
  await chooseMenu(client, '仕上げ', RASTER_MENU_LABELS[mode])
  await clickTestId(client, 'raster-run')
  await waitUntil(
    async () => (await bodyText(client)).includes(`${operationName}の前に確認してください`),
    `${operationName}の事前確認が表示されませんでした。`,
  )
  await clickButtonByText(client, '内容を理解して処理する')
  await waitUntil(
    async () => Boolean((await imageCornerColors(client, 'img[alt="処理後"]'))),
    `${operationName}の処理後見本が表示されませんでした。`,
    30_000,
  )
  const before = await waitForPreviewColors(client, '処理前', expected, `${message}（処理前）`)
  const after = await imageCornerColors(client, 'img[alt="処理後"]')
  if (mode === 'compress' && after?.colors?.join(',') !== expected.join(',')) {
    throw new Error(`${message}（処理後）: ${after?.colors?.join(',')}`)
  }
  if (mode === 'grayscale') {
    const result = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const image = document.querySelector('img[alt="処理後"]')
        if (!image || !image.complete) return null
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0)
        return [[.25,.25],[.75,.25],[.25,.75],[.75,.75]].map(([x,y]) => {
          const [red, green, blue] = context.getImageData(Math.round(canvas.width*x), Math.round(canvas.height*y), 1, 1).data
          return { red, green, blue }
        })
      })()`,
      returnByValue: true,
    })
    const samples = result.result.value
    const neutral = samples?.every(({ red, green, blue }) => Math.max(red, green, blue) - Math.min(red, green, blue) <= 3)
    const values = samples?.map(({ red }) => red)
    const correctlyOriented = values && values[0] < values[1] && values[1] < values[3] && values[3] < values[2]
    if (!neutral || !correctlyOriented) throw new Error(`${message}（処理後）: ${JSON.stringify(samples)}`)
  }
  await clickButtonByText(client, '元のPDFを残す')
  await waitUntil(async () => !(await bodyText(client)).includes(`${operationName}の結果を確認`), `${operationName}の見本を閉じられませんでした。`)
  await closeToolDialog(client)
  return { before, after }
}

async function setImageFile(client) {
  const result = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[accept*=".png"]')
      if (!input) return false
      const binary = atob(${JSON.stringify(transparentPngBase64)})
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'transparent.png', { type: 'image/png' }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`,
    returnByValue: true,
  })
  if (!result.result.value) throw new Error('画像選択欄が見つかりませんでした。')
}

async function enterPasswordAndOpen(client, password = 'owner') {
  const entered = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[type="password"]')
      if (!input) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, ${JSON.stringify(password)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`,
    returnByValue: true,
  })
  if (!entered.result.value) throw new Error('パスワード入力画面を操作できませんでした。')
  await delay(200)
  const clicked = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const button = [...document.querySelectorAll('button')]
        .find((item) => item.innerText.includes('保護を外して開く'))
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`,
    returnByValue: true,
  })
  if (!clicked.result.value) throw new Error('保護解除ボタンを押せませんでした。')
}

const server = RUN_TAURI_AUDIT ? null : await startStaticServer()
if (RUN_SAVE_AUDIT && !RUN_TAURI_AUDIT) {
  throw new Error('保存物の検査はWindows本体でだけ実行できます。--tauri を一緒に指定してください。')
}
if (RUN_OFFLINE_AUDIT && !RUN_TAURI_AUDIT) {
  throw new Error('オフライン検査はWindows本体でだけ実行できます。--tauri を一緒に指定してください。')
}
if (RUN_SAVE_AUDIT) await mkdir(saveAuditDirectory, { recursive: true })
const runner = RUN_TAURI_AUDIT
  ? spawn(tauriPath, [], {
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEBUG_PORT}`,
      WEBVIEW2_USER_DATA_FOLDER: edgeProfile,
    },
  })
  : spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--no-first-run',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${edgeProfile}`,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true })

let client
let saveAudit
try {
  const target = await findPageTarget()
  client = new CdpClient(target.webSocketDebuggerUrl)
  await client.open()
  await Promise.all([
    client.send('DOM.enable'),
    client.send('Network.enable'),
    client.send('Page.enable'),
    client.send('Performance.enable'),
    client.send('Runtime.enable'),
  ])
  if (RUN_OFFLINE_AUDIT) {
    await client.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })
  }
  await client.send('Page.navigate', { url: APP_URL })
  await waitUntil(async () => (await bodyText(client)).includes('PDFを開く'), '起動画面が表示されませんでした。')

  console.log('検査中: パスワード付きPDF')
  await setPdfFile(client)
  await waitUntil(
    async () => (await bodyText(client)).includes('パスワードで保護されています'),
    'パスワード案内が表示されませんでした。',
  )

  await enterPasswordAndOpen(client)
  try {
    await waitUntil(
      async () => {
        const text = await bodyText(client)
        return ['PDFを追加', '左に回転', '右に回転', '削除', '取り出す', '仕上げ', '書き出し'].every((label) => text.includes(label))
      },
      '保護解除後の編集画面が表示されませんでした。',
      30_000,
    )
  } catch (error) {
    const failedScreenshot = await client.send('Page.captureScreenshot', { format: 'png' })
    const failedPath = join(tmpdir(), 'netless-pdf-stage7-browser-failure.png')
    await writeFile(failedPath, Buffer.from(failedScreenshot.data, 'base64'))
    const diagnostics = client.events.flatMap((event) => {
      if (event.method === 'Runtime.consoleAPICalled') {
        return [`console.${event.params.type}: ${event.params.args.map((arg) => arg.value ?? arg.description).join(' ')}`]
      }
      if (event.method === 'Runtime.exceptionThrown') {
        return [`exception: ${event.params.exceptionDetails.text} ${event.params.exceptionDetails.exception?.description ?? ''}`]
      }
      if (event.method === 'Network.loadingFailed') {
        return [`network: ${event.params.errorText}`]
      }
      return []
    })
    throw new Error(`${error.message}\n現在の画面: ${(await bodyText(client)).slice(0, 500)}\n診断: ${diagnostics.join(' | ')}\n画像: ${failedPath}`)
  }

  const visibleControls = {}
  visibleControls.page = await bodyText(client)
  requireLabels(visibleControls.page, ['開く', '保存', 'PDFを追加', 'トリミング', '署名画像', '仕上げ', '書き出し'], 'ツールバー')

  await client.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-testid="page-card"]')?.click()`,
  })
  await waitUntil(async () => (await bodyText(client)).includes('ページを選択中'), 'ページ選択操作が反映されませんでした。')
  visibleControls.selection = await bodyText(client)
  requireLabels(visibleControls.selection, ['1ページを選択中', '選択を解除'], '選択ページ操作')

  console.log('検査中: 別PDFからページを追加する画面')
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const documentPageCountBeforeImport = await client.send('Runtime.evaluate', {
    expression: `document.querySelectorAll('[data-testid="page-card"]').length`,
    returnByValue: true,
  })
  await setPdfFile(client, importFixturePdfPath, '[data-testid="import-pdf-input"]')
  await waitUntil(async () => {
    const result = await client.send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('[data-testid="import-pane"]'))
        && document.querySelectorAll('[data-testid="import-page"]').length === 2`,
      returnByValue: true,
    })
    return result.result.value
  }, '取り込み元の2ページが表示されませんでした。', 30_000)
  visibleControls.importPane = await bodyText(client)
  requireLabels(visibleControls.importPane, [
    'すべて選ぶ', 'すべて解除', '末尾にまとめて追加',
    '入れたいページをクリックで選ぶ', '左の一覧の、入れたい位置へドラッグ',
    'まず、右のページをクリックして選んでください。',
  ], '取り込み元の操作')
  for (const unwanted of ['別のPDFから', '画像から', '入れる場所', '選択中のページの前に入れる']) {
    if (visibleControls.importPane.includes(unwanted)) {
      throw new Error(`取り込み元に不要な操作が残っています: ${unwanted}`)
    }
  }
  await dragFirstImportPageBeforeFirstDocumentPage(client)
  try {
    await waitUntil(async () => {
      const count = await client.send('Runtime.evaluate', {
        expression: `document.querySelectorAll('[data-testid="page-card"]').length`,
        returnByValue: true,
      })
      const firstPage = await imageCornerColors(client, '[data-testid="page-card"] img')
      return count.result.value === documentPageCountBeforeImport.result.value + 1
        && firstPage?.colors?.every((color) => color === 'red')
    }, '取り込み元の赤い1ページを左側の先頭へドラッグ追加できませんでした。', 30_000)
  } catch (error) {
    const diagnostics = await client.send('Runtime.evaluate', {
      expression: `(() => ({
        documentPages: document.querySelectorAll('[data-testid="page-card"]').length,
        importPages: document.querySelectorAll('[data-testid="import-page"]').length,
        markerCount: document.querySelectorAll('[class*="pointer-events-none"]').length,
        text: document.body.innerText.slice(0, 500),
      }))()`,
      returnByValue: true,
    })
    const firstPage = await imageCornerColors(client, '[data-testid="page-card"] img')
    throw new Error(`${error.message} ${JSON.stringify({ ...diagnostics.result.value, firstPage })}`)
  }
  await clickTestId(client, 'import-select-all')
  await waitUntil(async () => {
    const text = await bodyText(client)
    return text.includes('末尾にまとめて追加（2ページ）')
      && text.includes('選んだ2ページを、左の入れたい位置へドラッグしてください。')
  }, '取り込み元の全ページを選べませんでした。')
  await delay(300)
  const importPaneShot = await client.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(importPaneScreenshotPath, Buffer.from(importPaneShot.data, 'base64'))
  await clickTestId(client, 'import-clear-selection')
  await waitUntil(async () => (await bodyText(client)).includes('まず、右のページをクリックして選んでください。'), '取り込み元の選択をすべて解除できませんでした。')
  await clickTestId(client, 'import-select-all')
  await clickTestId(client, 'import-insert-end')
  await waitUntil(async () => (await bodyText(client)).includes('2ページを追加しました'), '選んだ2ページを末尾へ追加できませんでした。', 30_000)
  const importClosed = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const button = document.querySelector('button[aria-label="取り込みをやめる"]')
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`,
    returnByValue: true,
  })
  if (!importClosed.result.value) throw new Error('取り込み元の画面を閉じられませんでした。')
  await client.send('Emulation.clearDeviceMetricsOverride')

  for (const [menu, items, key] of [
    ['仕上げ', ['透かし', 'ページ番号', '文書情報', '白黒にする', 'ファイルを軽くする'], 'document'],
    ['書き出し', ['ページを画像にする', '埋め込み画像を取り出す', '文字を取り出す'], 'export'],
    ['保存', ['保存', 'パスワード付きで保存'], 'save'],
  ]) {
    await clickButtonByText(client, menu)
    await waitUntil(async () => Boolean((await client.send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('[role="menu"]'))`, returnByValue: true,
    })).result.value), `「${menu}」のメニューが開きませんでした。`)
    visibleControls[key] = await bodyText(client)
    requireLabels(visibleControls[key], items, `${menu}のメニュー`)
    await pressKey(client, 'Escape')
    // Esc で閉じたら、押した▼ボタンへ戻る
    const focusedAfterMenu = (await client.send('Runtime.evaluate', {
      expression: 'document.activeElement?.innerText?.trim() ?? ""', returnByValue: true,
    })).result.value
    if (focusedAfterMenu !== menu) throw new Error(`「${menu}」のメニューを閉じた後、ボタンへ戻りませんでした: ${focusedAfterMenu}`)
  }
  // 透かしの小窓を開き、設定項目が出てから閉じる
  await chooseMenu(client, '仕上げ', '透かし')
  visibleControls.watermarkDialog = await bodyText(client)
  requireLabels(visibleControls.watermarkDialog, ['透かしの文字', '透明度', '適用'], '透かしの小窓')
  // Tab を何度押しても小窓の外へ出ず、Esc で閉じたら「仕上げ」へ戻る
  for (let index = 0; index < 14; index += 1) {
    await pressKey(client, 'Tab', index % 5 === 4)
    const inDialog = (await client.send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement))`,
      returnByValue: true,
    })).result.value
    if (!inDialog) throw new Error('Tab で設定の小窓の外へ移れてしまいました。')
  }
  await pressKey(client, 'Escape')
  await waitUntil(async () => (await client.send('Runtime.evaluate', {
    expression: `!document.querySelector('[role="dialog"]') && document.activeElement?.innerText?.trim() === '仕上げ'`,
    returnByValue: true,
  })).result.value, '設定の小窓を閉じた後、「仕上げ」へ戻りませんでした。')

  // 小窓から「適用」まで通す：トリミング・透かし・ページ番号・文書情報
  const applyInDialog = async (open, buttonLabel, toastText) => {
    await open()
    await clickButtonByText(client, buttonLabel)
    await waitUntil(async () => (await bodyText(client)).includes(toastText), `「${toastText}」が出ませんでした。`, 30_000)
  }
  await applyInDialog(() => clickButtonByText(client, 'トリミング'), '適用', 'トリミングしました。')
  await applyInDialog(() => chooseMenu(client, '仕上げ', '透かし'), '適用', '透かしを入れました。')
  await applyInDialog(() => chooseMenu(client, '仕上げ', 'ページ番号'), '適用', 'ページ番号を付けました。')
  await applyInDialog(() => chooseMenu(client, '仕上げ', '文書情報'), '変更を反映', '文書情報を変更しました。')
  await waitUntil(async () => !(await client.send('Runtime.evaluate', {
    expression: `Boolean(document.querySelector('[role="dialog"]'))`, returnByValue: true,
  })).result.value, '文書情報を反映した後、小窓が閉じませんでした。')
  const dialogLeftOpen = (await client.send('Runtime.evaluate', {
    expression: `Boolean(document.querySelector('[role="dialog"]'))`, returnByValue: true,
  })).result.value
  if (dialogLeftOpen) throw new Error('適用した後も設定の小窓が残っています。')

  // ツールバーの「削除」と「署名画像」
  const countCards = async () => (await client.send('Runtime.evaluate', {
    expression: `document.querySelectorAll('[data-testid="page-card"]').length`, returnByValue: true,
  })).result.value
  const cardsBeforeDelete = await countCards()
  await client.send('Runtime.evaluate', { expression: `document.querySelector('[data-testid="page-card"]')?.click()` })
  await waitUntil(async () => (await bodyText(client)).includes('1ページを選択中'), '削除するページを選べませんでした。')
  await clickButtonByText(client, '仕上げ')
  await pressKey(client, 'Delete')
  await delay(300)
  if ((await countCards()) !== cardsBeforeDelete) throw new Error('メニューを開いている間の Delete でページが消えてしまいました。')
  await pressKey(client, 'Escape')
  await clickButtonByText(client, '削除')
  await waitUntil(async () => (await countCards()) === cardsBeforeDelete - 1, 'ツールバーの「削除」でページが消えませんでした。')
  await clickButtonByText(client, '元に戻す')
  await waitUntil(async () => (await countCards()) === cardsBeforeDelete, '削除を元に戻せませんでした。')
  await client.send('Runtime.evaluate', { expression: `document.querySelector('[data-testid="page-card"]')?.click()` })
  await waitUntil(async () => (await bodyText(client)).includes('1ページを選択中'), '署名画像を貼るページを選べませんでした。')
  await clickButtonByText(client, '署名画像')
  await waitUntil(async () => (await bodyText(client)).includes('PNG・JPEG画像を選ぶ'), 'ツールバーの「署名画像」で配置画面が開きませんでした。')
  await pressKey(client, 'Escape')
  await waitUntil(async () => !(await bodyText(client)).includes('PNG・JPEG画像を選ぶ'), '署名画像の配置画面を閉じられませんでした。')

  // 未保存のまま「開く」で別のPDFを選ぶと、先に確認が出る
  await setPdfFile(client, rotationFixturePdfPath, '[data-testid="open-pdf-input"]')
  await waitUntil(async () => (await bodyText(client)).includes('保存せずに開く'), '「開く」の前に未保存の確認が出ませんでした。')
  visibleControls.unsavedOpenButton = await bodyText(client)
  await clickButtonByText(client, '編集に戻る')

  const closeClicked = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const button = document.querySelector('button[aria-label="閉じる"]')
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`,
    returnByValue: true,
  })
  if (!closeClicked.result.value) throw new Error('文書を閉じる操作を確認できませんでした。')
  await waitUntil(async () => (await bodyText(client)).includes('保存していない変更があります'), '閉じる前の未保存確認が表示されませんでした。')
  visibleControls.unsavedClose = await bodyText(client)
  requireLabels(visibleControls.unsavedClose, ['保存せずに閉じる', '編集に戻る'], '閉じる前の未保存確認')
  await clickButtonByText(client, '編集に戻る')

  if (RUN_TAURI_AUDIT) {
    await requestTauriWindowClose(runner.pid)
    await waitUntil(
      async () => (await bodyText(client)).includes('保存していない変更があります'),
      'Windowsの窓を閉じる前の未保存確認が表示されませんでした。',
    )
    visibleControls.windowUnsavedClose = await bodyText(client)
    requireLabels(visibleControls.windowUnsavedClose, ['保存せずに閉じる', '編集に戻る'], 'Windowsの窓を閉じる前の未保存確認')
    await clickButtonByText(client, '編集に戻る')
  }

  const dropped = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const binary = atob(${JSON.stringify(encryptedFixtureBase64)})
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'another-password-file.pdf', { type: 'application/pdf' }))
      window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
      return true
    })()`,
    returnByValue: true,
  })
  if (!dropped.result.value) throw new Error('別PDFのドロップ操作を確認できませんでした。')
  await waitUntil(async () => (await bodyText(client)).includes('別のPDFを開くと'), '別PDFを開く前の未保存確認が表示されませんでした。')
  visibleControls.unsavedOpen = await bodyText(client)
  requireLabels(visibleControls.unsavedOpen, ['保存せずに開く', '編集に戻る'], '別PDFを開く前の未保存確認')
  await clickButtonByText(client, '編集に戻る')

  const screenshot = await client.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))

  // ツールバーの見た目を、狭い窓（900px）と標準の窓（1280px）で残す。透かしの小窓も残す
  for (const width of [900, 1280]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false })
    await delay(300)
    const shot = await client.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(tmpdir(), `netless-pdf-toolbar-${width}.png`), Buffer.from(shot.data, 'base64'))
  }
  await chooseMenu(client, '仕上げ', '透かし')
  await delay(300)
  const dialogShot = await client.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(tmpdir(), 'netless-pdf-dialog-watermark.png'), Buffer.from(dialogShot.data, 'base64'))
  await closeToolDialog(client)
  await client.send('Emulation.clearDeviceMetricsOverride')

  await client.send('Page.navigate', { url: APP_URL })
  await delay(500)
  await waitUntil(async () => (await bodyText(client)).includes('PDFを開く'), '回転表示確認用の起動画面が表示されませんでした。')
  console.log('検査中: 90度・270度回転後の見た目')
  await setPdfFile(client, rotationFixturePdfPath)
  await waitUntil(async () => Boolean(await thumbnailCornerColors(client)), '回転表示確認用PDFが表示されませんでした。', 30_000)
  // 取り込み元を出したまま「開く」で別の文書に差し替えると、前の取り込み元は片付く
  await setPdfFile(client, importFixturePdfPath, '[data-testid="import-pdf-input"]')
  await waitUntil(async () => (await client.send('Runtime.evaluate', {
    expression: `Boolean(document.querySelector('[data-testid="import-pane"]'))`, returnByValue: true,
  })).result.value, '差し替え確認用の取り込み元が出ませんでした。', 30_000)
  await setPdfFile(client, rotationFixturePdfPath, '[data-testid="open-pdf-input"]')
  await waitUntil(async () => (await client.send('Runtime.evaluate', {
    expression: `!document.querySelector('[data-testid="import-pane"]')`, returnByValue: true,
  })).result.value, '別の文書に差し替えた後も、前の取り込み元が残っています。', 30_000)
  await waitUntil(async () => Boolean(await thumbnailCornerColors(client)), '差し替えた回転表示確認用PDFが表示されませんでした。', 30_000)
  const rotationVisual = {
    original: await waitForThumbnailColors(client, ['red', 'green', 'blue', 'yellow'], '回転前の色配置が正しくありません。'),
  }
  await client.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-testid="page-card"]')?.click()`,
  })
  await waitUntil(async () => (await bodyText(client)).includes('ページを選択中'), '回転表示確認用ページを選べませんでした。')
  await clickButtonByText(client, '右に回転')
  rotationVisual.right90 = await waitForThumbnailColors(
    client,
    ['blue', 'red', 'yellow', 'green'],
    '右90度回転後の縮小表示が正しい向きになりませんでした。',
  )
  rotationVisual.right90Grayscale = await auditRotatedRasterPreview(
    client,
    'grayscale',
    ['blue', 'red', 'yellow', 'green'],
    '右90度ページの白黒化見本が正しい向きになりませんでした。',
  )
  await clickButtonByText(client, '元に戻す')
  await waitForThumbnailColors(client, ['red', 'green', 'blue', 'yellow'], '右90度回転を元に戻した表示が正しくありません。')
  // やり直し（ボタンと Ctrl+Y）で右90度へ進め直し、Ctrl+Z で再び戻す
  await clickButtonByText(client, 'やり直し')
  await waitForThumbnailColors(client, ['blue', 'red', 'yellow', 'green'], '「やり直し」で右90度回転へ戻りませんでした。')
  await pressCtrlKey(client, 'z')
  await waitForThumbnailColors(client, ['red', 'green', 'blue', 'yellow'], 'Ctrl+Z で元に戻りませんでした。')
  await pressCtrlKey(client, 'y')
  await waitForThumbnailColors(client, ['blue', 'red', 'yellow', 'green'], 'Ctrl+Y でやり直せませんでした。')
  await pressCtrlKey(client, 'z')
  await waitForThumbnailColors(client, ['red', 'green', 'blue', 'yellow'], '2回目の Ctrl+Z で元に戻りませんでした。')
  // ページの右クリックメニューから回転し、元に戻す
  const cardPoint = (await client.send('Runtime.evaluate', {
    expression: `(() => {
      const card = document.querySelector('[data-testid="page-card"]')
      card.scrollIntoView({ block: 'center' })
      const rect = card.getBoundingClientRect()
      // 上部に貼り付いたツールバーに隠れていない部分を右クリックする
      const toolbarBottom = document.querySelector('[role="toolbar"]').getBoundingClientRect().bottom
      return { x: rect.left + rect.width / 2, y: Math.min(rect.bottom - 20, Math.max(rect.top, toolbarBottom) + 40) }
    })()`,
    returnByValue: true,
  })).result.value
  await delay(300)
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cardPoint.x, y: cardPoint.y, button: 'none', buttons: 0 })
  for (const type of ['mousePressed', 'mouseReleased']) {
    await client.send('Input.dispatchMouseEvent', { type, x: cardPoint.x, y: cardPoint.y, button: 'right', buttons: type === 'mousePressed' ? 2 : 0, clickCount: 1 })
  }
  await delay(200)
  if (!(await bodyText(client)).includes('拡大表示')) {
    const events = await client.send('Runtime.evaluate', { expression: 'document.elementFromPoint(' + cardPoint.x + ',' + cardPoint.y + ')?.outerHTML.slice(0, 200)', returnByValue: true })
    console.log('診断: 右クリック位置の要素', cardPoint, events.result.value)
  }
  await waitUntil(async () => (await bodyText(client)).includes('拡大表示'), '右クリックメニューが出ませんでした。')
  visibleControls.contextMenu = await bodyText(client)
  await clickButtonByText(client, '右に回転', 'menuitem')
  await waitForThumbnailColors(client, ['blue', 'red', 'yellow', 'green'], '右クリックメニューの「右に回転」が効きませんでした。')
  await clickButtonByText(client, '元に戻す')
  await waitForThumbnailColors(client, ['red', 'green', 'blue', 'yellow'], '右クリックでの回転を元に戻せませんでした。')
  await clickButtonByText(client, '左に回転')
  rotationVisual.left90 = await waitForThumbnailColors(
    client,
    ['green', 'yellow', 'red', 'blue'],
    '左90度（270度）回転後の縮小表示が正しい向きになりませんでした。',
  )
  rotationVisual.left90Compress = await auditRotatedRasterPreview(
    client,
    'compress',
    ['green', 'yellow', 'red', 'blue'],
    '左90度（270度）ページの軽量化見本が正しい向きになりませんでした。',
  )
  visibleControls.rotationVisual = rotationVisual

  await client.send('Page.navigate', { url: APP_URL })
  await delay(500)
  await waitUntil(async () => (await bodyText(client)).includes('PDFを開く'), '編集制限確認用の起動画面が表示されませんでした。')
  console.log('検査中: 閲覧できるが編集制限のあるPDF')
  await setPdfFile(client, editingRestrictedPdfPath)
  await waitUntil(
    async () => (await bodyText(client)).includes('編集が制限されています'),
    '編集制限の案内が表示されませんでした。',
  )
  const editingRestrictionText = await bodyText(client)
  if (!editingRestrictionText.includes('所有者用パスワード')) {
    throw new Error('編集制限の案内に所有者用パスワードの説明がありません。')
  }
  if (editingRestrictionText.includes('電子署名の有無を確認できません')) {
    throw new Error('編集制限のあるPDFが電子署名確認失敗として表示されました。')
  }
  await enterPasswordAndOpen(client, 'owner-restricted')
  await waitUntil(
    async () => (await bodyText(client)).includes('1ページ'),
    '編集制限を所有者用パスワードで解除した後、編集画面が表示されませんでした。',
    30_000,
  )
  visibleControls.editingRestriction = editingRestrictionText

  await client.send('Page.navigate', { url: APP_URL })
  await delay(500)
  await waitUntil(async () => (await bodyText(client)).includes('PDFを開く'), 'パスワード不要の保護解除確認用の起動画面が表示されませんでした。')
  console.log('検査中: 編集可能でパスワード不要の暗号化PDF')
  await setPdfFile(client, editingProtectedPdfPath)
  await waitUntil(
    async () => (await bodyText(client)).includes('編集の前に保護を外します'),
    'パスワード不要の保護解除案内が表示されませんでした。',
  )
  await clickButtonByText(client, '保護を外して開く')
  await waitUntil(
    async () => (await bodyText(client)).includes('1ページ'),
    'パスワード不要で保護を外した後、編集画面が表示されませんでした。',
    30_000,
  )
  visibleControls.editingProtection = true

  await client.send('Page.navigate', { url: APP_URL })
  await delay(500)
  await waitUntil(async () => (await bodyText(client)).includes('PDFを開く'), '修復確認用の起動画面が表示されませんでした。')
  console.log('検査中: 修復できないPDF')
  await setPdfFile(client, invalidPdfPath)
  await waitUntil(async () => (await bodyText(client)).includes('このPDFを開けませんでした'), '修復案内が表示されませんでした。')
  await clickButtonByText(client, '修復を試す')
  await waitUntil(
    async () => (await bodyText(client)).includes('このPDFは修復できませんでした。元のファイルは変更していません。'),
    '修復できない場合の案内が表示されませんでした。',
  )
  visibleControls.unrepairable = await bodyText(client)

  await client.send('Page.navigate', { url: APP_URL })
  await delay(500)
  await waitUntil(async () => (await bodyText(client)).includes('PDFを開く'), '修復成功確認用の起動画面が表示されませんでした。')
  console.log('検査中: 修復できるPDF')
  await setPdfFile(client, repairablePdfPath)
  await waitUntil(async () => (await bodyText(client)).includes('このPDFを開けませんでした'), '修復できるPDFの修復案内が表示されませんでした。')
  await clickButtonByText(client, '修復を試す')
  await waitUntil(
    async () => (await bodyText(client)).includes('修復したPDFを開きました。保存するまでは元のファイルは変わりません。'),
    '修復成功のお知らせが表示されませんでした。',
    30_000,
  )
  await waitUntil(async () => {
    const text = await bodyText(client)
    return text.includes('2ページ')
      && text.includes('netless-pdf-stage7-repairable-')
      && text.includes('-修復.pdf')
      && ['PDFを追加', '左に回転', '右に回転', '削除', '取り出す', '仕上げ', '書き出し'].every((label) => text.includes(label))
  }, '修復後のPDFが未保存の編集画面に表示されませんでした。')
  visibleControls.repairSuccess = await bodyText(client)

  const repairCloseClicked = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const button = document.querySelector('button[aria-label="閉じる"]')
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`,
    returnByValue: true,
  })
  if (!repairCloseClicked.result.value) throw new Error('修復したPDFを閉じる操作を確認できませんでした。')
  await waitUntil(async () => (await bodyText(client)).includes('保存していない変更があります'), '修復したPDFの未保存確認が表示されませんでした。')
  visibleControls.repairUnsavedClose = await bodyText(client)
  await clickButtonByText(client, '編集に戻る')

  if (RUN_SAVE_AUDIT) {
    console.log('検査中: Windows本体でPDFを保存して再保存')
    await clickButtonByText(client, '保存')
    await saveByButtonLabel(client, runner.pid, '保存', firstSavedPdfPath, 30_000, 'menuitem')
    await waitUntil(async () => (await bodyText(client)).includes('保存しました。'), '最初の保存完了が表示されませんでした。')
    const firstBytes = await readFile(firstSavedPdfPath)
    const firstPdf = await PDFDocument.load(firstBytes)
    if (firstPdf.getPageCount() !== 2) throw new Error('最初に保存したPDFのページ数が2ページではありません。')
    if (firstPdf.getPage(0).getRotation().angle !== 0) throw new Error('最初に保存したPDFの向きが予期せず変わっています。')

    await client.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="page-card"]')?.click()`,
    })
    await waitUntil(async () => (await bodyText(client)).includes('ページを選択中'), '再保存前に1ページ目を選べませんでした。')
    await clickButtonByText(client, '右に回転')
    await waitUntil(async () => {
      const state = await client.send('Runtime.evaluate', {
        expression: `(() => {
          const undo = [...document.querySelectorAll('button')]
            .find((item) => item.innerText.trim() === '元に戻す')
          return Boolean(undo && !undo.disabled)
        })()`,
        returnByValue: true,
      })
      return state.result.value
    }, '回転後の編集完了を確認できませんでした。')

    await clickButtonByText(client, '保存')
    await saveByButtonLabel(client, runner.pid, '保存', resavedPdfPath, 30_000, 'menuitem')
    const resavedBytes = await readFile(resavedPdfPath)
    const resavedPdf = await PDFDocument.load(resavedBytes)
    if (resavedPdf.getPageCount() !== 2) throw new Error('再保存したPDFのページ数が2ページではありません。')
    if (resavedPdf.getPage(0).getRotation().angle !== 90) throw new Error('再保存したPDFに90度回転が反映されていません。')
    if (Buffer.compare(firstBytes, resavedBytes) === 0) throw new Error('編集前後の保存PDFが同じ内容です。')

    saveAudit = {
      directory: saveAuditDirectory,
      firstSave: { path: firstSavedPdfPath, bytes: firstBytes.byteLength, pages: 2, firstPageRotation: 0 },
      resave: { path: resavedPdfPath, bytes: resavedBytes.byteLength, pages: 2, firstPageRotation: 90 },
    }

    console.log('検査中: Windows本体でPDF・ZIP・PNG・JPEG・TXTを書き出す')
    await client.send('Page.navigate', { url: APP_URL })
    await delay(500)
    await waitUntil(async () => (await bodyText(client)).includes('PDFを開く'), '書き出し確認用の起動画面が表示されませんでした。')
    await setPdfFile(client, exportFixturePdfPath)
    await waitUntil(async () => (await bodyText(client)).includes('2ページ'), '書き出し確認用PDFを開けませんでした。')
    await client.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="page-card"]')?.click()`,
    })
    await waitUntil(async () => (await bodyText(client)).includes('1ページを選択中'), '書き出す1ページ目を選べませんでした。')
    await clickButtonByText(client, '取り出す')
    await saveByButtonLabel(client, runner.pid, '選んだページを1つのPDFに', selectedPagePdfPath, 30_000, 'menuitem')
    const selectedPageBytes = await readFile(selectedPagePdfPath)
    const selectedPagePdf = await PDFDocument.load(selectedPageBytes)
    if (selectedPagePdf.getPageCount() !== 1) throw new Error('選択ページPDFが1ページではありません。')

    await clickButtonByText(client, '取り出す')
    await saveByButtonLabel(client, runner.pid, '1ページずつ（ZIP）', separatePagesZipPath, 30_000, 'menuitem')
    const separatePagesZip = await inspectZip(separatePagesZipPath, '.pdf', 1, async (bytes) => {
      const pdf = await PDFDocument.load(bytes)
      if (pdf.getPageCount() !== 1) throw new Error('ZIP内のページPDFが1ページではありません。')
    })

    await chooseMenu(client, '書き出し', 'ページを画像にする')
    await clickButtonByText(client, 'PNG')
    await saveByButtonLabel(client, runner.pid, 'ページ画像を保存', pngPagesZipPath, 60_000)
    const pngPagesZip = await inspectZip(pngPagesZipPath, '.png', 2, async (bytes, name) => {
      if (!hasPngSignature(bytes)) throw new Error(`PNGとして開けない画像があります: ${name}`)
    })

    await clickButtonByText(client, 'JPEG')
    await saveByButtonLabel(client, runner.pid, 'ページ画像を保存', jpegPagesZipPath, 60_000)
    const jpegPagesZip = await inspectZip(jpegPagesZipPath, '.jpg', 2, async (bytes, name) => {
      if (!hasJpegSignature(bytes)) throw new Error(`JPEGとして開けない画像があります: ${name}`)
    })

    await closeToolDialog(client)
    await chooseMenu(client, '書き出し', '埋め込み画像を取り出す')
    await saveByButtonLabel(client, runner.pid, '画像を探して保存', embeddedImagesZipPath, 60_000)
    const embeddedImagesZip = await inspectZip(embeddedImagesZipPath, '.png', 2, async (bytes, name) => {
      if (!hasPngSignature(bytes)) throw new Error(`PNGとして開けない埋め込み画像があります: ${name}`)
    })

    await closeToolDialog(client)
    await chooseMenu(client, '書き出し', '文字を取り出す')
    await clickButtonByText(client, '文字を読み取る')
    await waitUntil(async () => {
      const result = await client.send('Runtime.evaluate', {
        expression: `document.querySelector('textarea[aria-label="取り出した文字"]')?.value ?? ''`,
        returnByValue: true,
      })
      return result.result.value.includes('EXPORT PAGE 1') && result.result.value.includes('EXPORT PAGE 2')
    }, '書き出し確認用PDFの文字を画面で読み取れませんでした。', 30_000)
    await saveByButtonLabel(client, runner.pid, 'テキストで保存', extractedTextPath)
    const extractedTextBytes = await readFile(extractedTextPath)
    const extractedText = new TextDecoder().decode(extractedTextBytes)
    if (!extractedText.includes('EXPORT PAGE 1') || !extractedText.includes('EXPORT PAGE 2')) {
      throw new Error('保存したTXTに2ページ分の文字がありません。')
    }

    // 「保存▼」→「パスワード付きで保存」を最後まで通す
    await closeToolDialog(client)
    await chooseMenu(client, '保存', 'パスワード付きで保存')
    const typed = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const inputs = [...document.querySelectorAll('[role="dialog"] input[type="password"]')]
        if (inputs.length !== 2) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        for (const input of inputs) {
          setter.call(input, 'audit-pass-123')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        return true
      })()`,
      returnByValue: true,
    })
    if (!typed.result.value) throw new Error('パスワード付き保存の入力欄が見つかりませんでした。')
    await saveByButtonLabel(client, runner.pid, 'パスワード付きPDFを保存', passwordSavedPdfPath)
    const passwordSavedBytes = await readFile(passwordSavedPdfPath)
    if (!Buffer.from(passwordSavedBytes).toString('latin1').includes('/Encrypt')) {
      throw new Error('パスワード付きで保存したPDFが保護されていません。')
    }
    await waitUntil(async () => !(await client.send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('[role="dialog"]'))`, returnByValue: true,
    })).result.value, 'パスワード付き保存の後、小窓が閉じませんでした。')

    saveAudit.outputs = {
      selectedPagePdf: { path: selectedPagePdfPath, bytes: selectedPageBytes.byteLength, pages: 1 },
      separatePagesZip: { path: separatePagesZipPath, ...separatePagesZip },
      pngPagesZip: { path: pngPagesZipPath, ...pngPagesZip },
      jpegPagesZip: { path: jpegPagesZipPath, ...jpegPagesZip },
      embeddedImagesZip: { path: embeddedImagesZipPath, ...embeddedImagesZip },
      extractedText: { path: extractedTextPath, bytes: extractedTextBytes.byteLength, pagesWithExpectedText: 2 },
    }
  }

  await client.send('Page.navigate', { url: APP_URL })
  await delay(500)
  await waitUntil(async () => (await bodyText(client)).includes('PDFを開く'), '電子署名警告確認用の起動画面が表示されませんでした。')
  console.log('検査中: 電子署名の編集前警告')
  await setPdfFile(client, signedPdfPath)
  await waitUntil(async () => (await bodyText(client)).includes('1ページ'), '電子署名確認用PDFの編集画面が表示されませんでした。')
  await client.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-testid="page-card"]')?.click()`,
  })
  await waitUntil(async () => (await bodyText(client)).includes('ページを選択中'), '電子署名確認用PDFのページを選べませんでした。')
  const signatureEditStarted = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const button = [...document.querySelectorAll('button')]
        .find((item) => item.innerText.trim() === '右に回転')
      if (!button || button.disabled) return false
      button.focus()
      button.click()
      return true
    })()`,
    returnByValue: true,
  })
  if (!signatureEditStarted.result.value) throw new Error('電子署名確認用PDFの編集操作を始められませんでした。')
  await waitUntil(async () => (await bodyText(client)).includes('電子署名が無効になります'), '電子署名の編集前警告が表示されませんでした。')
  visibleControls.signatureWarning = await bodyText(client)

  const focusedLabel = async () => {
    const result = await client.send('Runtime.evaluate', {
      expression: `(() => ({
        label: document.activeElement?.innerText?.trim() ?? '',
        inDialog: Boolean(document.querySelector('[role="alertdialog"]')?.contains(document.activeElement)),
      }))()`,
      returnByValue: true,
    })
    return result.result.value
  }
  await waitUntil(async () => (await focusedLabel()).label === '編集しない', '電子署名警告の安全側ボタンへ最初に移動しませんでした。')
  for (const expected of ['影響を理解して編集する', '編集しない']) {
    await pressKey(client, 'Tab')
    const focused = await focusedLabel()
    if (!focused.inDialog || focused.label !== expected) {
      throw new Error(`電子署名警告のTab移動が小窓内に留まりませんでした: ${JSON.stringify(focused)}`)
    }
  }
  await pressKey(client, 'Tab', true)
  const backwardFocused = await focusedLabel()
  if (!backwardFocused.inDialog || backwardFocused.label !== '影響を理解して編集する') {
    throw new Error(`電子署名警告のShift+Tab移動が小窓内に留まりませんでした: ${JSON.stringify(backwardFocused)}`)
  }
  await pressKey(client, 'Escape')
  let signatureCancelState
  try {
    await waitUntil(async () => {
      const result = await client.send('Runtime.evaluate', {
        expression: `(() => {
          const undo = [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === '元に戻す')
          return {
            dialogClosed: !document.querySelector('[role="alertdialog"]'),
            focusedLabel: document.activeElement?.innerText?.trim() ?? '',
            undoDisabled: undo?.disabled === true,
          }
        })()`,
        returnByValue: true,
      })
      signatureCancelState = result.result.value
      return signatureCancelState.dialogClosed
        && signatureCancelState.focusedLabel === '右に回転'
        && signatureCancelState.undoDisabled
    }, '電子署名警告を中止した後、編集せず元の操作場所へ戻りませんでした。')
  } catch (error) {
    throw new Error(`${error.message} 状態: ${JSON.stringify(signatureCancelState)}`)
  }

  const signatureWarningAgain = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const button = [...document.querySelectorAll('button')]
        .find((item) => item.innerText.trim() === '右に回転')
      if (!button || button.disabled) return false
      button.click()
      return true
    })()`,
    returnByValue: true,
  })
  if (!signatureWarningAgain.result.value) throw new Error('電子署名警告の再確認操作を始められませんでした。')
  await waitUntil(async () => (await bodyText(client)).includes('電子署名が無効になります'), '編集を中止した後の再操作で電子署名警告が表示されませんでした。')
  await pressKey(client, 'Escape')
  await waitUntil(async () => !(await bodyText(client)).includes('電子署名が無効になります'), '再表示した電子署名警告を閉じられませんでした。')

  await client.send('Page.navigate', { url: APP_URL })
  await delay(500)
  await waitUntil(async () => (await bodyText(client)).includes('画像から新しいPDFを作る'), '画像作成確認用の起動画面が表示されませんでした。')
  console.log('検査中: 画像からPDF作成')
  await setImageFile(client)
  try {
    await waitUntil(async () => (await bodyText(client)).includes('画像の順番を確認'), '画像の順番確認画面が表示されませんでした。')
  } catch (error) {
    const consoleMessages = client.events.flatMap((event) => (
      event.method === 'Runtime.consoleAPICalled'
        ? [`${event.params.type}: ${event.params.args.map((arg) => arg.value ?? arg.description).join(' ')}`]
        : []
    ))
    throw new Error(`${error.message}\n現在の画面: ${(await bodyText(client)).slice(0, 500)}\n診断: ${consoleMessages.join(' | ')}`)
  }
  visibleControls.imageDraft = await bodyText(client)
  requireLabels(visibleControls.imageDraft, ['画像を追加', 'この順番でPDFを作る'], '画像の順番確認')
  await clickButtonByText(client, 'この順番でPDFを作る')
  await waitUntil(
    async () => {
      const text = await bodyText(client)
      return text.includes('画像から作成.pdf') && ['PDFを追加', '左に回転', '右に回転', '削除', '取り出す', '仕上げ', '書き出し'].every((label) => text.includes(label))
    },
    '画像から作ったPDFの編集画面が表示されませんでした。',
  )
  visibleControls.imageCreation = await bodyText(client)

  if (RUN_HISTORY_LIMIT_AUDIT) {
    console.log('検査中: 元に戻す履歴の上限確認')
    await createHistoryLimitPdf()
    await client.send('Page.navigate', { url: APP_URL })
    await delay(500)
    await waitUntil(async () => (await bodyText(client)).includes('PDFを開く'), '履歴上限確認用の起動画面が表示されませんでした。')
    await setPdfFile(client, historyLimitPdfPath)
    await waitUntil(async () => (await bodyText(client)).includes('1ページ'), '履歴上限確認用PDFの編集画面が表示されませんでした。', 60_000)
    await client.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="page-card"]')?.click()`,
    })
    await waitUntil(async () => (await bodyText(client)).includes('ページを選択中'), '履歴上限確認用PDFのページを選べませんでした。')

    const LIMIT_TITLE = 'これより前には戻せなくなります'
    const rotateAndWait = async () => {
      await clickButtonByText(client, '右に回転')
      await waitUntil(async () => {
        const text = await bodyText(client)
        return text.includes(LIMIT_TITLE) || !text.includes('処理しています…')
      }, '履歴上限確認用PDFの回転が終わりませんでした。', 120_000)
      return (await bodyText(client)).includes(LIMIT_TITLE)
    }

    // 140MB × 2回は上限内なので、確認は出ない
    for (const round of [1, 2]) {
      if (await rotateAndWait()) throw new Error(`上限内の${round}回目の操作で履歴上限の確認が出てしまいました。`)
    }
    // 3回目で上限を超えるので、確認が出る。Escape でやめると何も変わらない
    if (!await rotateAndWait()) throw new Error('上限を超える操作の前に履歴上限の確認が出ませんでした。')
    visibleControls.historyLimitWarning = await bodyText(client)
    requireLabels(visibleControls.historyLimitWarning, ['古い作業1回分', '続ける', 'やめる'], '履歴上限の確認')
    await pressKey(client, 'Escape')
    await waitUntil(async () => {
      const text = await bodyText(client)
      return !text.includes(LIMIT_TITLE) && !text.includes('処理しています…')
    }, '履歴上限の確認をやめた後、編集画面へ戻りませんでした。')
    if ((await bodyText(client)).includes('元に戻せるのは直近')) {
      throw new Error('履歴上限の確認をやめたのに、古い作業が捨てられました。')
    }
    // もう一度操作すると再び確認が出る。「続ける」で反映し、上限の表示が出る
    if (!await rotateAndWait()) throw new Error('やめた後の再操作で履歴上限の確認が出ませんでした。')
    await clickButtonByText(client, '続ける')
    await waitUntil(async () => (await bodyText(client)).includes('元に戻せるのは直近2回まで'), '履歴上限の確認後に「元に戻せるのは直近2回まで」が表示されませんでした。', 120_000)
    // 同じ文書では2回目以降は確認を出さない
    if (await rotateAndWait()) throw new Error('同じ文書で履歴上限の確認が2回出ました。')
    visibleControls.historyLimitAfter = await bodyText(client)
  }

  let largePerformance
  if (RUN_LARGE_AUDIT) {
    const largeBytes = await createLargePdf()
    await client.send('Page.navigate', { url: APP_URL })
    await delay(500)
    await waitUntil(async () => (await bodyText(client)).includes('PDFを開く'), '大型PDF確認用の起動画面が表示されませんでした。')

    const openStartedAt = performance.now()
    await setPdfFile(client, largePdfPath)
    await waitUntil(async () => (await bodyText(client)).includes('200ページ'), '大型PDFのページ数が表示されませんでした.', 30_000)
    await waitUntil(async () => {
      const result = await client.send('Runtime.evaluate', {
        expression: 'Boolean(document.querySelector(\'img[alt="1ページ"]\'))',
        returnByValue: true,
      })
      return result.result.value
    }, '大型PDFの最初の縮小表示が表示されませんでした。', 30_000)
    const openMilliseconds = performance.now() - openStartedAt

    let largeSave
    if (RUN_SAVE_AUDIT) {
      console.log('検査中: 200ページ・約20MBのPDFを通常保存')
      const saveStartedAt = performance.now()
      await clickButtonByText(client, '保存')
      await saveByButtonLabel(client, runner.pid, '保存', largeSavedPdfPath, 30_000, 'menuitem')
      await waitUntil(async () => {
        try {
          return (await stat(largeSavedPdfPath)).size === largeBytes
        } catch {
          return false
        }
      }, '大型PDFの保存サイズが30秒以内に元のPDFと一致しませんでした。', 30_000)
      const saveMilliseconds = Math.round(performance.now() - saveStartedAt)
      if (saveMilliseconds > 30_000) {
        throw new Error(`大型PDFの通常保存が30秒を超えました: ${saveMilliseconds}ms`)
      }
      const savedBytes = await readFile(largeSavedPdfPath)
      const savedPdf = await PDFDocument.load(savedBytes)
      if (savedPdf.getPageCount() !== 200) throw new Error('保存した大型PDFが200ページではありません。')
      if (savedBytes.byteLength !== largeBytes) throw new Error('保存した大型PDFの大きさが元のPDFと一致しません。')
      largeSave = {
        path: largeSavedPdfPath,
        bytes: savedBytes.byteLength,
        pages: 200,
        milliseconds: saveMilliseconds,
      }
      saveAudit.largePdf = largeSave
    }

    const loadedResult = await client.send('Runtime.evaluate', {
      expression: 'document.querySelectorAll(\'img[alt$="ページ"]\').length',
      returnByValue: true,
    })
    const loadedThumbnails = loadedResult.result.value

    const selectionStartedAt = performance.now()
    await client.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="page-card"]')?.click()`,
    })
    await waitUntil(async () => (await bodyText(client)).includes('1ページを選択中'), '大型PDFのページ選択が反映されませんでした。')
    const selectionMilliseconds = performance.now() - selectionStartedAt

    const dragInfoResult = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const cards = [...document.querySelectorAll('[data-testid="page-card"]')].slice(0, 2)
        if (cards.length !== 2) return null
        const [first, second] = cards.map((card) => ({
          id: card.dataset.pageId,
          number: card.dataset.pageNumber,
          rect: card.getBoundingClientRect(),
        }))
        // 上部に貼り付いたツールバーに隠れていない高さでつかむ
        const toolbarBottom = document.querySelector('[role="toolbar"]').getBoundingClientRect().bottom
        const y = (rect) => Math.min(rect.bottom - 20, Math.max(rect.top, toolbarBottom) + 40)
        return {
          activeId: first.id,
          from: { x: first.rect.left + first.rect.width / 2, y: y(first.rect) },
          to: { x: second.rect.left + second.rect.width / 2, y: y(second.rect) },
        }
      })()`,
      returnByValue: true,
    })
    const dragInfo = dragInfoResult.result.value
    if (!dragInfo?.activeId) throw new Error('大型PDFのドラッグ対象が見つかりませんでした。')
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: dragInfo.from.x, y: dragInfo.from.y,
    })
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: dragInfo.from.x, y: dragInfo.from.y,
      button: 'left', buttons: 1, clickCount: 1,
    })
    // 実際の手操作に近づけ、数フレームに分けて相手の中央まで動かす。
    // 一度に座標だけ飛ばすと、ブラウザーがドラッグ開始を描画する前に
    // マウスを離した扱いになり、操作そのものを測れないことがある。
    for (let step = 1; step <= 12; step += 1) {
      const ratio = step / 12
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: dragInfo.from.x + ((dragInfo.to.x - dragInfo.from.x) * ratio),
        y: dragInfo.from.y + ((dragInfo.to.y - dragInfo.from.y) * ratio),
        button: 'left', buttons: 1,
      })
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const dragStartedAt = performance.now()
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: dragInfo.to.x, y: dragInfo.to.y,
      button: 'left', buttons: 0, clickCount: 1,
    })
    await waitUntil(async () => {
      const result = await client.send('Runtime.evaluate', {
        expression: `document.querySelector('[data-page-id=${JSON.stringify(dragInfo.activeId)}]')?.dataset.pageNumber === '2'`,
        returnByValue: true,
      })
      return result.result.value
    }, '大型PDFのドラッグ結果が画面へ反映されませんでした。', 10_000)
    const dragMilliseconds = performance.now() - dragStartedAt
    // 並びの表示は先に変わり、PDFの作り直しは少し後に始まる。「元に戻す」が押せるようになるまで待つ
    await waitUntil(async () => (await client.send('Runtime.evaluate', {
      expression: `!document.body.innerText.includes('処理しています') && Boolean([...document.querySelectorAll('button')].find((item) => item.innerText.trim() === '元に戻す' && !item.disabled))`,
      returnByValue: true,
    })).result.value, '大型PDFの並べ替え処理が完了しませんでした。', 30_000)
    await clickButtonByText(client, '元に戻す')
    await waitUntil(async () => {
      const result = await client.send('Runtime.evaluate', {
        expression: `Boolean([...document.querySelectorAll('button')]
          .find((item) => item.innerText.trim() === '元に戻す' && item.disabled))
          && !document.body.innerText.includes('処理しています')`,
        returnByValue: true,
      })
      return result.result.value
    }, '大型PDFの並べ替えを元に戻せませんでした。', 30_000)

    const scrollStartedAt = performance.now()
    await client.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const startedAt = performance.now()
        const cards = [...document.querySelectorAll('[data-testid="page-card"]')]
        cards.at(-1)?.scrollIntoView({ block: 'center' })
        requestAnimationFrame(() => resolve(performance.now() - startedAt))
      })`,
      awaitPromise: true,
      returnByValue: true,
    })
    try {
      await waitUntil(async () => {
        const result = await client.send('Runtime.evaluate', {
          expression: 'Boolean(document.querySelector(\'img[alt="200ページ"]\'))',
          returnByValue: true,
        })
        return result.result.value
      }, '大型PDFの末尾の縮小表示が表示されませんでした。', 30_000)
    } catch (error) {
      const scrollState = await client.send('Runtime.evaluate', {
        expression: `(() => {
          const cards = [...document.querySelectorAll('[data-testid="page-card"]')]
          const last = cards.at(-1)?.getBoundingClientRect()
          return {
            scrollY: window.scrollY,
            viewportHeight: window.innerHeight,
            pageHeight: document.documentElement.scrollHeight,
            cardCount: cards.length,
            lastCard: last ? { top: last.top, bottom: last.bottom } : null,
            loadedAlts: [...document.querySelectorAll('img[alt$="ページ"]')].map((image) => image.alt),
          }
        })()`,
        returnByValue: true,
      })
      throw new Error(`${error.message} ${JSON.stringify(scrollState.result.value)}`)
    }
    const scrollMilliseconds = performance.now() - scrollStartedAt

    const rotateStartedAt = performance.now()
    const rotated = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const button = [...document.querySelectorAll('button')]
          .find((item) => item.innerText.trim() === '右に回転')
        if (!button || button.disabled) return false
        button.click()
        return true
      })()`,
      returnByValue: true,
    })
    if (!rotated.result.value) throw new Error('大型PDFの回転ボタンを押せませんでした。')
    await waitUntil(async () => {
      const result = await client.send('Runtime.evaluate', {
        expression: `Boolean([...document.querySelectorAll('button')]
          .find((item) => item.innerText.trim() === '元に戻す' && !item.disabled))`,
        returnByValue: true,
      })
      return result.result.value
    }, '大型PDFの回転が完了しませんでした。', 30_000)
    const rotateMilliseconds = performance.now() - rotateStartedAt

    const afterRotateMetrics = await client.send('Performance.getMetrics')
    await clickButtonByText(client, '元に戻す')
    await waitUntil(async () => {
      const result = await client.send('Runtime.evaluate', {
        expression: `Boolean([...document.querySelectorAll('button')]
          .find((item) => item.innerText.trim() === '元に戻す' && item.disabled))
          && !document.body.innerText.includes('処理しています')`,
        returnByValue: true,
      })
      return result.result.value
    }, '大型PDFを元に戻せませんでした。', 30_000)
    const afterUndoMetrics = await client.send('Performance.getMetrics')

    // 文字の取り出し中は、Esc や × で小窓を閉じられないこと（処理が裏で続いて迷わないように）
    await chooseMenu(client, '書き出し', '文字を取り出す')
    await clickButtonByText(client, '文字を読み取る')
    await pressKey(client, 'Escape')
    await client.send('Runtime.evaluate', {
      expression: `document.querySelector('[role="dialog"] button[aria-label="閉じる"]')?.click()`,
    })
    const lockedDuringExtraction = (await client.send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('[role="dialog"]'))`,
      returnByValue: true,
    })).result.value
    if (!lockedDuringExtraction) throw new Error('文字の取り出し中に設定の小窓が閉じてしまいました。')
    await waitUntil(async () => (await client.send('Runtime.evaluate', {
      expression: `(document.querySelector('textarea[aria-label="取り出した文字"]')?.value ?? '').includes('PERFORMANCE PAGE 200')`,
      returnByValue: true,
    })).result.value, '大型PDFの文字を取り出せませんでした。', 60_000)
    await closeToolDialog(client)

    const processMemorySamples = []
    const sampledMilestones = new Set()
    let windowMove = null
    const observeTauriProcess = async ({ operationName, completedPages }) => {
      if (!RUN_TAURI_AUDIT) return
      const milestone = Math.min(200, Math.floor(completedPages / 50) * 50)
      const milestoneKey = `${operationName}-${milestone}`
      if (!sampledMilestones.has(milestoneKey)) {
        sampledMilestones.add(milestoneKey)
        processMemorySamples.push({
          operationName,
          completedPages,
          bytes: await processTreeWorkingSetBytes(runner.pid),
        })
      }
      if (!windowMove && operationName === '白黒化' && completedPages > 0 && completedPages < 200) {
        const moveStartedAt = performance.now()
        const moved = await moveTauriWindow(runner.pid)
        const afterMoveResult = await client.send('Runtime.evaluate', {
          expression: `(() => {
            const progress = document.querySelector('[data-testid="raster-progress"]')
            return progress ? Number(progress.dataset.completedPages) : null
          })()`,
          returnByValue: true,
        })
        if (!Number.isInteger(afterMoveResult.result.value)) {
          throw new Error('窓を動かした時点で白黒化の進み具合を確認できませんでした。')
        }
        windowMove = {
          ...moved,
          milliseconds: Math.round(performance.now() - moveStartedAt),
          progressBefore: completedPages,
          progressAfter: afterMoveResult.result.value,
        }
      }
    }

    const grayscale = await auditLargeRasterOperation(client, 'grayscale', observeTauriProcess)
    const afterGrayscaleMetrics = await client.send('Performance.getMetrics')
    if (RUN_TAURI_AUDIT) {
      processMemorySamples.push({
        operationName: '白黒化結果',
        completedPages: 200,
        bytes: await processTreeWorkingSetBytes(runner.pid),
      })
    }
    const compress = await auditLargeRasterOperation(client, 'compress', observeTauriProcess)
    const afterCompressMetrics = await client.send('Performance.getMetrics')
    if (RUN_TAURI_AUDIT) {
      processMemorySamples.push({
        operationName: '軽量化結果',
        completedPages: 200,
        bytes: await processTreeWorkingSetBytes(runner.pid),
      })
    }

    const heapSamples = [
      afterRotateMetrics,
      afterUndoMetrics,
      afterGrayscaleMetrics,
      afterCompressMetrics,
    ].map((metrics) => (
      metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0
    ))
    const peakJsHeapBytes = Math.max(...heapSamples)
    const peakProcessTreeBytes = processMemorySamples.length > 0
      ? Math.max(...processMemorySamples.map((sample) => sample.bytes))
      : null

    if (openMilliseconds > 5_000) throw new Error(`大型PDFの最初の表示が5秒を超えました: ${Math.round(openMilliseconds)}ms`)
    if (selectionMilliseconds > 500) throw new Error(`大型PDFの選択反応が0.5秒を超えました: ${Math.round(selectionMilliseconds)}ms`)
    if (dragMilliseconds > 500) throw new Error(`大型PDFのドラッグ反応が0.5秒を超えました: ${Math.round(dragMilliseconds)}ms`)
    if (scrollMilliseconds > 500) throw new Error(`大型PDFのスクロール反応が0.5秒を超えました: ${Math.round(scrollMilliseconds)}ms`)
    if (rotateMilliseconds > 3_000) throw new Error(`大型PDFの回転が3秒を超えました: ${Math.round(rotateMilliseconds)}ms`)
    if (loadedThumbnails >= 200) throw new Error('大型PDFの縮小表示を一度に全ページ描いています。')
    if (peakJsHeapBytes >= 1.5 * 1024 * MEBIBYTE) throw new Error('大型PDF操作時の画面メモリが1.5GBを超えました。')
    if (peakProcessTreeBytes !== null && peakProcessTreeBytes >= 1.5 * 1024 * MEBIBYTE) {
      throw new Error('大型PDF操作時のアプリ全体メモリが1.5GBを超えました。')
    }
    if (RUN_TAURI_AUDIT && !windowMove) throw new Error('白黒化中の窓移動を確認できませんでした。')

    largePerformance = {
      bytes: largeBytes,
      openMilliseconds: Math.round(openMilliseconds),
      selectionMilliseconds: Math.round(selectionMilliseconds),
      dragMilliseconds: Math.round(dragMilliseconds),
      scrollMilliseconds: Math.round(scrollMilliseconds),
      rotateMilliseconds: Math.round(rotateMilliseconds),
      save: largeSave,
      grayscale,
      compress,
      loadedThumbnails,
      peakJsHeapBytes,
      system: RUN_TAURI_AUDIT ? {
        peakProcessTreeBytes,
        processMemorySamples,
        windowMove,
      } : undefined,
    }
    visibleControls.largePdf = await bodyText(client)
  }

  const requestUrls = client.events
    .filter((event) => event.method === 'Network.requestWillBeSent')
    .map((event) => event.params.request.url)
  const externalRequests = requestUrls.filter((url) => {
    if (!/^https?:/i.test(url)) return false
    const parsed = new URL(url)
    return !['127.0.0.1', 'localhost', 'tauri.localhost'].includes(parsed.hostname)
  })
  if (externalRequests.length > 0) {
    throw new Error(`外部通信を検出しました: ${externalRequests.join(', ')}`)
  }

  const text = await bodyText(client)
  console.log(JSON.stringify({
    result: 'passed',
    runtime: RUN_TAURI_AUDIT ? 'tauri' : 'edge',
    offlineMode: RUN_OFFLINE_AUDIT,
    passwordPrompt: true,
    unrepairablePrompt: true,
    repairablePrompt: true,
    signatureWarningKeyboard: true,
    imageCreation: true,
    editorToolbar: ['PDFを追加', '左に回転', '右に回転', '削除', '取り出す', '仕上げ', '書き出し'],
    checkedControlGroups: Object.keys(visibleControls),
    externalRequestCount: externalRequests.length,
    observedRequestCount: requestUrls.length,
    saveAudit,
    largePerformance,
    screenshotPath,
    importPaneScreenshotPath,
    importDragScreenshotPath,
    documentTextSample: text.slice(0, 200),
  }, null, 2))
} finally {
  client?.close()
  runner.kill()
  if (server) await new Promise((resolve) => server.close(resolve))
}
