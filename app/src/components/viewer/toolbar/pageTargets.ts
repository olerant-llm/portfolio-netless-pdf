/** 選んだページを、選んだ順ではなく元の並び順で返す（今の文書にないページは含めない） */
export const orderedTargets = (pageIds: string[], selected: Set<string>) =>
  pageIds.filter((id) => selected.has(id))

/** ちょうど1枚選んでいるときだけ、そのページ番号（1始まり）を返す */
export function singleSelectedPageNumber(pageIds: string[], selected: Set<string>): number | null {
  const targets = orderedTargets(pageIds, selected)
  return targets.length === 1 ? pageIds.indexOf(targets[0]) + 1 : null
}
