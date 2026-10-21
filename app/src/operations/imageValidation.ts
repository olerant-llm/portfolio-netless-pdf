import { OperationError } from './types'

export type SupportedImageKind = 'png' | 'jpg'

export interface ValidatedImage {
  kind: SupportedImageKind
  width: number
  height: number
}

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 12_000
export const MAX_IMAGE_PIXELS = 40_000_000

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function startsWith(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value)
}

function readPngSize(bytes: Uint8Array) {
  if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function readJpegSize(bytes: Uint8Array) {
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ])
  let offset = 2
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) return null
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (offset + 1 >= bytes.length) return null
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) return null
    if (startOfFrame.has(marker)) {
      if (length < 7) return null
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      }
    }
    offset += length
  }
  return null
}

/** 拡張子や申告形式ではなく、画像の中身と大きさを確かめる。 */
export function validatePngOrJpeg(bytes: Uint8Array, name: string): ValidatedImage {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new OperationError(`「${name}」は20MBを超えています。20MB以下の画像を選んでください。`)
  }

  let kind: SupportedImageKind
  let size: { width: number, height: number } | null
  if (startsWith(bytes, PNG_HEADER)) {
    kind = 'png'
    size = readPngSize(bytes)
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    kind = 'jpg'
    size = readJpegSize(bytes)
  } else {
    throw new OperationError(
      `「${name}」は扱えない形式の画像です。PNG（.png）かJPEG（.jpg）の画像を選んでください。`,
    )
  }

  if (!size || size.width <= 0 || size.height <= 0) {
    throw new OperationError(`「${name}」を読み込めませんでした。別のPNGまたはJPEGを選んでください。`)
  }
  if (
    size.width > MAX_IMAGE_DIMENSION
    || size.height > MAX_IMAGE_DIMENSION
    || size.width * size.height > MAX_IMAGE_PIXELS
  ) {
    throw new OperationError(
      `「${name}」が大きすぎます。一辺12000ピクセル以下、4000万画素以下の画像を選んでください。`,
    )
  }

  return { kind, ...size }
}
