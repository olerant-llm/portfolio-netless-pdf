import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib'

/** 英数字と記号（ASCII）以外が含まれるか */
export function needsJapaneseFont(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(text)
}

/**
 * 文字の中身に合った書体をPDFに埋め込んで返す。
 * 日本語が含まれるときだけ、同梱の日本語書体を使う
 * （常に使うとPDFのファイルサイズが無駄に増えるため）。
 */
export async function embedTextFont(
  doc: PDFDocument,
  text: string,
  bold: boolean = false
): Promise<PDFFont> {
  if (!needsJapaneseFont(text)) {
    return doc.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica)
  }

  doc.registerFontkit(fontkit)
  const res = await fetch('./fonts/NotoSansJP-Regular.otf')
  if (!res.ok) {
    throw new Error('日本語の書体ファイルが見つかりませんでした。')
  }
  const bytes = await res.arrayBuffer()
  // subset: true = 使った文字だけ埋め込む。PDFが軽くなる
  return doc.embedFont(bytes, { subset: true })
}
