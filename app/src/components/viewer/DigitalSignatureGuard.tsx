import { DigitalSignatureStatus } from '../../document/digitalSignature'
import { t } from '../../i18n/ja'
import ConfirmGuard from './ConfirmGuard'

interface DigitalSignatureGuardProps {
  status: Exclude<DigitalSignatureStatus, 'none'>
  onProceed: () => void
  onCancel: () => void
}

/** 電子署名を壊し得る最初の編集だけを止め、利用者の判断を待つ小窓。 */
export default function DigitalSignatureGuard({
  status, onProceed, onCancel,
}: DigitalSignatureGuardProps) {
  return (
    <ConfirmGuard
      title={status === 'signed'
        ? t.viewer.digitalSignatureTitle
        : t.viewer.digitalSignatureUnknownTitle}
      body={status === 'signed'
        ? t.viewer.digitalSignatureBody
        : t.viewer.digitalSignatureUnknownBody}
      proceedLabel={t.viewer.digitalSignatureProceed}
      cancelLabel={t.viewer.digitalSignatureCancel}
      onProceed={onProceed}
      onCancel={onCancel}
    />
  )
}
