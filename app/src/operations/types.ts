/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * すべての「操作」が守る共通の形。
 *
 * 操作は画面を知らない。データとページIDを受け取り、新しいデータとページIDを返すだけ。
 * こうしておくと自動テストで確かめられ、画面のほうは操作の種類を意識せずに済む。
 */

/** 操作の結果 */
export interface OperationResult {
  /** 操作後のPDFデータ */
  bytes: Uint8Array
  /** 操作後のページの並び（ページID）。長さ = 操作後のページ数 */
  pageIds: string[]
  /**
   * 絵を描き直す必要があるページID。
   * 並べ替えのように「見た目が変わらない」操作では空配列にする。
   * ここを正しく申告しないと、古い絵が残るか、無駄に全部描き直すことになる。
   */
  invalidated: string[]
}

/** 操作に渡される、今の状態 */
export interface OperationInput {
  bytes: Uint8Array
  pageIds: string[]
}

/**
 * 操作が「理由を日本語で説明できる」形で失敗したときに投げるもの。
 *
 * **画面はこの中身をそのまま出してよい。** 逆に、これ以外の失敗（PDFの処理部品が
 * 内部で投げるもの）は英語なので、そのまま出すと非エンジニアには読めない。
 * 見分けがつくようにするために、わざわざ別の型にしてある。
 */
export class OperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OperationError'
  }
}
