import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFPage,
  PDFRef,
  PDFString,
} from 'pdf-lib'

interface PageLabelState {
  pages: Array<PDFDict | undefined>
}

const DEST = PDFName.of('Dest')
const ACTION = PDFName.of('A')
const ACTION_DEST = PDFName.of('D')
const FIRST = PDFName.of('First')
const LAST = PDFName.of('Last')
const NEXT = PDFName.of('Next')
const PREV = PDFName.of('Prev')
const PARENT = PDFName.of('Parent')
const COUNT = PDFName.of('Count')
const KIDS = PDFName.of('Kids')
const NUMS = PDFName.of('Nums')
const PAGE_LABELS = PDFName.of('PageLabels')
const STYLE = PDFName.of('S')
const START = PDFName.of('St')
const NAMES = PDFName.of('Names')
const DESTINATIONS = PDFName.of('Dests')
const DESTINATION_VALUE = PDFName.of('D')

function resolveObject(doc: PDFDocument, value: PDFObject | undefined) {
  if (!value) return undefined
  return value instanceof PDFRef ? doc.context.lookup(value) : value
}

function decodeDestinationName(value: PDFObject | undefined) {
  const resolved = value
  if (resolved instanceof PDFString || resolved instanceof PDFHexString || resolved instanceof PDFName) {
    return resolved.decodeText()
  }
  return undefined
}

function findNameTreeValue(
  doc: PDFDocument,
  nodeValue: PDFObject | undefined,
  name: string,
  visited: Set<string>,
): PDFObject | undefined {
  const resolved = resolveObject(doc, nodeValue)
  if (!(resolved instanceof PDFDict)) return undefined

  const nodeRef = doc.context.getObjectRef(resolved)
  const key = nodeRef?.toString()
  if (key && visited.has(key)) return undefined
  if (key) visited.add(key)

  const pairsValue = resolveObject(doc, resolved.get(NAMES))
  if (pairsValue instanceof PDFArray) {
    for (let index = 0; index + 1 < pairsValue.size(); index += 2) {
      if (decodeDestinationName(resolveObject(doc, pairsValue.get(index))) === name) {
        return pairsValue.get(index + 1)
      }
    }
  }

  const kidsValue = resolveObject(doc, resolved.get(KIDS))
  if (kidsValue instanceof PDFArray) {
    for (let index = 0; index < kidsValue.size(); index += 1) {
      const found = findNameTreeValue(doc, kidsValue.get(index), name, visited)
      if (found) return found
    }
  }
  return undefined
}

function resolveNamedDestination(doc: PDFDocument, name: string) {
  const legacyValue = resolveObject(doc, doc.catalog.get(DESTINATIONS))
  if (legacyValue instanceof PDFDict) {
    const found = legacyValue.get(PDFName.of(name))
    if (found) return found
  }

  const namesRoot = resolveObject(doc, doc.catalog.get(NAMES))
  if (!(namesRoot instanceof PDFDict)) return undefined
  return findNameTreeValue(doc, namesRoot.get(DESTINATIONS), name, new Set())
}

function resolveDestinationArray(
  doc: PDFDocument,
  destination: PDFObject | undefined,
  visitedNames = new Set<string>(),
): PDFArray | undefined {
  const resolved = resolveObject(doc, destination)
  if (!resolved) return undefined
  if (resolved instanceof PDFArray) return resolved
  if (resolved instanceof PDFDict) {
    return resolveDestinationArray(doc, resolved.get(DESTINATION_VALUE), visitedNames)
  }

  const name = decodeDestinationName(resolved)
  if (!name || visitedNames.has(name)) return undefined
  visitedNames.add(name)
  return resolveDestinationArray(doc, resolveNamedDestination(doc, name), visitedNames)
}

