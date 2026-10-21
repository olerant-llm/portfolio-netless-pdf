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
 * ページID を作る。中身は何でもよく、重複しないことだけが条件。
 *
 * `documentSession.tsx` から切り出してある。ページを増やす操作
 * （`operations/addOp.ts`）もこれを使うが、操作は画面を知らない決まりなので、
 * React を読み込むファイルには置けないため。
 */
let pageIdCounter = 0

export const newPageId = () => `p${++pageIdCounter}`
