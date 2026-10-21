import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFPageTree,
  PDFRef,
  PDFString,
  StandardFonts,
} from 'pdf-lib'

/**
 * 試験用PDFを作る。
 * ページの幅をそのままページの目印に使う（幅100のページ = 目印100）。
 * こうすると、並べ替えや差し込みの後でも順序を機械的に確かめられる。
 */
export async function makeTestPdf(widths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const w of widths) {
    doc.addPage([w, 400])
  }
  return await doc.save()
}

/** PDFの各ページの幅を配列で返す（小数点以下は丸める） */
export async function pageWidths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => Math.round(p.getWidth()))
}

/** PDFの各ページの高さを配列で返す（小数点以下は丸める） */
export async function pageHeights(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => Math.round(p.getHeight()))
}

/**
 * 試験用の 1×1 ドットの PNG 画像。
 * 「画像からページを作る」処理を確かめるためだけのもの（中身は透明1ドット）。
 */
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export function makeTestPng(): Uint8Array {
  return new Uint8Array(Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'))
}

export interface FeatureRichPdfSummary {
  title?: string
  outlineTargets: number[]
  outlineEntries: Array<{ title?: string; depth: number }>
  outlineCount?: number
  danglingOutlineCount: number
  internalLinkTargets: Array<{ from: number; to: number }>
  danglingInternalLinkCount: number
  externalLinks: string[]
  noteCount: number
  fieldNames: string[]
  fieldWidgetPages: Record<string, number[]>
  hasAttachment: boolean
  namedDestinationNames: string[]
  pageLabels: string[]
}

/**
 * ページ操作で失いたくない情報をまとめて持つ確認用PDFを作る。
 * ページ幅は A=101、B=102、C=103 とし、ページ内容の目印にも使う。
 */
export async function makeFeatureRichPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const pages = [101, 102, 103].map((width) => doc.addPage([width, 400]))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const image = await doc.embedPng(makeTestPng())

  pages.forEach((page, index) => {
    page.drawText(`PAGE-${index + 1}`, { x: 10, y: 360, size: 10, font })
    page.drawImage(image, { x: 10, y: 330, width: 8, height: 8 })
  })

  doc.setTitle('Feature-rich test PDF')
  doc.setAuthor('Netless PDF test')
  await doc.attach(new Uint8Array([65, 66, 67]), 'note.txt', {
    mimeType: 'text/plain',
    description: 'Test attachment',
  })

  const context = doc.context
  const addAnnotation = (pageIndex: number, values: Record<string, unknown>) => {
    const annotation = context.obj(values as any)
    pages[pageIndex].node.addAnnot(context.register(annotation))
  }

  addAnnotation(0, {
    Type: 'Annot', Subtype: 'Link', Rect: [5, 300, 45, 320], Border: [0, 0, 0],
    Dest: [pages[1].ref, 'Fit'],
  })
  addAnnotation(0, {
    Type: 'Annot', Subtype: 'Link', Rect: [50, 300, 90, 320], Border: [0, 0, 0],
    Dest: [pages[2].ref, 'Fit'],
  })
  addAnnotation(0, {
    Type: 'Annot', Subtype: 'Link', Rect: [5, 270, 90, 290], Border: [0, 0, 0],
    A: { S: 'URI', URI: PDFString.of('https://example.test/') },
  })
  addAnnotation(0, {
    Type: 'Annot', Subtype: 'Text', Rect: [5, 240, 25, 260],
    Contents: PDFString.of('Keep this note'),
  })

  const form = doc.getForm()
  const keptField = form.createTextField('kept-field')
  keptField.setText('keep')
  keptField.addToPage(pages[0], { x: 5, y: 200, width: 80, height: 20 })
  const removableField = form.createTextField('page-b-field')
  removableField.setText('remove with page B')
  removableField.addToPage(pages[1], { x: 5, y: 200, width: 80, height: 20 })
  removableField.acroField.getWidgets().forEach((widget) => widget.dict.delete(PDFName.of('P')))
  const multiPageField = form.createTextField('multi-page-field')
  multiPageField.setText('keep one widget')
  multiPageField.addToPage(pages[0], { x: 5, y: 170, width: 80, height: 20 })
  multiPageField.addToPage(pages[1], { x: 5, y: 170, width: 80, height: 20 })

  const names = context.obj({
    Dests: {
      Names: [PDFString.of('named-page-c'), [pages[2].ref, 'Fit']],
    },
  }) as PDFDict
  doc.catalog.set(PDFName.of('Names'), names)
  addAnnotation(0, {
    Type: 'Annot', Subtype: 'Link', Rect: [5, 210, 90, 230], Border: [0, 0, 0],
    Dest: PDFString.of('named-page-c'),
  })

  const outlines = context.obj({ Type: 'Outlines' }) as PDFDict
  const outlinesRef = context.register(outlines)
  const outlineB = context.obj({
    Title: PDFString.of('Page B'), Parent: outlinesRef, Dest: [pages[1].ref, 'Fit'],
  }) as PDFDict
  const outlineC = context.obj({
    Title: PDFString.of('Page C'), Parent: outlinesRef, Dest: PDFString.of('named-page-c'),
  }) as PDFDict
  const outlineBRef = context.register(outlineB)
  const outlineCRef = context.register(outlineC)
  outlineB.set(PDFName.of('Next'), outlineCRef)
  outlineC.set(PDFName.of('Prev'), outlineBRef)
  outlines.set(PDFName.of('First'), outlineBRef)
  outlines.set(PDFName.of('Last'), outlineCRef)
  outlines.set(PDFName.of('Count'), PDFNumber.of(2))
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef)

  doc.catalog.set(PDFName.of('PageLabels'), context.obj({
    Nums: [
      0, { P: PDFString.of('A') },
      1, { P: PDFString.of('B') },
      2, { P: PDFString.of('C') },
    ],
  }))

  return await doc.save()
}