function collectNumberTreeEntries(
  doc: PDFDocument,
  nodeValue: PDFObject | undefined,
  entries: Array<{ index: number; spec: PDFDict }>,
) {
  const node = doc.context.lookupMaybe(nodeValue, PDFDict)
  if (!node) return

  const nums = node.lookupMaybe(NUMS, PDFArray)
  if (nums) {
    for (let index = 0; index + 1 < nums.size(); index += 2) {
      const pageIndex = nums.lookupMaybe(index, PDFNumber)?.asNumber()
      const spec = nums.lookupMaybe(index + 1, PDFDict)
      if (pageIndex !== undefined && spec) entries.push({ index: pageIndex, spec })
    }
  }

  const kids = node.lookupMaybe(KIDS, PDFArray)
  if (!kids) return
  for (let index = 0; index < kids.size(); index += 1) {
    collectNumberTreeEntries(doc, kids.get(index), entries)
  }
}

/** ページラベルを、元の各ページに結び付いた形で控える。 */
export function capturePageLabels(doc: PDFDocument): PageLabelState | undefined {
  const rootValue = doc.catalog.get(PAGE_LABELS)
  if (!rootValue) return undefined

  const entries: Array<{ index: number; spec: PDFDict }> = []
  collectNumberTreeEntries(doc, rootValue, entries)
  entries.sort((left, right) => left.index - right.index)
  if (entries.length === 0) return undefined

  const pages: Array<PDFDict | undefined> = []
  for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
    let active: { index: number; spec: PDFDict } | undefined
    for (const entry of entries) {
      if (entry.index > pageIndex) break
      active = entry
    }

    if (!active) {
      pages.push(doc.context.obj({ S: 'D', St: pageIndex + 1 }) as PDFDict)
      continue
    }

    const spec = active.spec.clone(doc.context)
    if (spec.has(STYLE)) {
      const start = spec.lookupMaybe(START, PDFNumber)?.asNumber() ?? 1
      spec.set(START, PDFNumber.of(start + pageIndex - active.index))
    }
    pages.push(spec)
  }
  return { pages }
}

/** 控えておいたラベルを、新しいページ順へ付け直す。 */
export function restorePageLabels(
  doc: PDFDocument,
  state: PageLabelState | undefined,
  sourcePageIndices: number[],
) {
  if (!state) return
  const nums = PDFArray.withContext(doc.context)
  sourcePageIndices.forEach((sourceIndex, newIndex) => {
    const spec = state.pages[sourceIndex]
    if (!spec) return
    nums.push(PDFNumber.of(newIndex))
    nums.push(spec)
  })
  doc.catalog.set(PAGE_LABELS, doc.context.obj({ Nums: nums }))
}

/** 元のページオブジェクトを保ったまま、ページ木の並びだけを変える。 */
export function reorderPageTree(doc: PDFDocument, sourcePageIndices: number[]) {
  const originalPages = doc.getPages()
  const inheritablePageAttributes = [
    PDFName.Resources,
    PDFName.MediaBox,
    PDFName.CropBox,
    PDFName.Rotate,
  ]
  originalPages.forEach((page) => {
    inheritablePageAttributes.forEach((name) => {
      if (page.node.has(name)) return
      const inherited = page.node.getInheritableAttribute(name)
      if (inherited) page.node.set(name, inherited)
    })
  })
  for (let index = originalPages.length - 1; index >= 0; index -= 1) {
    doc.removePage(index)
  }
  sourcePageIndices.forEach((sourceIndex) => doc.addPage(originalPages[sourceIndex]))
}

function destinationTargetsRemoved(
  doc: PDFDocument,
  destination: PDFObject | undefined,
  removedPageRefs: Set<string>,
) {
  const array = resolveDestinationArray(doc, destination)
  if (!array || array.size() === 0) return false
  const pageRef = array.get(0)
  return pageRef instanceof PDFRef && removedPageRefs.has(pageRef.toString())
}

function dictionaryTargetsRemoved(
  doc: PDFDocument,
  dictionary: PDFDict,
  removedPageRefs: Set<string>,
) {
  if (destinationTargetsRemoved(doc, dictionary.get(DEST), removedPageRefs)) return true
  const action = dictionary.lookupMaybe(ACTION, PDFDict)
  return Boolean(action && destinationTargetsRemoved(doc, action.get(ACTION_DEST), removedPageRefs))
}

