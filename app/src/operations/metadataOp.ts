/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import {
  PDFArray,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFRawStream,
  PDFRef,
  PDFString,
} from 'pdf-lib'

import { OperationError, OperationInput, OperationResult } from './types'

export interface MetadataValues {
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
}

export interface MetadataSnapshot extends MetadataValues {
  creationDate?: string
  modificationDate?: string
}

const INFO_FIELDS: Array<[keyof MetadataValues, string]> = [
  ['title', 'Title'],
  ['author', 'Author'],
  ['subject', 'Subject'],
  ['keywords', 'Keywords'],
  ['creator', 'Creator'],
  ['producer', 'Producer'],
]

function readText(read: () => string | undefined): string {
  try {
    return read() ?? ''
  } catch {
    return ''
  }
}

function readDate(read: () => Date | undefined): string | undefined {
  try {
    return read()?.toISOString()
  } catch {
    return undefined
  }
}

/** 画面へ表示する現在の文書情報を読む。読みづらい壊れた項目だけは空欄にする。 */
export async function inspectMetadata(bytes: Uint8Array): Promise<MetadataSnapshot> {
  const pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false })
  return {
    title: readText(() => pdf.getTitle()),
    author: readText(() => pdf.getAuthor()),
    subject: readText(() => pdf.getSubject()),
    keywords: readText(() => pdf.getKeywords()),
    creator: readText(() => pdf.getCreator()),
    producer: readText(() => pdf.getProducer()),
    creationDate: readDate(() => pdf.getCreationDate()),
    modificationDate: readDate(() => pdf.getModificationDate()),
  }
}

function loadAndCheck(input: OperationInput) {
  return PDFDocument.load(input.bytes.slice(), { updateMetadata: false }).then((pdf) => {
    if (pdf.getPageCount() !== input.pageIds.length) {
      throw new OperationError('PDFのページ数と画面のページ情報が一致しません。変更を取り消しました。')
    }
    return pdf
  })
}

function getOrCreateInfo(pdf: PDFDocument): PDFDict {
  const current = pdf.context.lookupMaybe(pdf.context.trailerInfo.Info, PDFDict)
  if (current) return current
  const created = pdf.context.obj({}) as PDFDict
  pdf.context.trailerInfo.Info = pdf.context.register(created)
  return created
}

/** 題名など、利用者が指定した6項目だけを変更する。 */
export async function updateMetadataOperation(
  input: OperationInput,
  values: MetadataValues,
): Promise<OperationResult> {
  const pdf = await loadAndCheck(input)
  const info = getOrCreateInfo(pdf)

  INFO_FIELDS.forEach(([field, pdfKey]) => {
    const key = PDFName.of(pdfKey)
    const value = values[field]
    if (value === '') info.delete(key)
    else info.set(key, PDFHexString.fromText(value))
  })

  return {
    bytes: await pdf.save(),
    pageIds: [...input.pageIds],
    invalidated: [],
  }
}

/** 文書情報の枝にある文字や埋め込みデータを空にする。 */
function scrubMetadataObject(context: PDFContext, value: unknown, visited: Set<string>) {
  if (value instanceof PDFRef) {
    const key = value.toString()
    if (visited.has(key)) return
    visited.add(key)
    const object = context.lookup(value)
    if (object instanceof PDFString || object instanceof PDFHexString) {
      context.assign(value, PDFHexString.fromText(''))
      return
    }
    if (object instanceof PDFRawStream) {
      context.assign(value, context.stream(new Uint8Array()))
      return
    }
    scrubMetadataObject(context, object, visited)
    return
  }

  if (value instanceof PDFDict) {
    for (const key of value.keys()) {
      scrubMetadataObject(context, value.get(key), visited)
      value.delete(key)
    }
    return
  }

  if (value instanceof PDFArray) {
    for (let index = 0; index < value.size(); index += 1) {
      scrubMetadataObject(context, value.get(index), visited)
      value.set(index, PDFNull)
    }
  }
}

function removeCatalogMetadata(pdf: PDFDocument, name: string, visited: Set<string>) {
  const key = PDFName.of(name)
  scrubMetadataObject(pdf.context, pdf.catalog.get(key), visited)
  pdf.catalog.delete(key)
}

/**
 * 個人名や作成環境が残り得る文書情報を消す。
 * ページやしおりなどはコピーし直さず、元の文書構造をそのまま保つ。
 */
export async function removePersonalMetadataOperation(
  input: OperationInput,
): Promise<OperationResult> {
  const pdf = await loadAndCheck(input)
  const visited = new Set<string>()
  scrubMetadataObject(pdf.context, pdf.context.trailerInfo.Info, visited)
  removeCatalogMetadata(pdf, 'Metadata', visited)
  removeCatalogMetadata(pdf, 'PieceInfo', visited)
  pdf.catalog.delete(PDFName.of('LastModified'))
  scrubMetadataObject(pdf.context, pdf.context.trailerInfo.ID, visited)
  pdf.context.trailerInfo.ID = undefined

  return {
    bytes: await pdf.save(),
    pageIds: [...input.pageIds],
    invalidated: [],
  }
}