/** ページ木の親から寸法・回転・描画部品を受け継ぐPDFを作る。 */
export async function makeInheritedPageAttributesPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const pages = [doc.addPage([100, 100]), doc.addPage([100, 100])]
  const root = doc.catalog.Pages()
  const rootRef = doc.context.getObjectRef(root)
  if (!rootRef) throw new Error('試験用PDFのページ木が見つかりません。')
  const branch = PDFPageTree.withContext(doc.context, rootRef)
  const branchRef = doc.context.register(branch)
  pages.forEach((page) => {
    page.node.set(PDFName.Parent, branchRef)
    branch.pushLeafNode(page.ref)
  })
  root.set(PDFName.of('Kids'), doc.context.obj([branchRef]))
  root.set(PDFName.of('Count'), PDFNumber.of(pages.length))
  branch.set(PDFName.MediaBox, doc.context.obj([0, 0, 321, 654]))
  branch.set(PDFName.Rotate, PDFNumber.of(90))
  branch.set(PDFName.Resources, doc.context.obj({}))
  pages.forEach((page) => {
    page.node.delete(PDFName.MediaBox)
    page.node.delete(PDFName.Rotate)
    page.node.delete(PDFName.Resources)
  })
  return await doc.save()
}

/** 削除対象を指す親しおりの下に、残るページを指す子しおりがあるPDFを作る。 */
export async function makeNestedOutlinePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const pages = [101, 102, 103].map((width) => doc.addPage([width, 400]))
  const context = doc.context
  const outlines = context.obj({ Type: 'Outlines' }) as PDFDict
  const outlinesRef = context.register(outlines)
  const parent = context.obj({
    Title: PDFString.of('Deleted parent'), Parent: outlinesRef, Dest: [pages[1].ref, 'Fit'],
  }) as PDFDict
  const parentRef = context.register(parent)
  const child = context.obj({
    Title: PDFString.of('Kept child'), Parent: parentRef, Dest: [pages[2].ref, 'Fit'],
  }) as PDFDict
  const childRef = context.register(child)
  parent.set(PDFName.of('First'), childRef)
  parent.set(PDFName.of('Last'), childRef)
  parent.set(PDFName.of('Count'), PDFNumber.of(1))
  outlines.set(PDFName.of('First'), parentRef)
  outlines.set(PDFName.of('Last'), parentRef)
  outlines.set(PDFName.of('Count'), PDFNumber.of(2))
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef)
  return await doc.save()
}