function pruneLinkAnnotations(doc: PDFDocument, removedPageRefs: Set<string>) {
  doc.getPages().forEach((page) => {
    if (removedPageRefs.has(page.ref.toString())) return
    const annotations = page.node.Annots()
    if (!annotations) return
    for (let index = annotations.size() - 1; index >= 0; index -= 1) {
      const annotation = doc.context.lookupMaybe(annotations.get(index), PDFDict)
      const subtype = annotation?.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText()
      if (annotation && subtype === 'Link' && dictionaryTargetsRemoved(doc, annotation, removedPageRefs)) {
        annotations.remove(index)
      }
    }
  })
}

function pruneFormFields(doc: PDFDocument, removedPageRefs: Set<string>) {
  const form = doc.getForm()
  const pagesByRef = new Map(doc.getPages().map((page) => [page.ref.toString(), page]))
  const annotationPageByRef = new Map<string, PDFPage>()
  doc.getPages().forEach((page) => {
    const annotations = page.node.Annots()
    if (!annotations) return
    for (let index = 0; index < annotations.size(); index += 1) {
      const annotationRef = annotations.get(index)
      if (annotationRef instanceof PDFRef) annotationPageByRef.set(annotationRef.toString(), page)
    }
  })

  for (const field of form.getFields()) {
    const widgets = field.acroField.getWidgets()
    const removedWidgetIndices = widgets
      .map((widget, index) => {
        const widgetRef = doc.context.getObjectRef(widget.dict)
        const ownerPage = widgetRef ? annotationPageByRef.get(widgetRef.toString()) : undefined
        return { index, pageRef: widget.P() ?? ownerPage?.ref }
      })
      .filter(({ pageRef }) => pageRef && removedPageRefs.has(pageRef.toString()))
      .map(({ index }) => index)

    if (removedWidgetIndices.length === 0) continue
    if (removedWidgetIndices.length === widgets.length) {
      form.removeField(field)
      continue
    }

    for (const index of [...removedWidgetIndices].sort((left, right) => right - left)) {
      const widget = widgets[index]
      const widgetRef = doc.context.getObjectRef(widget.dict)
      const pageRef = widget.P() ?? (widgetRef ? annotationPageByRef.get(widgetRef.toString())?.ref : undefined)
      const page = pageRef ? pagesByRef.get(pageRef.toString()) : undefined
      if (widgetRef) page?.node.removeAnnot(widgetRef)
      field.acroField.removeWidget(index)
      if (widgetRef) doc.context.delete(widgetRef)
    }
  }
}

function pruneNameTreeDestinations(
  doc: PDFDocument,
  nodeValue: PDFObject | undefined,
  removedPageRefs: Set<string>,
  visited: Set<string>,
) {
  const node = resolveObject(doc, nodeValue)
  if (!(node instanceof PDFDict)) return
  const nodeRef = doc.context.getObjectRef(node)
  const key = nodeRef?.toString()
  if (key && visited.has(key)) return
  if (key) visited.add(key)

  const pairs = resolveObject(doc, node.get(NAMES))
  if (pairs instanceof PDFArray) {
    for (let index = pairs.size() - 2; index >= 0; index -= 2) {
      if (destinationTargetsRemoved(doc, pairs.get(index + 1), removedPageRefs)) {
        pairs.remove(index + 1)
        pairs.remove(index)
      }
    }
  }

  const kids = resolveObject(doc, node.get(KIDS))
  if (!(kids instanceof PDFArray)) return
  for (let index = 0; index < kids.size(); index += 1) {
    pruneNameTreeDestinations(doc, kids.get(index), removedPageRefs, visited)
  }
}

function pruneNamedDestinations(doc: PDFDocument, removedPageRefs: Set<string>) {
  const legacy = resolveObject(doc, doc.catalog.get(DESTINATIONS))
  if (legacy instanceof PDFDict) {
    legacy.entries().forEach(([name, destination]) => {
      if (destinationTargetsRemoved(doc, destination, removedPageRefs)) legacy.delete(name)
    })
  }

  const namesRoot = resolveObject(doc, doc.catalog.get(NAMES))
  if (namesRoot instanceof PDFDict) {
    pruneNameTreeDestinations(doc, namesRoot.get(DESTINATIONS), removedPageRefs, new Set())
  }
}

