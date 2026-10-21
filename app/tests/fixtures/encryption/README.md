# 暗号化PDFの確認資料

`@libpdf/core` 公式リポジトリの暗号化試験資料を、解除機能の互換性確認に使用する。
元資料はApache PDFBoxの試験資料から採録されたもの。
4つのPDFは取得後に変更していない。

| ファイル | 方式 | 確認用パスワード |
|---|---|---|
| `PasswordSample-40bit.pdf` | RC4 40-bit | 所有者用 `owner`、閲覧用 `user` |
| `PasswordSample-128bit.pdf` | RC4 128-bit | 所有者用 `owner`、閲覧用 `user` |
| `PasswordSample-256bit.pdf` | AES-256 | 所有者用 `owner`、閲覧用 `user` |
| `issue17069.pdf` | AES-128 | 閲覧用は空 |

- 取得元: <https://github.com/LibPDF-js/core/tree/main/fixtures/encryption>
- 取得元更新番号: `1d94de688bab5231f45e207d7af54046f71f80cb`
- 取得日: 2026-09-04
- LibPDF: MIT License
- Apache PDFBox: Apache License 2.0
- Apache PDFBox公式NOTICEの有無: あり（2026-09-04確認）
- ライセンス本文: [`third_party_licenses/Apache-2.0.txt`](third_party_licenses/Apache-2.0.txt)
- PDFBox NOTICE: [`third_party_licenses/PDFBox-NOTICE.txt`](third_party_licenses/PDFBox-NOTICE.txt)
- LibPDFライセンス本文: [`third_party_licenses/LibPDF-MIT.txt`](third_party_licenses/LibPDF-MIT.txt)
- NOTICE確認元: <https://github.com/apache/pdfbox/blob/trunk/NOTICE.txt>

## SHA-256

| ファイル | SHA-256 |
|---|---|
| `PasswordSample-40bit.pdf` | `7DAC5439BED47D4630866F2ACB75FD22386069649C2DCB88236C2ED5F020B05B` |
| `PasswordSample-128bit.pdf` | `1919480ABA35617D69A1F9E1DCE30BBE6864B3906D5C136FD7A8837826F9F750` |
| `PasswordSample-256bit.pdf` | `A2F0661092483478686D92891905D9E715C9783B45ECF26376D7119FE5AB4747` |
| `issue17069.pdf` | `338FA82E5D4EE20033967EAFB229D3B64A38EDD0465421592800165B94003DAC` |
