import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { ACTIVE_ROUTES } from '../src/appRoutes'

describe('利用者が入れる画面', () => {
  it('共通編集画面だけを入口にし、旧機能画面への経路を持たない', () => {
    expect(ACTIVE_ROUTES).toEqual(['/', '/viewer', '*'])

    const forbidden = [
      '/tools', '/merge', '/split', '/crop', '/insert-pages', '/protect', '/unlock',
      '/compress', '/pdf-to-image', '/rotate-pdf', '/pdf-to-text', '/rearrange-pdf',
      '/watermark', '/page-numbers', '/metadata', '/image-to-pdf', '/signature',
      '/repair', '/extract-images', '/grayscale',
    ]
    expect(ACTIVE_ROUTES.filter((path) => forbidden.includes(path))).toEqual([])
  })

  it('製品の起点は旧画面・クイック振り分け・受け渡し機能を読み込まない', async () => {
    const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
    const entry = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
    const app = await readFile(new URL('../src/ViewerApp.tsx', import.meta.url), 'utf8')
    const source = `${main}\n${entry}\n${app}`

    expect(main).toContain("./App.tsx")
    expect(entry).toContain("./ViewerApp")
    for (const forbidden of [
      'QuickDropModal', 'PipelineProvider', 'open-quick-drop',
      'WebView', 'components/tools/',
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })
})
