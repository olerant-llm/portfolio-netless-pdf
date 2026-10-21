import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import DigitalSignatureGuard from '../src/components/viewer/DigitalSignatureGuard'
import { t } from '../src/i18n/ja'

describe('DigitalSignatureGuard（電子署名の警告画面）', () => {
  it('署名がある場合に、失われるものと安全な選択肢を日本語で示す', () => {
    const html = renderToStaticMarkup(
      <DigitalSignatureGuard status="signed" onProceed={vi.fn()} onCancel={vi.fn()} />,
    )

    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain(t.viewer.digitalSignatureTitle)
    expect(html).toContain(t.viewer.digitalSignatureBody)
    expect(html).toContain(t.viewer.digitalSignatureProceed)
    expect(html).toContain(t.viewer.digitalSignatureCancel)
    expect(html).toContain('autofocus=""')
  })

  it('判定できない場合は、署名がある可能性を説明する', () => {
    const html = renderToStaticMarkup(
      <DigitalSignatureGuard status="unknown" onProceed={vi.fn()} onCancel={vi.fn()} />,
    )

    expect(html).toContain(t.viewer.digitalSignatureUnknownTitle)
    expect(html).toContain(t.viewer.digitalSignatureUnknownBody)
  })
})