function decodePdfText(value: unknown): string | undefined {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText()
  return undefined
}

/** 確認用PDFに入れた情報が、操作後もどのページへ結び付いているかを読む。 */
export async function inspectFeatureRichPdf(bytes: Uint8Array): Promise<FeatureRichPdfSummary> {
  const doc = await PDFDocument.load(bytes)
  const context = doc.context
  const pages = doc.getPages()
  const pageIndexByRef = new Map(pages.map((page, index) => [page.ref.toString(), index]))

  const resolveNamedDestination = (name: string): unknown => {
    const legacy = doc.catalog.lookupMaybe(PDFName.of('Dests'), PDFDict)
    const legacyValue = legacy?.get(PDFName.of(name))
    if (legacyValue) return legacyValue

    const namesRoot = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict)
    const destinations = namesRoot?.lookupMaybe(PDFName.of('Dests'), PDFDict)
    const visit = (node: PDFDict | undefined): unknown => {
      if (!node) return undefined
      const pairs = node.lookupMaybe(PDFName.of('Names'), PDFArray)
      if (pairs) {
        for (let index = 0; index + 1 < pairs.size(); index += 2) {
          if (decodePdfText(pairs.get(index)) === name) return pairs.get(index + 1)
        }
      }
      const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray)
      if (kids) {
        for (let index = 0; index < kids.size(); index += 1) {
          const found = visit(context.lookupMaybe(kids.get(index), PDFDict))
          if (found) return found
        }
      }
      return undefined
    }
    return visit(destinations)
  }

  const targetPageIndex = (dest: unknown): number | undefined => {
    let resolved = context.lookup(dest as any)
    const name = decodePdfText(resolved)
      ?? (resolved instanceof PDFName ? resolved.decodeText() : undefined)
    if (name) resolved = context.lookup(resolveNamedDestination(name) as any)
    if (resolved instanceof PDFDict) resolved = context.lookup(resolved.get(PDFName.of('D')))
    const array = resolved instanceof PDFArray ? resolved : undefined
    if (!array || array.size() === 0) return undefined
    const ref = array.get(0)
    return ref instanceof PDFRef ? pageIndexByRef.get(ref.toString()) : undefined
  }

  const outlineTargets: number[] = []
  const outlineEntries: Array<{ title?: string; depth: number }> = []
  let danglingOutlineCount = 0
  const outlines = doc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict)
  const visited = new Set<string>()
  const visitOutlineChain = (first: unknown, depth = 0) => {
    let current = first
    while (current) {
      const key = current instanceof PDFRef ? current.toString() : String(current)
      if (visited.has(key)) return
      visited.add(key)
      const item = context.lookupMaybe(current as any, PDFDict)
      if (!item) return
      outlineEntries.push({ title: decodePdfText(item.get(PDFName.of('Title'))), depth })
      const dest = item.get(PDFName.of('Dest'))
      const target = targetPageIndex(dest)
      if (target !== undefined) outlineTargets.push(target)
      else if (dest) danglingOutlineCount += 1
      visitOutlineChain(item.get(PDFName.of('First')), depth + 1)
      current = item.get(PDFName.of('Next'))
    }
  }
  visitOutlineChain(outlines?.get(PDFName.of('First')))

  const internalLinkTargets: Array<{ from: number; to: number }> = []
  let danglingInternalLinkCount = 0
  const externalLinks: string[] = []
  let noteCount = 0
  pages.forEach((page, from) => {
    const annotations = page.node.Annots()
    if (!annotations) return
    for (let index = 0; index < annotations.size(); index += 1) {
      const annotation = context.lookupMaybe(annotations.get(index), PDFDict)
      if (!annotation) continue
      const subtype = annotation.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText()
      if (subtype === 'Text') noteCount += 1
      if (subtype !== 'Link') continue
      const dest = annotation.get(PDFName.of('Dest'))
      const target = targetPageIndex(dest)
      if (target !== undefined) internalLinkTargets.push({ from, to: target })
      else if (dest) danglingInternalLinkCount += 1
      const action = annotation.lookupMaybe(PDFName.of('A'), PDFDict)
      const uri = decodePdfText(action?.get(PDFName.of('URI')))
      if (uri) externalLinks.push(uri)
    }
  })

  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict)
  const embeddedFiles = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict)
  const attachmentNames = embeddedFiles?.lookupMaybe(PDFName.of('Names'), PDFArray)
  const namedDestinationNames: string[] = []
  const collectDestinationNames = (node: PDFDict | undefined) => {
    if (!node) return
    const pairs = node.lookupMaybe(PDFName.of('Names'), PDFArray)
    if (pairs) {
      for (let index = 0; index + 1 < pairs.size(); index += 2) {
        const name = decodePdfText(pairs.get(index))
        if (name) namedDestinationNames.push(name)
      }
    }
    const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray)
    if (kids) {
      for (let index = 0; index < kids.size(); index += 1) {
        collectDestinationNames(context.lookupMaybe(kids.get(index), PDFDict))
      }
    }
  }
  collectDestinationNames(names?.lookupMaybe(PDFName.of('Dests'), PDFDict))

  const annotationPageByRef = new Map<string, number>()
  pages.forEach((page, pageIndex) => {
    const annotations = page.node.Annots()
    if (!annotations) return
    for (let index = 0; index < annotations.size(); index += 1) {
      const ref = annotations.get(index)
      if (ref instanceof PDFRef) annotationPageByRef.set(ref.toString(), pageIndex)
    }
  })
  const fieldWidgetPages: Record<string, number[]> = {}
  doc.getForm().getFields().forEach((field) => {
    fieldWidgetPages[field.getName()] = field.acroField.getWidgets().flatMap((widget) => {
      const pageRef = widget.P()
      const directPage = pageRef ? pageIndexByRef.get(pageRef.toString()) : undefined
      if (directPage !== undefined) return [directPage]
      const widgetRef = context.getObjectRef(widget.dict)
      const fallbackPage = widgetRef ? annotationPageByRef.get(widgetRef.toString()) : undefined
      return fallbackPage === undefined ? [] : [fallbackPage]
    }).sort((left, right) => left - right)
  })

  const pageLabels: string[] = []
  const labels = doc.catalog.lookupMaybe(PDFName.of('PageLabels'), PDFDict)
  const nums = labels?.lookupMaybe(PDFName.of('Nums'), PDFArray)
  if (nums) {
    for (let index = 0; index + 1 < nums.size(); index += 2) {
      const pageIndex = nums.lookup(index, PDFNumber).asNumber()
      const spec = nums.lookup(index + 1, PDFDict)
      pageLabels[pageIndex] = decodePdfText(spec.get(PDFName.of('P'))) ?? ''
    }
  }

  return {
    title: doc.getTitle(),
    outlineTargets,
    outlineEntries,
    outlineCount: outlines?.lookupMaybe(PDFName.of('Count'), PDFNumber)?.asNumber(),
    danglingOutlineCount,
    internalLinkTargets,
    danglingInternalLinkCount,
    externalLinks,
    noteCount,
    fieldNames: doc.getForm().getFields().map((field) => field.getName()).sort(),
    fieldWidgetPages,
    hasAttachment: Boolean(attachmentNames && attachmentNames.size() >= 2),
    namedDestinationNames: namedDestinationNames.sort(),
    pageLabels,
  }
}
