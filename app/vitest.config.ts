import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // PDF処理は画面を使わないので、ブラウザなしの環境（node）で走らせる
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
