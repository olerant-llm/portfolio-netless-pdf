/**
 * PaperKnife - The Swiss Army Knife for PDFs
 * Copyright (C) 2026 potatameister
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { OperationError } from '../operations/types'
import { t } from '../i18n/ja'

/**
 * 失敗の中身を、そのまま画面に出してよい日本語にする。
 *
 * 操作が自分で理由を説明できる失敗（`OperationError`）は、その文言をそのまま使う。
 * それ以外は PDF の処理部品が内部で投げたもので、**中身は英語**なので見せない
 * （非エンジニアには読めず、「壊れた」という印象だけが残るため）。
 * 元の中身は呼び出し側が `console.error` に出しているので、調査には残る。
 *
 * この判定を1か所にまとめてあるのは、画面ごとに作法が割れるのを防ぐため。
 */
export function toUserMessage(err: unknown): string {
  return err instanceof OperationError ? err.message : t.errors.operationFailed
}
