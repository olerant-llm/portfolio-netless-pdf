/** 右クリックしたページが選択に入っていなければ、そのページ1枚の選択に変える */
export const selectionForContextMenu = (selected: Set<string>, pageId: string) =>
  (selected.has(pageId) ? selected : new Set([pageId]))