interface OutlineChainResult {
  entries: OutlineEntry[]
  refs: PDFRef[]
  nodeCount: number
}

interface OutlineEntry {
  ref: PDFRef
  item: PDFDict
  descendants: number
}

function pruneOutlineChain(
  doc: PDFDocument,
  firstValue: PDFObject | undefined,
  parentRef: PDFRef,
  removedPageRefs: Set<string>,
  visited: Set<string>,
): OutlineChainResult {
  const kept: OutlineEntry[] = []
  let currentValue = firstValue

  while (currentValue) {
    const item = doc.context.lookupMaybe(currentValue, PDFDict)
    if (!item) break
    const itemRef = currentValue instanceof PDFRef
      ? currentValue
      : doc.context.getObjectRef(item) ?? doc.context.register(item)
    const key = itemRef.toString()
    if (visited.has(key)) break
    visited.add(key)

    const originalNext = item.get(NEXT)
    const children = pruneOutlineChain(
      doc,
      item.get(FIRST),
      itemRef,
      removedPageRefs,
      visited,
    )

    if (children.refs.length > 0) {
      item.set(FIRST, children.refs[0])
      item.set(LAST, children.refs[children.refs.length - 1])
      const oldCount = item.lookupMaybe(COUNT, PDFNumber)?.asNumber() ?? children.nodeCount
      item.set(COUNT, PDFNumber.of(oldCount < 0 ? -children.nodeCount : children.nodeCount))
    } else {
      item.delete(FIRST)
      item.delete(LAST)
      item.delete(COUNT)
    }

    const removedTarget = dictionaryTargetsRemoved(doc, item, removedPageRefs)
    if (removedTarget) {
      item.delete(DEST)
      const action = item.lookupMaybe(ACTION, PDFDict)
      if (action && destinationTargetsRemoved(doc, action.get(ACTION_DEST), removedPageRefs)) {
        item.delete(ACTION)
      }
    }

    if (!removedTarget) {
      kept.push({ ref: itemRef, item, descendants: children.nodeCount })
    } else if (children.entries.length > 0) {
      kept.push(...children.entries)
      doc.context.delete(itemRef)
    } else {
      doc.context.delete(itemRef)
    }
    currentValue = originalNext
  }

  kept.forEach(({ item }, index) => {
    item.set(PARENT, parentRef)
    if (index > 0) item.set(PREV, kept[index - 1].ref)
    else item.delete(PREV)
    if (index + 1 < kept.length) item.set(NEXT, kept[index + 1].ref)
    else item.delete(NEXT)
  })

  return {
    entries: kept,
    refs: kept.map(({ ref }) => ref),
    nodeCount: kept.reduce((total, { descendants }) => total + 1 + descendants, 0),
  }
}

function pruneOutlines(doc: PDFDocument, removedPageRefs: Set<string>) {
  const outlinesValue = doc.catalog.get(PDFName.of('Outlines'))
  const outlines = doc.context.lookupMaybe(outlinesValue, PDFDict)
  if (!outlines || !outlinesValue) return
  const outlinesRef = outlinesValue instanceof PDFRef
    ? outlinesValue
    : doc.context.getObjectRef(outlines) ?? doc.context.register(outlines)
  const result = pruneOutlineChain(
    doc,
    outlines.get(FIRST),
    outlinesRef,
    removedPageRefs,
    new Set(),
  )
  if (result.refs.length === 0) {
    doc.catalog.delete(PDFName.of('Outlines'))
    doc.context.delete(outlinesRef)
    return
  }
  outlines.set(FIRST, result.refs[0])
  outlines.set(LAST, result.refs[result.refs.length - 1])
  outlines.set(COUNT, PDFNumber.of(result.nodeCount))
}

