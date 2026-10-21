import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../src')

async function tsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  }))
  return nested.flat()
}

function unexplainedEnglish(value: string) {
  const allowed = /\b(?:PDF|PNG|JPEG|JPG|ZIP|TXT|MB|Ctrl|Shift|Del|AES|RC4|Tab|Escape)\b/gi
  return value.replace(allowed, '').replace(/[\s\d.,:;!?()\-_/+.・…（）「」『』]+/g, '')
}

describe('利用者が到達できる画面の日本語表示', () => {
  it('画面に直書きした英語の説明・ボタン・入力案内を残さない', async () => {
    const files = [
      resolve(root, 'main.tsx'),
      resolve(root, 'App.tsx'),
      resolve(root, 'ViewerApp.tsx'),
      resolve(root, 'ViewerLayout.tsx'),
      ...await tsxFiles(resolve(root, 'components/viewer')),
    ]
    const violations: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      const checks = [
        ...source.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)<\//g),
        ...source.matchAll(/(?:aria-label|placeholder|title)="([^"]*[A-Za-z][^"]*)"/g),
      ]
      for (const match of checks) {
        const text = match[1].trim()
        if (unexplainedEnglish(text)) violations.push(`${file}: ${text}`)
      }
    }

    expect(violations).toEqual([])
  })
})
