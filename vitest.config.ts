import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    fileParallelism: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://localhost/autopromo_test', APP_URL: 'https://app.test' },
  },
})