/** ページを消す前に、消えるページだけを指す情報を安全に取り除く。 */
export function pruneDeletedPageReferences(doc: PDFDocument, pageIndices: number[]) {
  const pages = doc.getPages()
  const removedPageRefs = new Set(pageIndices.map((index) => pages[index].ref.toString()))
  pruneLinkAnnotations(doc, removedPageRefs)
  pruneFormFields(doc, removedPageRefs)
  pruneOutlines(doc, removedPageRefs)
  pruneNamedDestinations(doc, removedPageRefs)
}

function directDestinationPageIndex(
  doc: PDFDocument,
  destination: PDFObject | undefined,
  pageIndexByRef: Map<string, number>,
) {
  const array = resolveDestinationArray(doc, destination)
  if (!array || array.size() === 0) return undefined
  const pageRef = array.get(0)
  return pageRef instanceof PDFRef ? pageIndexByRef.get(pageRef.toString()) : undefined
}

/**
 * 別PDFからページを複製したとき、pdf-lib が注釈内に残す「複製前のページ参照」を、
 * 実際に差し込むページの参照へ結び直す。
 */
export function repairCopiedPageLinks(
  sourceDoc: PDFDocument,
  sourcePageIndices: number[],
  copiedPages: PDFPage[],
  targetDoc: PDFDocument,
) {
  const sourcePages = sourceDoc.getPages()
  const sourceIndexByRef = new Map(sourcePages.map((page, index) => [page.ref.toString(), index]))
  const copiedRefBySourceIndex = new Map(
    sourcePageIndices.map((sourceIndex, index) => [sourceIndex, copiedPages[index].ref]),
  )

  sourcePageIndices.forEach((sourcePageIndex, copiedPageIndex) => {
    const sourceAnnotations = sourcePages[sourcePageIndex].node.Annots()
    const copiedAnnotations = copiedPages[copiedPageIndex].node.Annots()
    if (!sourceAnnotations || !copiedAnnotations) return

    const removeCopiedAnnotationIndices: number[] = []
    const count = Math.min(sourceAnnotations.size(), copiedAnnotations.size())
    for (let annotationIndex = 0; annotationIndex < count; annotationIndex += 1) {
      const sourceAnnotation = sourceDoc.context.lookupMaybe(
        sourceAnnotations.get(annotationIndex),
        PDFDict,
      )
      const copiedAnnotation = targetDoc.context.lookupMaybe(
        copiedAnnotations.get(annotationIndex),
        PDFDict,
      )
      const subtype = sourceAnnotation
        ?.lookupMaybe(PDFName.of('Subtype'), PDFName)
        ?.decodeText()
      if (!sourceAnnotation || !copiedAnnotation || subtype !== 'Link') continue

      const sourceAction = sourceAnnotation.lookupMaybe(ACTION, PDFDict)
      const copiedAction = copiedAnnotation.lookupMaybe(ACTION, PDFDict)
      const sourceDestination = sourceAnnotation.get(DEST) ?? sourceAction?.get(ACTION_DEST)
      if (!sourceDestination) continue

      const targetSourceIndex = directDestinationPageIndex(
        sourceDoc,
        sourceDestination,
        sourceIndexByRef,
      )
      const targetRef = targetSourceIndex === undefined
        ? undefined
        : copiedRefBySourceIndex.get(targetSourceIndex)
      if (!targetRef) {
        removeCopiedAnnotationIndices.push(annotationIndex)
        continue
      }

      const resolvedSourceDestination = resolveDestinationArray(sourceDoc, sourceDestination)
      if (!resolvedSourceDestination) {
        removeCopiedAnnotationIndices.push(annotationIndex)
        continue
      }

      const rewrittenDestination = PDFArray.withContext(targetDoc.context)
      rewrittenDestination.push(targetRef)
      for (let index = 1; index < resolvedSourceDestination.size(); index += 1) {
        rewrittenDestination.push(resolvedSourceDestination.get(index).clone(targetDoc.context))
      }

      if (copiedAnnotation.has(DEST) || !copiedAction) {
        copiedAnnotation.set(DEST, rewrittenDestination)
      } else {
        copiedAction.set(ACTION_DEST, rewrittenDestination)
      }
    }

    removeCopiedAnnotationIndices
      .sort((left, right) => right - left)
      .forEach((index) => copiedAnnotations.remove(index))
  })
}
