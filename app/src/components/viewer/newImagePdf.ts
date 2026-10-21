import { validateImagesForPdf, type ImageInput } from '../../operations/addOp'

export interface ImageFileLike {
  name: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

export interface ImageDraft extends ImageInput {
  id: string
  previewUrl: string
}

let nextImageId = 0

function imageId() {
  nextImageId += 1
  return `new-image-${nextImageId}`
}

/** 選んだ順に読み込み、全画像が安全と分かってから見本用URLを作る。 */
export async function appendImageFiles(
  current: ImageDraft[],
  files: readonly ImageFileLike[],
  createPreview: (file: ImageFileLike, bytes: Uint8Array) => string,
): Promise<ImageDraft[]> {
  const loaded: Array<{ file: ImageFileLike, bytes: Uint8Array }> = []
  for (const file of files) {
    loaded.push({ file, bytes: new Uint8Array(await file.arrayBuffer()) })
  }

  const inputs = [
    ...current.map(({ name, bytes }) => ({ name, bytes })),
    ...loaded.map(({ file, bytes }) => ({ name: file.name, bytes })),
  ]
  validateImagesForPdf(inputs)

  const added = loaded.map(({ file, bytes }) => ({
    id: imageId(),
    name: file.name,
    bytes,
    previewUrl: createPreview(file, bytes),
  }))
  return [...current, ...added]
}

/** 掴んだ画像を、指定した画像の位置へ移す。 */
export function moveImageDraft(images: ImageDraft[], activeId: string, overId: string) {
  const from = images.findIndex((image) => image.id === activeId)
  const to = images.findIndex((image) => image.id === overId)
  if (from < 0 || to < 0 || from === to) return images

  const next = [...images]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
